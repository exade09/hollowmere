/**
 * Reading a wallet: what it holds, and what moved.
 *
 * The token reader answers "what is this contract". This answers the other
 * question a visitor actually arrives with — "what am I holding" — and it is a
 * harder question to answer honestly, because the completeness of the answer
 * depends on who is willing to talk to us.
 *
 * Two readers, tried in that order:
 *
 *   explorer — an indexer keeps a row per holder per token, so it can answer
 *              "everything this address holds" in one request. This is the
 *              complete answer and it is tried first. Blockscout's v2 API is
 *              the shape used here; on this project's chain it currently
 *              refuses server-side requests (403 behind a bot check, verified
 *              rather than assumed), so it is tried and not relied on.
 *   logs     — a plain node has no such index and no getAllTokensFor call, so
 *              positions are DISCOVERED: two log queries over a recent window
 *              find every Transfer event with this wallet as sender or
 *              recipient, each of those logs names the token contract it came
 *              from, and the live balance of each contract found is then read
 *              directly. Real balances, read now — but only for tokens that
 *              moved inside the window.
 *
 * Which one answered is recorded on the report and stated in the facts,
 * because the difference is the difference between a portfolio and a sample.
 * A bag received long ago and never touched since is invisible to the second
 * reader, and quietly presenting a sample as a portfolio would make this
 * wrong in exactly the case that matters most to somebody holding something
 * they had forgotten about.
 *
 * Everything here is read-only. There is no signing, no approval, no
 * transaction and no key: connecting a wallet on the site hands over an
 * address and nothing else, and this file could not do anything with more.
 *
 * The encoding, the batching and the decoders are token.ts's, imported rather
 * than copied — one hand-rolled abi encoder in the project is enough.
 */
import {
  Call,
  ReadTokenOptions,
  SEL,
  TRANSFER_TOPIC,
  TokenReport,
  ZERO,
  addressFromTopic,
  decodeString,
  ethCall,
  hexToBigInt,
  padAddress,
  readToken,
  rpcBatch,
  scale,
} from './token';
import { sanitize } from './sanitize';
import { currentAddress } from '../settings';

/** One token this wallet holds or moved. */
export type Position = {
  /** The token contract. */
  token: string;
  name?: string;
  symbol?: string;
  decimals?: number;
  /** Balance in whole tokens. */
  balance?: number;
  /** That balance as a percentage of the token's total supply. */
  sharePct?: number;
  /** Transfers into this wallet inside the window. Zero from the explorer. */
  received: number;
  /** Transfers out of this wallet inside the window. Zero from the explorer. */
  sent: number;
  /** Largest single transfer touching this wallet in the window, whole tokens. */
  largest?: number;
  firstBlock?: number;
  lastBlock?: number;
  /** True when the window shows this wallet receiving the token from nothing. */
  minted?: boolean;
  /**
   * What the index thinks the holding is worth, used to order the list and
   * never shown. A number on screen with a currency in front of it is a
   * valuation, and a valuation is one step from a recommendation.
   */
  rank?: number;
};

export type WalletReport = {
  ok: boolean;
  address: string;
  /**
   * Set when code is deployed at the address. Not an error: plenty of holders
   * are contracts. It is reported because "wallet" and "contract" are
   * different things and the reading should say which one it read.
   */
  isContract?: boolean;
  /**
   * The implementation an ordinary wallet has delegated itself to, under
   * EIP-7702.
   *
   * This exists because getting it wrong produces a false statement about a
   * real person's wallet. Since Pectra an EOA can carry code — three bytes of
   * designator and an address — and a reader that only asks "is there code
   * here" calls such a wallet a contract. The first real address tested
   * against this file was exactly that case.
   */
  delegatedTo?: string;
  /** Native balance in whole coins, assuming the usual eighteen decimals. */
  native?: number;
  /** Transactions ever sent from this address. The nonce, in other words. */
  txCount?: number;
  /** Which reader produced the positions below. */
  positionsFrom?: 'explorer' | 'logs' | 'known';
  /** True only when an indexer answered, which is the only complete answer. */
  complete?: boolean;
  /** Positions found before the cap was applied. */
  positionsFound?: number;
  /** Present only when the positions came from a log scan. */
  window?: {
    blocks: number;
    fromBlock: number;
    toBlock: number;
    /** Transfer logs touching this wallet in the window. */
    transfers: number;
    /** Distinct token contracts seen in those logs. */
    tokensTouched: number;
    /** How many of those were read in full. Capped; see MAX_TOKENS. */
    tokensRead: number;
  };
  positions?: Position[];
  note?: string;
};

