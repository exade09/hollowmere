/**
 * Reading any ERC-20 on the chain, over plain JSON-RPC.
 *
 * The calls are encoded by hand. An ABI coder is a large dependency for six
 * functions with fixed signatures, and this project has three dependencies in
 * total; the encoding for `f()` and `f(address)` is a selector and a padded
 * word, which is less code than the import would be.
 *
 * Everything returned here is UNTRUSTED. `name` and `symbol` are strings the
 * deployer chose, and a deployer who wants to talk to a bot reading its token
 * will put instructions in them. They come back sanitised, and they are the
 * only strings in the result.
 *
 * What this cannot do, stated plainly because the gap matters: an RPC node has
 * no index over history, so there is no holder count, no age, and no top-holder
 * list. Concentration below is measured only across addresses that appear in
 * the recent transfer window, and is labelled that way everywhere it is used.
 * Anything else would be a number that sounds precise and is not.
 */
import { sanitize } from './sanitize';

/**
 * keccak256("eip1967.proxy.implementation") - 1, the slot the standard puts an
 * implementation address in. A documented constant, not a derived one.
 */
const EIP1967_IMPL =
  '0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc';

const SEL = {
  name: '0x06fdde03',
  symbol: '0x95d89b41',
  decimals: '0x313ce567',
  totalSupply: '0x18160ddd',
  owner: '0x8da5cb5b',
  balanceOf: '0x70a08231',
} as const;

/** keccak256("Transfer(address,address,uint256)") */
const TRANSFER_TOPIC =
  '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';

const ZERO = '0x0000000000000000000000000000000000000000';

export type TokenReport = {
  ok: boolean;
  address: string;
  /** Set when the address holds no code: an ordinary wallet, not a token. */
  notAContract?: boolean;
  name?: string;
  symbol?: string;
  decimals?: number;
  /** Whole tokens, already scaled by decimals. */
  supply?: number;
  /**
   * The address in `owner()`, when the contract has one. A zero address means
   * ownership was renounced. Absent means the contract has no such function,
   * which is not the same as renounced.
   */
  owner?: string;
  ownerRenounced?: boolean;
  /** Size of the deployed bytecode in bytes. A bare ERC-20 is about 2 kB. */
  codeBytes?: number;
  /**
   * The address in the standard EIP-1967 implementation slot, when that slot
   * holds one. Present means the code behind this address can be replaced.
   *
   * Absent means only that nothing was found there — never that the contract is
   * not a proxy. A silent negative is the honest failure mode here: claiming
   * "not upgradeable" about somebody else's contract on the strength of one
   * storage slot would be a statement this cannot support.
   */
  proxyImplementation?: string;
  /** The owner's own balance as a percentage of supply, when there is an owner. */
  ownerSharePct?: number;
  /** Movement in the recent window. */
  window?: {
    blocks: number;
    transfers: number;
    senders: number;
    receivers: number;
    /** Transfers out of the zero address: tokens created inside the window. */
    mints?: number;
    /** Transfers into the zero address: tokens destroyed inside the window. */
    burns?: number;
    /** The largest single transfer in the window, in whole tokens. */
    largestTransfer?: number;
    /** First and last block in the window that carried a transfer. */
    firstBlock?: number;
    lastBlock?: number;
    /**
     * Largest balance among addresses active in this window, as a percentage
     * of supply. NOT the largest holder overall — only the largest of those
     * that moved recently.
     */
    topActiveSharePct?: number;
    activeAddressesChecked?: number;
  };
  note?: string;
};

/* ------------------------------------------------------------------ rpc bits */

type Call = { method: string; params: unknown[] };

/**
 * One call's outcome. The distinction between "the node answered with nothing"
 * and "the node did not answer" is the whole reason this is not just
 * `unknown[]`: collapsing them once made this file report that nothing was
 * deployed at an address whose node had simply refused the request, which is a
 * false statement about somebody else's token.
 */
type Answer = { ok: boolean; value?: unknown; error?: string };

async function send(url: string, body: unknown, ms: number): Promise<unknown> {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), ms);
  try {
    const r = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
      cache: 'no-store',
      signal: ctl.signal,
    });
    if (!r.ok) throw new Error(`rpc ${r.status}`);
    return await r.json();
  } finally {
    clearTimeout(t);
  }
}

function toAnswer(row: { result?: unknown; error?: { message?: string } } | undefined): Answer {
  if (!row) return { ok: false, error: 'no response for this call' };
  if (row.error) return { ok: false, error: row.error.message || 'rpc error' };
  return { ok: true, value: row.result };
}

