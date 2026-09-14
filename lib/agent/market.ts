/**
 * Public market context for a token on Robinhood Chain.
 *
 * Blockscout supplies the holder census and distinguishes contracts from EOAs.
 * DexScreener supplies the strongest indexed market. Both are optional: an
 * unavailable index must leave an unknown field, never turn into a zero.
 */

export type HolderSnapshot = {
  count?: number;
  topEoaSharePct?: number;
  topTenEoaSharePct?: number;
  eoaHoldersAtLeastOnePct?: number;
  contractShareInTopPagePct?: number;
};

export type MarketSnapshot = {
  pairUrl: string;
  dexId?: string;
  quoteSymbol?: string;
  liquidityUsd?: number;
  volume24hUsd?: number;
  buys24h?: number;
  sells24h?: number;
  priceChange24hPct?: number;
  marketCapUsd?: number;
  fdvUsd?: number;
  pairAgeHours?: number;
};

type HolderRow = {
  address?: { hash?: string; is_contract?: boolean };
  value?: string;
};

type Pair = {
  chainId?: string;
  dexId?: string;
  url?: string;
  baseToken?: { address?: string };
  quoteToken?: { symbol?: string };
  txns?: { h24?: { buys?: number; sells?: number } };
  volume?: { h24?: number };
  priceChange?: { h24?: number };
  liquidity?: { usd?: number };
  marketCap?: number;
  fdv?: number;
  pairCreatedAt?: number;
};

const TIMEOUT_MS = 7_000;
const CACHE_MS = 30_000;
const cache = new Map<
  string,
  { at: number; value: { holders?: HolderSnapshot; market?: MarketSnapshot } }
>();

async function json(url: string): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      headers: {
        accept: 'application/json',
        'user-agent': 'Mozilla/5.0 (compatible; Hollowmere/1.0; +https://hollow.family)',
      },
      cache: 'no-store',
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`market source ${response.status}`);
    return await response.json();
  } finally {
    clearTimeout(timer);
  }
}

function number(value: unknown): number | undefined {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function share(raw: bigint, supply: bigint): number {
  return Math.round(Number((raw * BigInt(100_000)) / supply)) / 1_000;
}

function holdersFrom(
  meta: unknown,
  page: unknown,
  supply: bigint | undefined,
): HolderSnapshot | undefined {
  const metadata = meta as { holders_count?: string | number };
  const rows = Array.isArray((page as { items?: unknown[] })?.items)
    ? ((page as { items: HolderRow[] }).items || [])
    : [];
  const count = number(metadata?.holders_count);
  if (count === undefined && !rows.length) return undefined;

  const result: HolderSnapshot = { count };
  if (!supply || supply <= BigInt(0)) return result;

  const eoaShares: number[] = [];
  let contractShare = 0;
  for (const row of rows) {
    if (!row.value || !/^\d+$/.test(row.value)) continue;
    const pct = share(BigInt(row.value), supply);
    if (row.address?.is_contract) contractShare += pct;
    else eoaShares.push(pct);
  }

  result.topEoaSharePct = eoaShares[0];
  result.topTenEoaSharePct =
    Math.round(eoaShares.slice(0, 10).reduce((sum, pct) => sum + pct, 0) * 1_000) / 1_000;
  result.eoaHoldersAtLeastOnePct = eoaShares.filter((pct) => pct >= 1).length;
  result.contractShareInTopPagePct = Math.round(contractShare * 1_000) / 1_000;
  return result;
}

function marketFrom(raw: unknown, address: string): MarketSnapshot | undefined {
  const pairs = Array.isArray((raw as { pairs?: unknown[] })?.pairs)
    ? ((raw as { pairs: Pair[] }).pairs || [])
    : [];
  const wanted = pairs.filter(
    (pair) =>
      pair.chainId === 'robinhood' &&
      pair.baseToken?.address?.toLowerCase() === address.toLowerCase() &&
      typeof pair.url === 'string',
  );
  wanted.sort((a, b) => (number(b.liquidity?.usd) || 0) - (number(a.liquidity?.usd) || 0));
  const pair = wanted[0];
  if (!pair?.url) return undefined;

  const created = number(pair.pairCreatedAt);
  return {
    pairUrl: pair.url,
    dexId: pair.dexId,
    quoteSymbol: pair.quoteToken?.symbol,
    liquidityUsd: number(pair.liquidity?.usd),
    volume24hUsd: number(pair.volume?.h24),
    buys24h: number(pair.txns?.h24?.buys),
    sells24h: number(pair.txns?.h24?.sells),
    priceChange24hPct: number(pair.priceChange?.h24),
    marketCapUsd: number(pair.marketCap),
    fdvUsd: number(pair.fdv),
    pairAgeHours:
      created === undefined ? undefined : Math.max(0, Math.round((Date.now() - created) / 36_000) / 100),
  };
}

export async function readMarketContext(
  address: string,
  supply: bigint | undefined,
): Promise<{ holders?: HolderSnapshot; market?: MarketSnapshot }> {
  const key = address.toLowerCase();
  const cached = cache.get(key);
  if (cached && Date.now() - cached.at < CACHE_MS) return cached.value;

  const explorer =
    process.env.CHAIN_EXPLORER_API || 'https://robinhoodchain.blockscout.com/api/v2';
  const encoded = encodeURIComponent(key);
  const [meta, holderPage, dex] = await Promise.allSettled([
    json(`${explorer}/tokens/${encoded}`),
    json(`${explorer}/tokens/${encoded}/holders`),
    json(`https://api.dexscreener.com/latest/dex/tokens/${encoded}`),
  ]);

  const value = {
    holders:
      meta.status === 'fulfilled' && holderPage.status === 'fulfilled'
        ? holdersFrom(meta.value, holderPage.value, supply)
        : undefined,
    market: dex.status === 'fulfilled' ? marketFrom(dex.value, key) : undefined,
  };
  cache.set(key, { at: Date.now(), value });
  return value;
}