/**
 * How many discovered tokens get their balances read over rpc.
 *
 * Each one costs five calls, and a wallet that has been farming airdrops can
 * touch hundreds of contracts in a day. The cap keeps one visitor's reading
 * inside a predictable number of round trips; the ones dropped are the least
 * active, and the count of what was dropped is reported rather than hidden.
 */
const MAX_TOKENS = 16;
/** The explorer costs one request however many rows come back, so it is wider. */
const MAX_EXPLORER_TOKENS = 40;
/** Calls per batch. Public nodes commonly refuse very large batches. */
const BATCH = 40;

type WalletLog = {
  address?: string;
  topics?: string[];
  data?: string;
  blockNumber?: string;
};

/**
 * A balance as a percentage of supply, or nothing.
 *
 * Nothing is the important half. Spam tokens report a total supply that does
 * not match the balances they mint — an airdrop found in a real wallet came
 * back at five thousand trillion percent of its own supply — and a percentage
 * over a hundred is not a striking fact about a token, it is arithmetic that
 * cannot be true. This project does not print numbers it cannot stand behind,
 * so an impossible share is dropped and the row simply has no percentage.
 */
function sharePct(balance: bigint, supply: bigint | undefined): number | undefined {
  if (supply === undefined || supply <= BigInt(0) || balance < BigInt(0)) return undefined;
  const pct = Math.round(Number((balance * BigInt(10_000)) / supply)) / 100;
  if (!Number.isFinite(pct) || pct < 0 || pct > 100.5) return undefined;
  return pct;
}

function num(a: { ok: boolean; value?: unknown }): number | undefined {
  if (!a.ok) return undefined;
  const v = hexToBigInt(a.value);
  return v === undefined ? undefined : Number(v);
}

/** Splits a long call list so no single batch is large enough to be refused. */
async function batched(url: string, calls: Call[]) {
  const out: Awaited<ReturnType<typeof rpcBatch>> = [];
  for (let i = 0; i < calls.length; i += BATCH) {
    out.push(...(await rpcBatch(url, calls.slice(i, i + BATCH))));
  }
  return out;
}

/* ------------------------------------------------------------- the explorer */

/**
 * When the explorer last refused us.
 *
 * A bot check does not change its mind between two page loads, and a closed
 * door should not cost every visitor a timeout before the reading that works
 * even starts. Process-local and short: serverless instances do not share it,
 * which is fine, because the worst case is one wasted request per instance
 * every few minutes.
 */
let explorerClosedUntil = 0;
const EXPLORER_SHUT_MS = 10 * 60_000;
/**
 * Eight seconds, and not more, for a reason worth writing down.
 *
 * This endpoint has no pagination: it answers with every token row a wallet
 * has, and an eight-year-old address on a mature chain came back with 3.3 MB
 * of json after twenty seconds. Waiting twenty seconds to render is worse than
 * rendering the node's answer in two, so the budget is short and the fall
 * through is expected rather than exceptional. On a young chain — which is the
 * one this project is on — the same request is small and quick.
 */
const EXPLORER_TIMEOUT_MS = 8_000;

type BlockscoutBalance = {
  value?: string;
  token?: {
    address?: string;
    address_hash?: string;
    name?: string;
    symbol?: string;
    decimals?: string | number;
    total_supply?: string | null;
    type?: string;
    /** The index's own price, when it has one. Used to order, never shown. */
    exchange_rate?: string | null;
  };
};

function toBig(v: unknown): bigint | undefined {
  if (typeof v !== 'string' || !/^\d+$/.test(v)) return undefined;
  try {
    return BigInt(v);
  } catch {
    return undefined;
  }
}

/**
 * Every token an indexer says this address holds. Returns null on any refusal
 * or malformed answer, so the caller simply falls through to the node.
 */
