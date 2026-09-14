import { NextRequest, NextResponse } from 'next/server';
import { assessWallet } from '@/lib/agent/assess';
import { checkWalletLimits, ipOf, visitorKey } from '@/lib/agent/limits';
import { deepenPositions, readWallet, walletFacts } from '@/lib/agent/wallet';

/**
 * Reading a wallet from the chain, without a model in the way.
 *
 * The same split as /api/token and for the same reason: this costs rpc calls,
 * not model tokens, so the figures can appear the moment an address is pasted
 * and the project only pays for words when the visitor actually asks Wick to
 * say something about them.
 *
 * Two passes. The first is balances: what is held, and how much. The second
 * opens up the largest few — ownership, upgrade slot, code size, the owner's
 * own share — because a balance alone does not tell somebody what they are
 * holding, and those are the properties that decide whether it can be taken
 * from them. Pass `?deep=0` for balances only.
 *
 * What comes back describes mechanisms and never grades them. There is no
 * score in this response and no verdict: see lib/agent/assess.ts, where that
 * line is drawn and argued.
 *
 * Only an address goes in. Nothing is signed, nothing is stored, and the
 * address is not written anywhere: the reading happens and the response is the
 * end of it. A public address on a public chain is public, but there is still
 * no reason for this project to keep a list of who pasted what.
 */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const address = url.searchParams.get('address') || '';
  const deepWanted = url.searchParams.get('deep') !== '0';
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
  const deep = deepWanted && report.ok ? await deepenPositions(rpc, report) : [];
  return NextResponse.json({
    report,
    facts: walletFacts(report),
    assessment: deep.length || report.ok ? assessWallet(report, deep) : undefined,
  });
}
