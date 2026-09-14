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
import { HolderSnapshot, MarketSnapshot, readMarketContext } from './market';

/**
 * keccak256("eip1967.proxy.implementation") - 1, the slot the standard puts an
 * implementation address in. A documented constant, not a derived one.
 */
const EIP1967_IMPL =
  '0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc';

/**
 * keccak256("org.zeppelinos.proxy.implementation"), the slot the generation of
 * proxies before EIP-1967 used — and still the live slot on some of the
 * largest tokens in circulation.
 *
 * It is here because reading only the 1967 slot produced a materially
 * misleading answer about a real token: USDC came back as "nothing in the
 * upgrade slot" when its code is in fact replaceable. Verified rather than
 * copied — reading this slot on USDC returns the implementation address its
 * proxy is actually pointing at.
 */
const ZOS_IMPL =
  '0x7050c9e0f4ca769c69bd3a8ef740bc37934f8e2c036e5a723fd8ee048ed3f8c3';

export const SEL = {
  name: '0x06fdde03',
  symbol: '0x95d89b41',
  decimals: '0x313ce567',
  totalSupply: '0x18160ddd',
  owner: '0x8da5cb5b',
  balanceOf: '0x70a08231',
} as const;

/** keccak256("Transfer(address,address,uint256)") */
export const TRANSFER_TOPIC =
  '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';

export const ZERO = '0x0000000000000000000000000000000000000000';

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
  /** Which slot the implementation address was found in. */
  proxyVia?: 'eip1967' | 'zeppelinos';
  /** The owner's own balance as a percentage of supply, when there is an owner. */
  ownerSharePct?: number;
  /** Indexed holder distribution, when Blockscout answers. */
  holders?: HolderSnapshot;
  /** Strongest Robinhood Chain market indexed by DexScreener. */
  market?: MarketSnapshot;
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
    /** Active addresses whose current balance is still above zero. */
    activeAddressesStillHolding?: number;
    /** Highest-flow addresses whose current balance was checked. */
    largeOutflowAddressesChecked?: number;
    /** Checked active addresses with net outflow of at least 0.5% of supply. */
    largeNetOutflowAddresses?: number;
    /** Those large-outflow addresses now holding no more than 0.1% of supply. */
    largeExitAddresses?: number;
    /** Largest net outflow by one checked active address, as a share of supply. */
    largestNetOutflowPct?: number;
  };
  note?: string;
};

/* ------------------------------------------------------------------ rpc bits */

export type Call = { method: string; params: unknown[] };

/**
 * One call's outcome. The distinction between "the node answered with nothing"
 * and "the node did not answer" is the whole reason this is not just
 * `unknown[]`: collapsing them once made this file report that nothing was
 * deployed at an address whose node had simply refused the request, which is a
 * false statement about somebody else's token.
 */