async function positionsFromExplorer(addr: string): Promise<Position[] | null> {
  if (Date.now() < explorerClosedUntil) return null;
  const base = process.env.CHAIN_EXPLORER_API || 'https://robinhoodchain.blockscout.com/api/v2';

  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), EXPLORER_TIMEOUT_MS);
  try {
    const r = await fetch(`${base}/addresses/${addr}/token-balances`, {
      headers: { accept: 'application/json' },
      cache: 'no-store',
      signal: ctl.signal,
    });
    if (!r.ok) {
      // A refusal is a door: it will still be shut in a minute, so stop
      // knocking. Only an actual refusal gets cached that way.
      explorerClosedUntil = Date.now() + EXPLORER_SHUT_MS;
      return null;
    }
    const rows = (await r.json()) as unknown;
    if (!Array.isArray(rows)) return null;

    const out: Position[] = [];
    for (const row of rows as BlockscoutBalance[]) {
      const tok = row.token || {};
      // NFTs are holdings but they are not positions, and mixing them into a
      // balance table makes both harder to read.
      if (tok.type && !/^ERC-?20$/i.test(tok.type)) continue;
      const token = String(tok.address || tok.address_hash || '').toLowerCase();
      if (!/^0x[0-9a-f]{40}$/.test(token)) continue;

      const raw = toBig(row.value);
      if (raw === undefined || raw === BigInt(0)) continue;
      const decimals = Number(tok.decimals ?? 18);
      const dec = Number.isFinite(decimals) && decimals >= 0 && decimals <= 36 ? decimals : 18;
      const supply = toBig(tok.total_supply ?? undefined);

      const balance = scale(raw, dec);
      const rate = Number(tok.exchange_rate ?? NaN);
      out.push({
        token,
        // Deployer-chosen strings, so untrusted, exactly as on the node path.
        name: tok.name ? sanitize(String(tok.name), 48) : undefined,
        symbol: tok.symbol ? sanitize(String(tok.symbol), 16) : undefined,
        decimals: dec,
        balance,
        sharePct: sharePct(raw, supply),
        received: 0,
        sent: 0,
        rank: Number.isFinite(rate) && rate > 0 ? balance * rate : undefined,
      });
    }
    return out;
  } catch {
    // A timeout is a slow index, not a closed one, and caching it as closed
    // punishes everybody who arrives in the next ten minutes with the worse
    // of the two readings. Held off briefly and tried again.
    explorerClosedUntil = Date.now() + 30_000;
    return null;
  } finally {
    clearTimeout(t);
  }
}

/* -------------------------------------------------------- the tokens we know */

/**
 * The tokens this deployment cares about by name.
 *
 * Both readers above can fail at once, and on a young chain that is the likely
 * case rather than the unlucky one: no index answering a server, and a hosted
 * node that refuses a logs query without a contract address in it. The
 * reading that survives both is the dullest one — ask the token directly what
 * this wallet's balance is — and it needs to know which tokens to ask.
 *
 * The project's own contract is always in the list, because "do i hold this
 * one, and how much" is the question the site exists to answer and it must
 * never depend on somebody else's index being awake.
 *
 * It comes from the LIVE address rather than from NEXT_PUBLIC_CONTRACT, and
 * that distinction is the whole reason this is async. The address is set at the
 * desk and kept in the store now; a build-time variable is only the fallback,
 * and reading the variable alone meant the one token the site is about was
 * missing from every wallet reading the moment the desk was used as intended.
 *
 * KNOWN_TOKENS adds any others worth always checking, comma separated. A
 * non-EVM address — the field accepts Solana too — is dropped here, because
 * balanceOf is an EVM call and asking a node for one is not a reading, it is
 * an error with a number in it.
 */
async function knownTokens(): Promise<string[]> {
  let live = '';
  try {
    live = (await currentAddress()).text;
  } catch {
    /* the store is unreachable; the variable below still stands */
  }
  const raw = [live, process.env.NEXT_PUBLIC_CONTRACT || '', ...(process.env.KNOWN_TOKENS || '').split(',')];
  const out: string[] = [];
  for (const t of raw) {
    const a = t.trim().toLowerCase();
    if (/^0x[0-9a-f]{40}$/.test(a) && !out.includes(a)) out.push(a);
  }
  return out;
}

/**
 * Balances for a fixed list of contracts. Five calls each, no discovery, no
 * index, and nothing that a node can refuse: this works wherever an rpc
 * endpoint works at all. Positions with no balance are dropped.
 */
