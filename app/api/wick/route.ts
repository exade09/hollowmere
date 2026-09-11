import { NextRequest, NextResponse } from 'next/server';
import { ChatTurn, reply } from '@/lib/agent/chat';
import { checkChatLimits, ipOf, visitorKey } from '@/lib/agent/limits';
import { getProvider } from '@/lib/agent/provider';
import { readToken } from '@/lib/agent/token';

/**
 * Speaking to Wick.
 *
 * The one endpoint in this project where a stranger can spend the project's
 * money, so it is the one with limits in front of it. Three of them, checked
 * before the model is touched at all: per visitor per minute, per visitor per
 * day, and a ceiling across everyone per day.
 *
 * If the visitor's message contains an address, the chain is read first and
 * the figures are handed to Wick as the only ones he may state. He will not
 * judge them — that rule is enforced after the fact in auditReply, not just
 * asked for in the prompt.
 *
 * History comes from the client, which means it cannot be trusted as a record
 * of anything. That is fine: it is only there to make a conversation feel
 * continuous, it is capped, and it is fenced as speech like the rest.
 */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_MESSAGE = 600;
const ADDRESS = /0x[0-9a-fA-F]{40}/;

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

  // An address in the message turns this into a reading.
  let token = null;
  const found = message.match(ADDRESS);
  const rpc = process.env.CHAIN_RPC_URL;
  if (found && rpc) {
    token = await readToken(rpc, found[0]);
  } else if (found && !rpc) {
    return NextResponse.json({
      text: 'i cannot see the chain from here tonight.\n\nthe stone is quiet',
      note: 'CHAIN_RPC_URL is not set',
    });
  }

  try {
    const provider = getProvider();
    const out = await reply(provider, history, { message, token });
    return NextResponse.json({
      text: out.text,
      ...(token ? { read: { address: token.address, symbol: token.symbol, ok: token.ok } } : {}),
      ...(out.withheld ? { withheld: out.withheld } : {}),
    });
  } catch (e) {
    // A model failure should not look like a broken site.
    return NextResponse.json(
      { text: 'not tonight.\n\nthe words will not come', error: String(e).slice(0, 200) },
      { status: 200 },
    );
  }
}