export type Answer = { ok: boolean; value?: unknown; error?: string };

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
export async function rpcBatch(url: string, calls: Call[], ms = 20_000): Promise<Answer[]> {
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

export function ethCall(to: string, data: string): Call {
  return { method: 'eth_call', params: [{ to, data }, 'latest'] };
}

export function padAddress(addr: string): string {
  return addr.replace(/^0x/, '').toLowerCase().padStart(64, '0');
}

export function hexToBigInt(hex: unknown): bigint | undefined {
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
export function decodeString(hex: unknown): string | undefined {
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

export function addressFromTopic(topic: string): string {
  return `0x${topic.slice(-40)}`.toLowerCase();
}

/** Scales a raw amount by decimals into whole tokens, without losing the magnitude. */
export function scale(raw: bigint, decimals: number): number {
  if (decimals <= 0) return Number(raw);
  const d = BigInt(10) ** BigInt(decimals);
  const whole = raw / d;
  // Keep three decimal places of the fraction so small supplies are not zero.
  const frac = Number(((raw % d) * BigInt(1000)) / d) / 1000;
  return Number(whole) + frac;
}

/* --------------------------------------------------------------------- read */

/**
 * Options for a cheaper reading.
 *
 * `contractOnly` skips the log window and the sixty balance calls behind it.
 * The window is most of the cost of a full read, and when a dozen tokens in
 * somebody's wallet each need their ownership and their upgrade slot checked,
 * a dozen full reads is a minute of somebody else's node. The contract facts —
 * supply, owner, owner's share, code size, proxy slot — are nine calls.
 */
export type ReadTokenOptions = { contractOnly?: boolean };

export async function readToken(
  rpcUrl: string,
  address: string,
  windowBlocks = Number(process.env.CHAIN_WINDOW_BLOCKS || 43_200),
  opts: ReadTokenOptions = {},
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
        { method: 'eth_getStorageAt', params: [addr, ZOS_IMPL, 'latest'] },
      ],
    );
    const [codeA, nameA, symbolA, decA, supplyA, ownerA, headA, proxyA, zosA] = answers;

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

    // Two known proxy slots, the current standard and the one before it.
    // Reported only when one of them holds something, because an empty slot is
    // not evidence that a contract cannot be upgraded — a proxy is free to
    // keep its implementation anywhere, and some do.
    const proxyWord = proxyA.ok ? addressFromWord(proxyA.value) : undefined;
    const zosWord = zosA.ok ? addressFromWord(zosA.value) : undefined;
    const found =
      proxyWord && proxyWord !== ZERO
        ? { at: proxyWord, via: 'eip1967' as const }
        : zosWord && zosWord !== ZERO
          ? { at: zosWord, via: 'zeppelinos' as const }
          : undefined;
    const proxyImplementation = found?.at;

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
      proxyVia: found?.via,
    };

    // What the owner holds of its own supply. One call, and the single most
    // telling figure available without an indexer — so it is read even on a
    // contract-only pass, where everything below is skipped.
    if (ownerAddr && ownerAddr !== ZERO && supplyRaw && supplyRaw > BigInt(0)) {
      const [ownerBal] = await rpcBatch(rpcUrl, [
        ethCall(addr, SEL.balanceOf + padAddress(ownerAddr)),
      ]);
      const v = ownerBal.ok ? hexToBigInt(ownerBal.value) : undefined;
      if (v !== undefined) {
        report.ownerSharePct = Math.round(Number((v * BigInt(10_000)) / supplyRaw)) / 100;
      }
    }

    if (opts.contractOnly) return report;
    const marketContext = readMarketContext(addr, supplyRaw);

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
      if (!logsA.ok || !Array.isArray(logsA.value)) {
        Object.assign(report, await marketContext);
        report.note =
          'the node would not return the transfer window, so holder and market data remain but recent exits are unknown';
        return report;
      }
      const logs = logsA.value as TransferLog[];

      const senders = new Set<string>();
      const receivers = new Set<string>();
      type Flow = { received: bigint; sent: bigint };
      const flows = new Map<string, Flow>();
      const flowFor = (address: string): Flow => {
        const current = flows.get(address) || { received: BigInt(0), sent: BigInt(0) };
        flows.set(address, current);
        return current;
      };

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
        if (v !== undefined) {
          if (fromAddr !== ZERO) flowFor(fromAddr).sent += v;
          if (toAddr !== ZERO) flowFor(toAddr).received += v;
          if (v > largestRaw) largestRaw = v;
        }
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
      const active = [...flows.entries()]
        .sort((a, b) => {
          const aGross = a[1].received + a[1].sent;
          const bGross = b[1].received + b[1].sent;
          return bGross > aGross ? 1 : bGross < aGross ? -1 : 0;
        })
        .map(([address]) => address)
        .slice(0, 60);
      if (active.length && supplyRaw && supplyRaw > BigInt(0)) {
        const balances = await rpcBatch(
          rpcUrl,
          active.map((a) => ethCall(addr, SEL.balanceOf + padAddress(a))),
        );
        let top = BigInt(0);
        let largestNetOutflow = BigInt(0);
        let checked = 0;
        let stillHolding = 0;
        let largeNetOutflows = 0;
        let largeExits = 0;
        for (let index = 0; index < balances.length; index += 1) {
          const b = balances[index];
          if (!b.ok) continue;
          const v = hexToBigInt(b.value);
          if (v !== undefined) {
            checked += 1;
            if (v > BigInt(0)) stillHolding += 1;
            if (v > top) top = v;

            const flow = flows.get(active[index]);
            const netOutflow =
              flow && flow.sent > flow.received
                ? flow.sent - flow.received
                : BigInt(0);
            if (netOutflow > largestNetOutflow) largestNetOutflow = netOutflow;
            if (netOutflow * BigInt(200) >= supplyRaw) {
              largeNetOutflows += 1;
              if (v * BigInt(1_000) <= supplyRaw) largeExits += 1;
            }
          }
        }
        if (checked > 0) {
          window.activeAddressesChecked = checked;
          window.topActiveSharePct =
            Math.round(Number((top * BigInt(10_000)) / supplyRaw)) / 100;
          window.activeAddressesStillHolding = stillHolding;
          window.largeOutflowAddressesChecked = checked;
          window.largeNetOutflowAddresses = largeNetOutflows;
          window.largeExitAddresses = largeExits;
          window.largestNetOutflowPct =
            Math.round(Number((largestNetOutflow * BigInt(100_000)) / supplyRaw)) / 1_000;
        }
      }
      report.window = window;
    }
    Object.assign(report, await marketContext);

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
  if (typeof t.supply === 'number') {
    out.push(`total supply: ${t.supply.toLocaleString('en-GB')}`);
  }
  if (t.ownerRenounced === true) out.push('ownership is renounced (owner is the zero address)');
  if (t.ownerRenounced === false) out.push(`ownership is still held by ${t.owner}`);
  if (t.owner === undefined) {
    out.push('the contract exposes no owner function, which is not the same as renounced');
  }
  if (typeof t.ownerSharePct === 'number') {
    out.push(`the owner address holds ${t.ownerSharePct}% of supply`);
  }
  if (typeof t.codeBytes === 'number') {
    out.push(`deployed bytecode: ${t.codeBytes} bytes (a plain ERC-20 is around 2000)`);
  }
  if (t.proxyImplementation) {
    out.push(
      `the ${t.proxyVia === 'zeppelinos' ? 'older zeppelinos' : 'standard eip-1967'} proxy ` +
        `slot holds ${t.proxyImplementation}, so the code behind this address can be replaced`,
    );
  }

  const holders = t.holders;
  if (holders) {
    if (typeof holders.count === 'number') {
      out.push(`current holder addresses reported by Blockscout: ${holders.count}`);
    }
    if (typeof holders.topEoaSharePct === 'number') {
      out.push(`largest externally-owned holder: ${holders.topEoaSharePct}% of supply`);
    }
    if (typeof holders.topTenEoaSharePct === 'number') {
      out.push(
        `top ten externally-owned holders together: ${holders.topTenEoaSharePct}% of supply`,
      );
    }
    if (typeof holders.eoaHoldersAtLeastOnePct === 'number') {
      out.push(
        `externally-owned holders with at least 1% of supply in the indexed top page: ${holders.eoaHoldersAtLeastOnePct}`,
      );
    }
  }

  const w = t.window;
  if (w) {
    out.push(`transfers in the last ${w.blocks} blocks: ${w.transfers}`);
    out.push(`distinct addresses receiving in that window: ${w.receivers}`);
    out.push(`distinct addresses sending in that window: ${w.senders}`);
    if (
      typeof w.activeAddressesStillHolding === 'number' &&
      typeof w.activeAddressesChecked === 'number'
    ) {
      out.push(
        `active addresses still holding a non-zero balance: ${w.activeAddressesStillHolding} of ${w.activeAddressesChecked} checked`,
      );
    }
    if (typeof w.largeNetOutflowAddresses === 'number') {
      out.push(
        `active addresses with net outflow of at least 0.5% of supply in the window: ${w.largeNetOutflowAddresses} among the ${w.largeOutflowAddressesChecked} highest-flow addresses checked; market contracts can be among them`,
      );
    }
    if (typeof w.largeExitAddresses === 'number') {
      out.push(
        `large net-outflow addresses now holding no more than 0.1% of supply: ${w.largeExitAddresses}; these are addresses, not identified people, and a pool or router can be among them`,
      );
    }
    if (typeof w.largestNetOutflowPct === 'number') {
      out.push(
        `largest net outflow by one checked active address: ${w.largestNetOutflowPct}% of supply`,
      );
    }
    if (typeof w.mints === 'number') {
      out.push(`tokens created inside that window: ${w.mints} mints`);
    }
    if (typeof w.burns === 'number') {
      out.push(`tokens destroyed inside that window: ${w.burns} burns`);
    }
    if (typeof w.largestTransfer === 'number') {
      out.push(
        `largest single transfer in that window: ${w.largestTransfer.toLocaleString('en-GB')}`,
      );
    }
    if (typeof w.firstBlock === 'number' && typeof w.lastBlock === 'number') {
      out.push(`transfers span blocks ${w.firstBlock} to ${w.lastBlock}`);
    }
    if (typeof w.topActiveSharePct === 'number') {
      out.push(
        `largest balance among the ${w.activeAddressesChecked} addresses active in that window: ` +
          `${w.topActiveSharePct}% of supply. this is not the largest holder overall`,
      );
    }
  }

  const market = t.market;
  if (market) {
    out.push(
      `strongest DexScreener market: ${market.dexId || 'unknown dex'} against ${market.quoteSymbol || 'its quote token'}`,
    );
    if (typeof market.liquidityUsd === 'number') {
      out.push(`current liquidity in that pair: $${market.liquidityUsd.toLocaleString('en-US')}`);
    }
    if (typeof market.volume24hUsd === 'number') {
      out.push(`24 hour volume in that pair: $${market.volume24hUsd.toLocaleString('en-US')}`);
    }
    if (typeof market.buys24h === 'number' && typeof market.sells24h === 'number') {
      out.push(`24 hour trades: ${market.buys24h} buys and ${market.sells24h} sells`);
    }
    if (typeof market.priceChange24hPct === 'number') {
      out.push(`24 hour price change: ${market.priceChange24hPct}%`);
    }
    if (typeof market.marketCapUsd === 'number') {
      out.push(
        `current market cap reported by DexScreener: $${market.marketCapUsd.toLocaleString('en-US')}`,
      );
    } else if (typeof market.fdvUsd === 'number') {
      out.push(
        `current fully diluted value reported by DexScreener: $${market.fdvUsd.toLocaleString('en-US')}`,
      );
    }
    if (typeof market.pairAgeHours === 'number') {
      out.push(`age of that market pair: ${market.pairAgeHours} hours`);
    }
  }

  return out;
}