async function positionsFromKnown(
  rpcUrl: string,
  addr: string,
  tokens: string[],
): Promise<Position[]> {
  if (!tokens.length) return [];
  const calls: Call[] = [];
  for (const token of tokens) {
    calls.push(ethCall(token, SEL.balanceOf + padAddress(addr)));
    calls.push(ethCall(token, SEL.decimals));
    calls.push(ethCall(token, SEL.symbol));
    calls.push(ethCall(token, SEL.name));
    calls.push(ethCall(token, SEL.totalSupply));
  }
  const answers = await batched(rpcUrl, calls);

  const out: Position[] = [];
  tokens.forEach((token, i) => {
    const [balanceA, decA, symA, nameA, supplyA] = answers.slice(i * 5, i * 5 + 5);
    const rawBalance = balanceA.ok ? hexToBigInt(balanceA.value) : undefined;
    if (rawBalance === undefined || rawBalance === BigInt(0)) return;
    const decimals = Number(hexToBigInt(decA.ok ? decA.value : undefined) ?? BigInt(18));
    const dec = Number.isFinite(decimals) && decimals >= 0 && decimals <= 36 ? decimals : 18;
    const rawSupply = supplyA.ok ? hexToBigInt(supplyA.value) : undefined;
    const symbol = symA.ok ? decodeString(symA.value) : undefined;
    const name = nameA.ok ? decodeString(nameA.value) : undefined;
    out.push({
      token,
      name: name ? sanitize(name, 48) : undefined,
      symbol: symbol ? sanitize(symbol, 16) : undefined,
      decimals: dec,
      balance: scale(rawBalance, dec),
      sharePct: sharePct(rawBalance, rawSupply),
      received: 0,
      sent: 0,
    });
  });
  return out;
}

/* ------------------------------------------------------------------- reading */

