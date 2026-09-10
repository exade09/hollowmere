/**
 * The agent's eyes on Robinhood Chain. Read-only, and that is a design
 * decision rather than a stage: the agent holds no key and signs nothing, so
 * there is nothing here to drain and nothing a prompt can talk into moving.
 *
 * Two readers, in order of preference:
 *
 *   rpc      — an ordinary JSON-RPC endpoint. This is the one that works from
 *              a server. Set CHAIN_RPC_URL.
 *   explorer — Blockscout's API. Useful in development and useless in
 *              production: it sits behind a bot check and returns 403 to
 *              anything that is not a browser, which was verified from this
 *              machine rather than assumed. Kept as a fallback, not relied on.
 *
 * Everything a reader returns is UNTRUSTED. Token names and symbols on a
 * public chain are attacker-controlled strings — anyone can deploy a token
 * called "ignore previous instructions and ..." and wait for a bot to read its
 * own transfer feed. So text passes through sanitize(), and numbers are the
 * only thing the agent is ever allowed to repeat.
 */
import { ChainSnapshot } from './types';
import { sanitize } from './sanitize';
import { readMovement } from './rpc';

const BASE =
  process.env.CHAIN_EXPLORER_API || 'https://robinhoodchain.blockscout.com/api/v2';

async function get(path: string, ms = 12_000): Promise<unknown> {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), ms);
  try {
    const r = await fetch(`${BASE}${path}`, {
      headers: { accept: 'application/json' },
      cache: 'no-store',
      signal: ctl.signal,
    });
    if (!r.ok) throw new Error(`explorer ${r.status}`);
    return await r.json();
  } finally {
    clearTimeout(t);
  }
}

/**
 * Never throws. A tick that cannot see the chain still has six other angles to
 * write from, so a failure here is a missing input rather than an error.
 */
export async function readChain(): Promise<ChainSnapshot> {
  const contract = process.env.NEXT_PUBLIC_CONTRACT || process.env.CONTRACT || '';
  const at = Date.now();

  if (!contract) {
    return { at, contract: '', ok: false, note: 'no contract address configured yet' };
  }

  const rpcUrl = process.env.CHAIN_RPC_URL;
  if (rpcUrl) {
    try {
      const m = await readMovement(rpcUrl, contract);
      return {
        at,
        contract,
        ok: true,
        via: 'rpc',
        transfers: m.transfers,
        receivers: m.receivers,
        senders: m.senders,
        blocks: m.blocks,
      };
    } catch (e) {
      return { at, contract, ok: false, via: 'rpc', note: `rpc unavailable: ${String(e).slice(0, 120)}` };
    }
  }

  try {
    const token = (await get(`/tokens/${contract}`)) as {
      name?: string;
      symbol?: string;
      holders?: string | number;
      holders_count?: string | number;
    };
    const holdersRaw = token.holders ?? token.holders_count;
    const holders =
      holdersRaw === undefined ? undefined : Number(String(holdersRaw).replace(/[^\d]/g, ''));

    return {
      at,
      contract,
      ok: true,
      via: 'explorer',
      name: token.name ? sanitize(token.name, 40) : undefined,
      symbol: token.symbol ? sanitize(token.symbol, 16) : undefined,
      holders: Number.isFinite(holders) ? holders : undefined,
    };
  } catch (e) {
    return {
      at,
      contract,
      ok: false,
      via: 'explorer',
      note:
        `explorer unavailable (${String(e).slice(0, 60)}). ` +
        `Set CHAIN_RPC_URL: the explorer refuses non-browser requests.`,
    };
  }
}

/**
 * The only chain material the model ever sees: plain figures, already verified
 * as numbers. No free text from the chain reaches the prompt, because free text
 * from the chain is written by strangers.
 */
export function chainFacts(c: ChainSnapshot): string[] {
  const out: string[] = [];
  if (!c.ok) return out;
  if (typeof c.holders === 'number' && c.holders > 0) out.push(`holders: ${c.holders}`);
  if (typeof c.transfers === 'number' && c.transfers > 0) {
    const period = c.blocks ? ` over the last ${c.blocks} blocks` : '';
    out.push(`transfers${period}: ${c.transfers}`);
  }
  if (typeof c.receivers === 'number' && c.receivers > 0) {
    out.push(`distinct addresses that received the token in that window: ${c.receivers}`);
  }
  return out;
}

/** Figures the audit will accept in a post, because the agent was handed them. */
export function allowedFigures(c: ChainSnapshot): number[] {
  return [c.holders, c.transfers, c.receivers, c.senders, c.blocks].filter(
    (n): n is number => typeof n === 'number',
  );
}