/**
 * Sends the calls as a JSON-RPC batch, and falls back to sending them one at a
 * time when the endpoint does not answer a batch with an array. Plenty of
 * public nodes do not support batching, and finding that out should cost one
 * extra round trip rather than the whole reading.
 */
async function rpcBatch(url: string, calls: Call[], ms = 20_000): Promise<Answer[]> {
  const payload = calls.map((c, i) => ({
    jsonrpc: '2.0',
    id: i + 1,
    method: c.method,
    params: c.params,
  }));

  try {
    const j = await send(url, payload, ms);
    if (Array.isArray(j)) {
      type Row = { id?: number; result?: unknown; error?: { message?: string } };
      const byId = new Map<number, Row>();
      for (const row of j as Row[]) {
        if (typeof row.id === 'number') byId.set(row.id, row);
      }
      return calls.map((_, i) => toAnswer(byId.get(i + 1)));
    }
  } catch (e) {
    // Fall through to one at a time; a batch refused outright is not a reason
    // to give up on the reading.
    void e;
  }

  const out: Answer[] = [];
  for (const c of calls) {
    try {
      const j = (await send(url, { jsonrpc: '2.0', id: 1, ...c }, ms)) as {
        result?: unknown;
        error?: { message?: string };
      };
      out.push(toAnswer(j));
    } catch (e) {
      out.push({ ok: false, error: String(e).slice(0, 120) });
    }
  }
  return out;
}

function ethCall(to: string, data: string): Call {
  return { method: 'eth_call', params: [{ to, data }, 'latest'] };
}

function padAddress(addr: string): string {
  return addr.replace(/^0x/, '').toLowerCase().padStart(64, '0');
}

function hexToBigInt(hex: unknown): bigint | undefined {
  if (typeof hex !== 'string' || !/^0x[0-9a-f]*$/i.test(hex) || hex.length < 3) return undefined;
  try {
    return BigInt(hex);
  } catch {
    return undefined;
  }
}

/**
 * Decodes a string return value, accepting both shapes in the wild: the ABI
 * dynamic encoding, and the bytes32 that predates it and is still common in
 * hand-written tokens.
 */
function decodeString(hex: unknown): string | undefined {
  if (typeof hex !== 'string' || !hex.startsWith('0x')) return undefined;
  const body = hex.slice(2);
  if (body.length === 0) return undefined;

  const bytes = (h: string) => {
    const out: number[] = [];
    for (let i = 0; i + 1 < h.length; i += 2) out.push(Number.parseInt(h.slice(i, i + 2), 16));
    return new Uint8Array(out.filter((b) => b !== 0));
  };
  const text = (u: Uint8Array) => new TextDecoder('utf-8', { fatal: false }).decode(u);

  // bytes32: exactly one word, no offset to follow.
  if (body.length === 64) return text(bytes(body)).trim() || undefined;

  // Dynamic: [offset][length][content]
  if (body.length >= 128) {
    const len = Number.parseInt(body.slice(64, 128), 16);
    if (Number.isFinite(len) && len > 0 && len <= 256) {
      const content = body.slice(128, 128 + len * 2);
      return text(bytes(content)).trim() || undefined;
    }
  }
  return undefined;
}

function addressFromWord(word: unknown): string | undefined {
  if (typeof word !== 'string' || word.length < 42) return undefined;
  return `0x${word.slice(-40)}`.toLowerCase();
}

function addressFromTopic(topic: string): string {
  return `0x${topic.slice(-40)}`.toLowerCase();
}

/** Scales a raw amount by decimals into whole tokens, without losing the magnitude. */
function scale(raw: bigint, decimals: number): number {
  if (decimals <= 0) return Number(raw);
  const d = BigInt(10) ** BigInt(decimals);
  const whole = raw / d;
  // Keep three decimal places of the fraction so small supplies are not zero.
  const frac = Number(((raw % d) * BigInt(1000)) / d) / 1000;
  return Number(whole) + frac;
}

/* --------------------------------------------------------------------- read */