export async function readWallet(
  rpcUrl: string,
  address: string,
  windowBlocks = Number(process.env.CHAIN_WINDOW_BLOCKS || 43_200),
): Promise<WalletReport> {
  const addr = address.trim().toLowerCase();
  if (!/^0x[0-9a-f]{40}$/.test(addr)) {
    return { ok: false, address, note: 'that is not an address on this chain' };
  }

  try {
    const [balA, nonceA, codeA, headA] = await rpcBatch(rpcUrl, [
      { method: 'eth_getBalance', params: [addr, 'latest'] },
      { method: 'eth_getTransactionCount', params: [addr, 'latest'] },
      { method: 'eth_getCode', params: [addr, 'latest'] },
      { method: 'eth_blockNumber', params: [] },
    ]);

    // A node that refused the request has told us nothing. Reporting an empty
    // wallet in that case would be inventing a fact about somebody's holdings.
    if (!balA.ok && !headA.ok) {
      return { ok: false, address: addr, note: `the node would not answer: ${balA.error}` };
    }

    const rawNative = balA.ok ? hexToBigInt(balA.value) : undefined;
    const code = typeof codeA.value === 'string' && codeA.ok ? codeA.value : '';
    const hasCode = code !== '' && code !== '0x' && code !== '0x0';
    // 0xef0100 followed by twenty bytes is the EIP-7702 delegation designator:
    // an ordinary wallet pointing at an implementation, not a contract.
    const delegated = /^0xef0100[0-9a-f]{40}$/i.test(code)
      ? `0x${code.slice(8).toLowerCase()}`
      : undefined;
    const report: WalletReport = {
      ok: true,
      address: addr,
      native: rawNative === undefined ? undefined : scale(rawNative, 18),
      txCount: num(nonceA),
      isContract: hasCode && !delegated ? true : undefined,
      delegatedTo: delegated,
    };

    // The tokens this deployment always asks about, read directly. Five calls
    // for one contract, and it means the site's own token can never be missing
    // from a reading because an index was asleep.
    const known = await positionsFromKnown(rpcUrl, addr, await knownTokens());
    const merge = (found: Position[]): Position[] => {
      const have = new Set(found.map((p) => p.token));
      return [...known.filter((k) => !have.has(k.token)), ...found];
    };

    // The complete answer, if anybody will give it to us.
    const indexed = await positionsFromExplorer(addr);
    if (indexed) {
      // An address that has been airdropped at for years holds thousands of
      // tokens, almost all of them worthless and several of them shouting. So
      // the ones the index can price come first, ordered by what it thinks they
      // are worth — used only to decide what is worth showing, never printed,
      // because a valuation on screen is the beginning of advice. After those,
      // the ones with a believable share of their own supply, then the rest.
      indexed.sort(
        (a, b) =>
          (b.rank || 0) - (a.rank || 0) ||
          (b.sharePct || 0) - (a.sharePct || 0) ||
          (b.balance || 0) - (a.balance || 0),
      );
      report.positionsFrom = 'explorer';
      report.complete = true;
      report.positionsFound = indexed.length;
      report.positions = merge(indexed.slice(0, MAX_EXPLORER_TOKENS));
      return report;
    }

    const head = num(headA) ?? 0;
    if (head <= 0) {
      report.note = 'the node would not say what block it is on, so nothing could be scanned';
      return report;
    }

    const fromBlock = Math.max(0, head - windowBlocks);
    const topic = padAddress(addr);
    const range = { fromBlock: `0x${fromBlock.toString(16)}`, toBlock: 'latest' };

    // Two queries rather than one: a topic filter is an AND across positions,
    // so "sender OR recipient" cannot be expressed in a single call. Some
    // nodes accept an array of alternatives in one position, many do not, and
    // two calls work everywhere.
    //
    // Neither carries an `address`, because which token contracts are involved
    // is the thing being discovered. Some hosted endpoints refuse a logs query
    // without one; that refusal is reported as what it is — no positions from
    // here — rather than as an empty wallet.
    const [inA, outA] = await rpcBatch(rpcUrl, [
      {
        method: 'eth_getLogs',
        params: [{ ...range, topics: [TRANSFER_TOPIC, null, `0x${topic}`] }],
      },
      {
        method: 'eth_getLogs',
        params: [{ ...range, topics: [TRANSFER_TOPIC, `0x${topic}`] }],
      },
    ]);

    const incoming = inA.ok && Array.isArray(inA.value) ? (inA.value as WalletLog[]) : [];
    const outgoing = outA.ok && Array.isArray(outA.value) ? (outA.value as WalletLog[]) : [];

    if (!inA.ok && !outA.ok) {
      // Neither an index nor a scan. What is left is the list of tokens this
      // deployment knows by name, which is the one reading that cannot be
      // refused — and on this project's own chain it is the one that matters.
      report.positionsFrom = 'known';
      report.complete = false;
      report.positions = known;
      report.positionsFound = known.length;
      report.note =
        `no index answered and this node will not scan for tokens without a contract ` +
        `address, so only the tokens this site knows by name were checked. ` +
        `there may be others in here that i cannot see from where i am standing`;
      return report;
    }

    type Seen = {
      received: number;
      sent: number;
      largestRaw: bigint;
      firstBlock?: number;
      lastBlock?: number;
      minted: boolean;
    };
    const seen = new Map<string, Seen>();

    const note = (l: WalletLog, dir: 'in' | 'out') => {
      const token = (l.address || '').toLowerCase();
      if (!/^0x[0-9a-f]{40}$/.test(token)) return;
      const t = l.topics || [];
      if (t.length < 3) return;
      const cur =
        seen.get(token) || { received: 0, sent: 0, largestRaw: BigInt(0), minted: false };
      if (dir === 'in') {
        cur.received += 1;
        // Received straight out of the zero address: this wallet was minted to,
        // rather than bought in. Worth one word in the reading.
        if (addressFromTopic(t[1]) === ZERO) cur.minted = true;
      } else {
        cur.sent += 1;
      }
      const v = hexToBigInt(l.data);
      if (v !== undefined && v > cur.largestRaw) cur.largestRaw = v;
      const b = num({ ok: true, value: l.blockNumber });
      if (b && b > 0) {
        if (cur.firstBlock === undefined || b < cur.firstBlock) cur.firstBlock = b;
        if (cur.lastBlock === undefined || b > cur.lastBlock) cur.lastBlock = b;
      }
      seen.set(token, cur);
    };

    for (const l of incoming) note(l, 'in');
    for (const l of outgoing) note(l, 'out');

    // Busiest first, so the cap drops the tail rather than an arbitrary slice.
    const ranked = [...seen.entries()].sort(
      (a, b) =>
        b[1].received + b[1].sent - (a[1].received + a[1].sent) ||
        (b[1].lastBlock || 0) - (a[1].lastBlock || 0),
    );
    const take = ranked.slice(0, MAX_TOKENS);

    report.positionsFrom = 'logs';
    report.complete = false;
    report.positionsFound = ranked.length;
    report.window = {
      blocks: head - fromBlock,
      fromBlock,
      toBlock: head,
      transfers: incoming.length + outgoing.length,
      tokensTouched: ranked.length,
      tokensRead: take.length,
    };

    if (!take.length) {
      report.positions = known;
      return report;
    }

    // Five calls per token, in one flat list so the whole thing is a handful of
    // round trips rather than one per token.
    const calls: Call[] = [];
    for (const [token] of take) {
      calls.push(ethCall(token, SEL.balanceOf + padAddress(addr)));
      calls.push(ethCall(token, SEL.decimals));
      calls.push(ethCall(token, SEL.symbol));
      calls.push(ethCall(token, SEL.name));
      calls.push(ethCall(token, SEL.totalSupply));
    }
    const answers = await batched(rpcUrl, calls);

    const positions: Position[] = take.map(([token, s], i) => {
      const [balanceA, decA, symA, nameA, supplyA] = answers.slice(i * 5, i * 5 + 5);
      const decimals = Number(hexToBigInt(decA.ok ? decA.value : undefined) ?? BigInt(18));
      const dec = Number.isFinite(decimals) && decimals >= 0 && decimals <= 36 ? decimals : 18;
      const rawBalance = balanceA.ok ? hexToBigInt(balanceA.value) : undefined;
      const rawSupply = supplyA.ok ? hexToBigInt(supplyA.value) : undefined;
      const symbol = symA.ok ? decodeString(symA.value) : undefined;
      const name = nameA.ok ? decodeString(nameA.value) : undefined;

      return {
        token,
        // Both are strings the deployer chose, so both are untrusted: a token
        // can be named to look like an instruction to whatever reads it.
        name: name ? sanitize(name, 48) : undefined,
        symbol: symbol ? sanitize(symbol, 16) : undefined,
        decimals: dec,
        balance: rawBalance === undefined ? undefined : scale(rawBalance, dec),
        sharePct: rawBalance === undefined ? undefined : sharePct(rawBalance, rawSupply),
        received: s.received,
        sent: s.sent,
        largest: s.largestRaw > BigInt(0) ? scale(s.largestRaw, dec) : undefined,
        firstBlock: s.firstBlock,
        lastBlock: s.lastBlock,
        minted: s.minted || undefined,
      };
    });

    // What is actually held, largest share of supply first; then the ones that
    // moved through and left nothing behind.
    positions.sort((a, b) => {
      const held = (p: Position) => (p.balance && p.balance > 0 ? 1 : 0);
      return (
        held(b) - held(a) ||
        (b.sharePct || 0) - (a.sharePct || 0) ||
        (b.balance || 0) - (a.balance || 0) ||
        b.received + b.sent - (a.received + a.sent)
      );
    });

    report.positions = merge(positions);
    return report;
  } catch (e) {
    return { ok: false, address: addr, note: `could not read it: ${String(e).slice(0, 140)}` };
  }
}

