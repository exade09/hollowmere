import { NextRequest, NextResponse } from 'next/server';
import { assessToken, assessWallet } from '@/lib/agent/assess';
import { ChatTurn, fallbackReply, reply } from '@/lib/agent/chat';
import { checkChatLimits, ipOf, visitorKey } from '@/lib/agent/limits';
import { getProvider } from '@/lib/agent/provider';
import { readToken } from '@/lib/agent/token';
import { deepenPositions, readWallet } from '@/lib/agent/wallet';

/**
 * Speaking to Wick.
 *
 * The one endpoint in this project where a stranger can spend the project's
 * money, so it is the one with limits in front of it. Three of them, checked
 * before the model is touched at all: per visitor per minute, per visitor per
 * day, and a ceiling across everyone per day.
 *
 * If the visitor's message contains an address, the chain is read first and
 * the figures are handed to Wick as the only ones he may state. An address
 * with code behind it is read as a token; one with none is read as a wallet,
 * with its positions. He will not judge either of them — that rule is
 * enforced after the fact in auditReply, not just asked for in the prompt.
 *
 * History comes from the client, which means it cannot be trusted as a record
 * of anything. That is fine: it is only there to make a conversation feel
 * continuous, it is capped, and it is fenced as speech like the rest.
 */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_MESSAGE = 600;
const ADDRESS = /0x[0-9a-fA-F]{40}/;
const WALLET_INTENT = /\b(wallet|portfolio|holdings?|bags?)\b/i;

function providerFailureCode(error: unknown): string {
  const message = String(error);
  if (/no credits|insufficient_quota|billing/i.test(message)) {
    return 'AI_CREDITS_EXHAUSTED';
  }
  if (/API_KEY is missing|unknown AI_PROVIDER/i.test(message)) return 'AI_NOT_CONFIGURED';
  if (/abort|timeout/i.test(message)) return 'AI_TIMEOUT';
  if (/openai 429|anthropic 429/i.test(message)) return 'AI_RATE_LIMITED';
  return 'AI_UNAVAILABLE';
}

export async function POST(req: NextRequest) {
  let body: { message?: string; history?: ChatTurn[] };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: 'body must be json' }, { status: 400 });
  }

  const message = String(body.message || '').slice(0, MAX_MESSAGE).trim();
  if (!message) return NextResponse.json({ error: 'say something' }, { status: 400 });

  const visitor = await visitorKey(ipOf(req.headers));
  const verdict = await checkChatLimits(visitor);
  if (!verdict.allowed) {
    return NextResponse.json(
      {
        // Even the refusal stays in character. A raw 429 in the middle of a
        // room like this reads as a broken page rather than a closed door.
        text:
          verdict.which === 'global'
            ? 'the fire is low tonight.\n\ncome back tomorrow and i will talk'
            : 'slower.\n\ni have been here a long time and i am not going anywhere',
        limited: verdict.which,
      },
      { status: 429, headers: { 'retry-after': String(verdict.retryAfterSec ?? 60) } },
    );
  }

  // Only well-formed history, only the roles we expect, only recent turns.
  const history: ChatTurn[] = Array.isArray(body.history)
    ? body.history
        .filter(
          (t): t is ChatTurn =>
            !!t &&
            (t.role === 'user' || t.role === 'assistant') &&
            typeof t.content === 'string',
        )
        .slice(-6)
        .map((t) => ({ role: t.role, content: t.content.slice(0, MAX_MESSAGE) }))
    : [];

  // An address in the message turns this into a reading. Which kind of reading
  // is decided by the chain rather than guessed from the message: the token
  // reader answers first, and an address with no code deployed at it is not a
  // token at all but somebody's wallet, so it is read as one. That way "what
  // is this" and "what am I holding" are the same gesture — paste an address —
  // and the visitor never has to know which button they were supposed to press.
  let token = null;
  let wallet = null;
  let assessment = null;
  let walletAssessment = null;
  const found = message.match(ADDRESS);
  const rpc = process.env.CHAIN_RPC_URL;
  if (found && rpc) {
    if (WALLET_INTENT.test(message)) {
      wallet = await readWallet(rpc, found[0]);
      walletAssessment = assessWallet(wallet, await deepenPositions(rpc, wallet));
    } else {
      token = await readToken(rpc, found[0]);
      if (token.notAContract) {
        wallet = await readWallet(rpc, found[0]);
        token = null;
        walletAssessment = assessWallet(wallet, await deepenPositions(rpc, wallet));
      } else {
        assessment = assessToken(token);
      }
    }
  } else if (found && !rpc) {
    return NextResponse.json({
      text: 'i cannot see the chain from here tonight.\n\nthe stone is quiet',
      note: 'CHAIN_RPC_URL is not set',
    });
  }

  const reading = token
    ? { address: token.address, symbol: token.symbol, kind: 'token' as const, ok: token.ok }
    : wallet
      ? {
          address: wallet.address,
          kind: 'wallet' as const,
          positions: wallet.positions?.length ?? 0,
          ok: wallet.ok,
        }
      : undefined;
  const input = {
    message,
    token,
    wallet,
    assessment,
    walletAssessment,
  };

  try {
    const provider = getProvider();
    const out = await reply(provider, history, input);
    return NextResponse.json({
      text: out.text,
      ...(reading ? { read: reading } : {}),
      ...(out.withheld ? { withheld: out.withheld } : {}),
    });
  } catch (e) {
    const error = providerFailureCode(e);
    console.warn(`[wick] provider unavailable: ${error}`);
    return NextResponse.json({
      text: fallbackReply(input),
      ...(reading ? { read: reading } : {}),
      degraded: true,
      error,
    });
  }
}
