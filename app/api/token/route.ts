import { NextRequest, NextResponse } from 'next/server';
import { checkTokenLimits, ipOf, visitorKey } from '@/lib/agent/limits';
import { readToken, tokenFacts } from '@/lib/agent/token';

/**
 * Reading a token from the chain, without a model in the way.
 *
 * Separate from /api/wick on purpose: this costs an rpc call rather than model
 * tokens, so the widget can show the figures immediately and only spend on a
 * reply when the visitor actually asks Wick about them. It also means the
 * numbers on screen are the numbers, not a paraphrase of them.
 *
 * Facts only. No score, no verdict, no flags, nothing that reads as a
 * recommendation — see tokenFacts, which is the entire vocabulary of what this
 * project will say about somebody else's token.
 */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const address = new URL(req.url).searchParams.get('address') || '';
  if (!/^0x[0-9a-fA-F]{40}$/.test(address.trim())) {
    return NextResponse.json({ error: 'that is not an address on this chain' }, { status: 400 });
  }

  const visitor = await visitorKey(ipOf(req.headers));
  const verdict = await checkTokenLimits(visitor);
  if (!verdict.allowed) {
    return NextResponse.json(
      { error: 'slower' },
      { status: 429, headers: { 'retry-after': String(verdict.retryAfterSec ?? 60) } },
    );
  }

  const rpc = process.env.CHAIN_RPC_URL;
  if (!rpc) {
    return NextResponse.json(
      { error: 'the chain cannot be read from here yet', note: 'CHAIN_RPC_URL is not set' },
      { status: 503 },
    );
  }

  const report = await readToken(rpc, address);
  return NextResponse.json({ report, facts: tokenFacts(report) });
}
