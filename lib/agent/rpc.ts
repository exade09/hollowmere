/**
 * Reading the chain over JSON-RPC.
 *
 * This exists because the explorer does not work from a server. Blockscout
 * answers a browser and returns 403 to everything else — it sits behind a bot
 * check, verified from this machine: the same request that succeeds inside a
 * real page fails from curl and would fail from a serverless function. Working
 * around a bot check is not on the table, so the agent reads the chain the way
 * chains are meant to be read.
 *
 * An RPC node gives transfers and addresses. It does not give a total holder
 * count — that needs an index over all history, which is exactly what an
 * explorer is for. So the agent talks about movement rather than totals, which
 * is the more honest thing for it to be talking about anyway.
 *
 *     CHAIN_RPC_URL=https://<a Robinhood Chain rpc endpoint>
 */

/** keccak256("Transfer(address,address,uint256)") */
const TRANSFER_TOPIC =
  '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';

/** How far back to look. At two seconds a block this is roughly a day. */
const WINDOW_BLOCKS = Number(process.env.CHAIN_WINDOW_BLOCKS || 43_200);

type RpcLog = { topics?: string[]; data?: string; blockNumber?: string };

async function rpc<T>(url: string, method: string, params: unknown[]): Promise<T> {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), 15_000);
  try {
    const r = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
      cache: 'no-store',
      signal: ctl.signal,
    });
    if (!r.ok) throw new Error(`rpc ${r.status}`);
    const j = (await r.json()) as { result?: T; error?: { message?: string } };
    if (j.error) throw new Error(`rpc: ${j.error.message || 'error'}`);
    if (j.result === undefined) throw new Error('rpc: empty result');
    return j.result;
  } finally {
    clearTimeout(t);
  }
}

/** An indexed address topic is 32 bytes; the address is its last 20. */
function addressFromTopic(topic: string): string {
  return `0x${topic.slice(-40)}`.toLowerCase();
}

export type Movement = {
  /** Transfer events in the window. */
  transfers: number;
  /** Distinct addresses that received the token in the window. */
  receivers: number;
  /** Distinct addresses that sent it. */
  senders: number;
  blocks: number;
};

/**
 * Counts Transfer events for one token over the recent block window.
 *
 * Throws on failure, deliberately: the caller decides whether a tick without
 * chain data is a problem, and it is not — there are six other angles.
 */
export async function readMovement(url: string, contract: string): Promise<Movement> {
  const headHex = await rpc<string>(url, 'eth_blockNumber', []);
  const head = Number.parseInt(headHex, 16);
  if (!Number.isFinite(head)) throw new Error('rpc: bad block number');
  const from = Math.max(0, head - WINDOW_BLOCKS);

  const logs = await rpc<RpcLog[]>(url, 'eth_getLogs', [
    {
      address: contract,
      topics: [TRANSFER_TOPIC],
      fromBlock: `0x${from.toString(16)}`,
      toBlock: 'latest',
    },
  ]);

  const senders = new Set<string>();
  const receivers = new Set<string>();
  for (const log of logs) {
    const t = log.topics || [];
    if (t.length >= 3) {
      senders.add(addressFromTopic(t[1]));
      receivers.add(addressFromTopic(t[2]));
    }
  }

  return {
    transfers: logs.length,
    receivers: receivers.size,
    senders: senders.size,
    blocks: head - from,
  };
}