export async function readToken(
  rpcUrl: string,
  address: string,
  windowBlocks = Number(process.env.CHAIN_WINDOW_BLOCKS || 43_200),
): Promise<TokenReport> {
  const addr = address.trim().toLowerCase();
  if (!/^0x[0-9a-f]{40}$/.test(addr)) {
    return { ok: false, address, note: 'that is not an address on this chain' };
  }

  try {
    const answers = await rpcBatch(
      rpcUrl,
      [
        { method: 'eth_getCode', params: [addr, 'latest'] },
        ethCall(addr, SEL.name),
        ethCall(addr, SEL.symbol),
        ethCall(addr, SEL.decimals),
        ethCall(addr, SEL.totalSupply),
        ethCall(addr, SEL.owner),
        { method: 'eth_blockNumber', params: [] },
        { method: 'eth_getStorageAt', params: [addr, EIP1967_IMPL, 'latest'] },
      ],
    );
    const [codeA, nameA, symbolA, decA, supplyA, ownerA, headA, proxyA] = answers;

    // A node that refused the request has told us nothing about the address.
    // Saying otherwise would be inventing a fact, and this one would be a
    // claim about somebody else's contract.
    if (!codeA.ok) {
      return {
        ok: false,
        address: addr,
        note: `the node would not answer: ${codeA.error}`,
      };
    }
    const code = codeA.value;
    if (typeof code !== 'string' || code === '0x' || code === '0x0') {
      return {
        ok: true,
        address: addr,
        notAContract: true,
        note: 'nothing is deployed at that address',
      };
    }

    const decHex = decA.ok ? decA.value : undefined;
    const supplyHex = supplyA.ok ? supplyA.value : undefined;
    const nameHex = nameA.ok ? nameA.value : undefined;
    const symbolHex = symbolA.ok ? symbolA.value : undefined;
    const headHex = headA.ok ? headA.value : undefined;
    const decimals = Number(hexToBigInt(decHex) ?? BigInt(18));
    const supplyRaw = hexToBigInt(supplyHex);
    // A missing owner() and a failed owner() are different things, and the
    // difference is reported rather than flattened: see tokenFacts.
    const ownerAddr = ownerA.ok ? addressFromWord(ownerA.value) : undefined;

    // Bytecode size, as a plain fact. A bare ERC-20 compiles to roughly 2 kB;
    // fee logic, limits and allow lists all make it bigger. Reported as a
    // number, never as a judgement about what the extra code does.
    const codeBytes = Math.max(0, Math.floor((code.length - 2) / 2));

    // The standard proxy slot. Reported only when it holds something, because
    // an empty slot is not evidence that a contract cannot be upgraded.
    const proxyWord = proxyA.ok ? addressFromWord(proxyA.value) : undefined;
    const proxyImplementation =
      proxyWord && proxyWord !== ZERO ? proxyWord : undefined;

    const report: TokenReport = {
      ok: true,
      address: addr,
      name: decodeString(nameHex) ? sanitize(decodeString(nameHex)!, 48) : undefined,
      symbol: decodeString(symbolHex) ? sanitize(decodeString(symbolHex)!, 16) : undefined,
      decimals: Number.isFinite(decimals) && decimals >= 0 && decimals <= 36 ? decimals : undefined,
      supply: supplyRaw === undefined ? undefined : scale(supplyRaw, decimals),
      owner: ownerAddr,
      ownerRenounced: ownerAddr === undefined ? undefined : ownerAddr === ZERO,
      codeBytes,
      proxyImplementation,
    };

    // Movement, and concentration among whoever moved.
    const head = Number(hexToBigInt(headHex) ?? BigInt(0));
    if (head > 0) {
      const from = Math.max(0, head - windowBlocks);
      const [logsA] = await rpcBatch(rpcUrl, [
        {
          method: 'eth_getLogs',
          params: [
            {
              address: addr,
              topics: [TRANSFER_TOPIC],
              fromBlock: `0x${from.toString(16)}`,
              toBlock: 'latest',
            },
          ],
        },
      ]);
      type TransferLog = { topics?: string[]; data?: string; blockNumber?: string };
      const logs =
        logsA.ok && Array.isArray(logsA.value) ? (logsA.value as TransferLog[]) : [];

      const senders = new Set<string>();
      const receivers = new Set<string>();
      let mints = 0;
      let burns = 0;
      let largestRaw = BigInt(0);
      let firstBlock: number | undefined;
      let lastBlock: number | undefined;

      for (const l of logs) {
        const t = l.topics || [];
        if (t.length < 3) continue;
        const fromAddr = addressFromTopic(t[1]);
        const toAddr = addressFromTopic(t[2]);
        senders.add(fromAddr);
        receivers.add(toAddr);
        // A transfer out of the zero address is a mint and a transfer into it
        // is a burn. Both come straight out of the topics, so neither needs a
        // function selector guessed at.
        if (fromAddr === ZERO) mints += 1;
        if (toAddr === ZERO) burns += 1;
        const v = hexToBigInt(l.data);
        if (v !== undefined && v > largestRaw) largestRaw = v;
        const b = Number(hexToBigInt(l.blockNumber) ?? BigInt(0));
        if (b > 0) {
          if (firstBlock === undefined || b < firstBlock) firstBlock = b;
          if (lastBlock === undefined || b > lastBlock) lastBlock = b;
        }
      }

      const window: NonNullable<TokenReport['window']> = {
        blocks: head - from,
        transfers: logs.length,
        senders: senders.size,
        receivers: receivers.size,
        mints: mints || undefined,
        burns: burns || undefined,
        largestTransfer: largestRaw > BigInt(0) ? scale(largestRaw, decimals) : undefined,
        firstBlock,
        lastBlock,
      };

      // Balances of the active addresses, batched. Capped: this is a flavour of
      // concentration, not a census, and it must not turn into 500 calls.
      const active = [...new Set([...receivers, ...senders])]
        .filter((a) => a !== ZERO)
        .slice(0, 60);
      if (active.length && supplyRaw && supplyRaw > BigInt(0)) {
        const balances = await rpcBatch(
          rpcUrl,
          active.map((a) => ethCall(addr, SEL.balanceOf + padAddress(a))),
        );
        let top = BigInt(0);
        for (const b of balances) {
          if (!b.ok) continue;
          const v = hexToBigInt(b.value);
          if (v !== undefined && v > top) top = v;
        }
        window.activeAddressesChecked = active.length;
        window.topActiveSharePct =
          Math.round(Number((top * BigInt(10_000)) / supplyRaw) / 100 * 100) / 100;
      }

      // What the owner holds of its own supply. One more call, and the single
      // most telling figure available without an indexer.
      if (ownerAddr && ownerAddr !== ZERO && supplyRaw && supplyRaw > BigInt(0)) {
        const [ownerBal] = await rpcBatch(rpcUrl, [
          ethCall(addr, SEL.balanceOf + padAddress(ownerAddr)),
        ]);
        const v = ownerBal.ok ? hexToBigInt(ownerBal.value) : undefined;
        if (v !== undefined) {
          report.ownerSharePct = Math.round(Number((v * BigInt(10_000)) / supplyRaw)) / 100;
        }
      }

      report.window = window;
    }

    return report;
  } catch (e) {
    return { ok: false, address: addr, note: `could not read it: ${String(e).slice(0, 140)}` };
  }
}