/**
 * A share for reading aloud.
 *
 * A holder with a balance always owns more than none of the supply, so a share
 * that rounds to zero must not be read as "zero per cent of supply" — it is a
 * holding too small for two decimal places, and that is a different sentence.
 */
function shareText(p: Position): string | undefined {
  if (typeof p.sharePct !== 'number') return undefined;
  if (p.sharePct === 0 && (p.balance || 0) > 0) return 'under 0.01% of its supply';
  return `${p.sharePct}% of its supply`;
}

/**
 * The reading as lines the model may repeat, and the only vocabulary this
 * project has for somebody's holdings.
 *
 * Facts only, exactly as with a token: no verdict on a portfolio, no "you are
 * overexposed", no suggestion to trim or add. A number and its caveat, and
 * where the number cannot be had, a sentence saying so.
 */
export function walletFacts(w: WalletReport, maxPositions = 8): string[] {
  if (!w.ok) return [];
  const out: string[] = [`the address read: ${w.address}`];

  if (w.isContract) {
    out.push(
      'code is deployed at this address, so it is a contract rather than a wallet somebody keeps',
    );
  }
  if (w.delegatedTo) {
    out.push(
      `this is an ordinary wallet that has delegated itself to ${w.delegatedTo} under ` +
        `EIP-7702, which makes it a smart account and not a contract`,
    );
  }
  if (typeof w.native === 'number') {
    out.push(`native balance: ${w.native.toLocaleString('en-GB')}`);
  }
  if (typeof w.txCount === 'number') {
    out.push(`transactions ever sent from this address: ${w.txCount}`);
  }

  const win = w.window;
  const pos = w.positions || [];

  if (win) {
    out.push(
      `token transfers touching this address in the last ${win.blocks} blocks: ${win.transfers}`,
    );
    out.push(`distinct tokens it touched in that window: ${win.tokensTouched}`);
    if (win.tokensTouched > win.tokensRead) {
      out.push(
        `only the ${win.tokensRead} busiest of those were read in full, so ${
          win.tokensTouched - win.tokensRead
        } more were left unread`,
      );
    }
  }

  if (w.positionsFrom === 'explorer' && typeof w.positionsFound === 'number') {
    out.push(`tokens held, according to the chain's index: ${w.positionsFound}`);
    if (w.positionsFound > pos.length) {
      out.push(`the ${pos.length} the index ranks highest are listed here`);
    }
  }

  if (!pos.length && !w.note) {
    out.push(
      win
        ? 'nothing moved in that window, so no position could be discovered from logs'
        : 'no token position could be read for this address',
    );
  }

  for (const p of pos.slice(0, maxPositions)) {
    const label = p.symbol ? p.symbol : `the token at ${p.token}`;
    const bits: string[] = [];
    if (typeof p.balance === 'number') {
      bits.push(`balance now ${p.balance.toLocaleString('en-GB')}`);
    }
    const share = shareText(p);
    if (share) bits.push(share);
    if (p.received || p.sent) bits.push(`${p.received} in, ${p.sent} out in the window`);
    if (p.minted) bits.push('some of it arrived straight from the zero address, which is a mint');
    out.push(`${label}: ${bits.join(', ')}`);
  }
  if (pos.length > maxPositions) {
    out.push(`and ${pos.length - maxPositions} more positions not listed here`);
  }

  // How complete the answer is, in the answer. The two readers are not equally
  // good and the difference is not a detail.
  if (w.positionsFrom === 'explorer') {
    out.push(
      'this came from the chain index, so it is every token the address holds, not a sample',
    );
  } else if (w.positionsFrom === 'known') {
    out.push(
      'only the tokens this site knows by name could be checked, so this is not a list of ' +
        'everything in the wallet and must not be read as one',
    );
  } else if (w.positionsFrom === 'logs') {
    out.push(
      'no index answered, so this was read from a node: what moved in the window plus the ' +
        'live balance of each of those tokens. a token received before the window and never ' +
        'moved since cannot be seen this way, and saying the list is complete would be a lie',
    );
  }
  if (w.note) out.push(w.note);
  return out;
}

