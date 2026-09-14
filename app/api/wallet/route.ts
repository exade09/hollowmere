import { NextRequest, NextResponse } from 'next/server';
import { checkWalletLimits, ipOf, visitorKey } from '@/lib/agent/limits';
import { readWallet, walletFacts } from '@/lib/agent/wallet';

/**
 * Reading a wallet from the chain, without a model in the way.
 *
 * The same split as /api/token and for the same reason: this costs rpc calls,
 * not model tokens, so the figures can appear the moment an address is pasted
 * and the project only pays for words when the visitor actually asks Wick to
 * say something about them.
 *
 * Only an address goes in. Nothing is signed, nothing is stored, and the
 * address is not written anywhere: the reading happens and the response is the
 * end of it. A public address on a public chain is public, but there is still
 * no reason for this project to keep a list of who pasted what.
 */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const address = new URL(req.url).searchParams.get('address') || '';
  if (!/^0x[0-9a-fA-F]{40}$/.test(address.trim())) {
    return NextResponse.json({ error: 'that is not an address on this chain' }, { status: 400 });
  }

  const visitor = await visitorKey(ipOf(req.headers));
  const verdict = await checkWalletLimits(visitor);
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

  const report = await readWallet(rpc, address);
  return NextResponse.json({ report, facts: walletFacts(report) });
}