/**
 * The facts, as lines the model may repeat. Deliberately only facts: no
 * scoring, no verdict, nothing that reads as a recommendation. What the agent
 * is allowed to say about a token is exactly this list.
 */
export function tokenFacts(t: TokenReport): string[] {
  if (!t.ok) return [];
  if (t.notAContract) return ['nothing is deployed at that address'];
  const out: string[] = [];
  if (t.name) out.push(`name on the contract: ${t.name}`);
  if (t.symbol) out.push(`symbol on the contract: ${t.symbol}`);
  if (typeof t.supply === 'number') out.push(`total supply: ${t.supply.toLocaleString('en-GB')}`);
  if (t.ownerRenounced === true) out.push('ownership is renounced (owner is the zero address)');
  if (t.ownerRenounced === false) out.push(`ownership is still held by ${t.owner}`);
  if (t.owner === undefined) out.push('the contract exposes no owner function, which is not the same as renounced');
  if (typeof t.ownerSharePct === 'number') {
    out.push(`the owner address holds ${t.ownerSharePct}% of supply`);
  }
  if (typeof t.codeBytes === 'number') {
    out.push(`deployed bytecode: ${t.codeBytes} bytes (a plain ERC-20 is around 2000)`);
  }
  if (t.proxyImplementation) {
    out.push(
      `the standard proxy slot holds ${t.proxyImplementation}, so the code behind ` +
        `this address can be replaced`,
    );
  }
  const w = t.window;
  if (w) {
    out.push(`transfers in the last ${w.blocks} blocks: ${w.transfers}`);
    out.push(`distinct addresses receiving in that window: ${w.receivers}`);
    out.push(`distinct addresses sending in that window: ${w.senders}`);
    if (typeof w.mints === 'number') out.push(`tokens created inside that window: ${w.mints} mints`);
    if (typeof w.burns === 'number') out.push(`tokens destroyed inside that window: ${w.burns} burns`);
    if (typeof w.largestTransfer === 'number') {
      out.push(`largest single transfer in that window: ${w.largestTransfer.toLocaleString('en-GB')}`);
    }
    if (typeof w.firstBlock === 'number' && typeof w.lastBlock === 'number') {
      out.push(`transfers span blocks ${w.firstBlock} to ${w.lastBlock}`);
    }
    if (typeof w.topActiveSharePct === 'number') {
      out.push(
        `largest balance among the ${w.activeAddressesChecked} addresses active in that window: ` +
          `${w.topActiveSharePct}% of supply. This is not the largest holder overall, and ` +
          `an rpc node cannot see holders that did not move.`,
      );
    }
  }
  return out;
}