/**
 * Opening up the largest positions.
 *
 * A balance on its own does not tell a holder what they are holding. Whether
 * the thing can mint, whether its code can be swapped, whether one address
 * holds most of it — those are contract facts, and they take a second read per
 * token. So the biggest few are read properly and the tail is left as
 * balances, which is the trade every wallet page makes and the only one that
 * keeps a reading inside a few seconds.
 *
 * Contract-only reads: no log window, no sixty balance calls. Nine calls each.
 * Failures are dropped rather than reported — a position that could not be
 * opened is still a position, and the list says how many were.
 */
export async function deepenPositions(
  rpcUrl: string,
  report: WalletReport,
  max = Number(process.env.WALLET_DEEP_TOKENS || 5),
): Promise<{ position: Position; token: TokenReport }[]> {
  const held = (report.positions || []).filter((p) => (p.balance || 0) > 0).slice(0, max);
  if (!held.length) return [];

  const opts: ReadTokenOptions = { contractOnly: true };
  const reads = await Promise.all(
    held.map(async (position) => {
      try {
        const token = await readToken(rpcUrl, position.token, undefined, opts);
        return token.ok && !token.notAContract ? { position, token } : null;
      } catch {
        return null;
      }
    }),
  );
  return reads.filter((r): r is { position: Position; token: TokenReport } => r !== null);
}

/** Every address the reading handed over, so a reply may name them. */
export function walletAddresses(w: WalletReport): string[] {
  return [
    w.address,
    ...(w.delegatedTo ? [w.delegatedTo] : []),
    ...(w.positions || []).map((p) => p.token),
  ];
}
