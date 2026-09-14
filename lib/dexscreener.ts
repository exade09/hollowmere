export type DexAddressKind = 'evm' | 'solana' | null;

const DEFAULT_BASE = 'https://dexscreener.com';

/**
 * Build the Raven's live market URL from the current CA shape.
 *
 * Hollow Agent is on Robinhood Chain, whose DexScreener slug is `robinhood`.
 * The desk also recognises a Solana-shaped address, so older state still opens
 * on the chain it belongs to instead of silently producing a dead link.
 *
 * NEXT_PUBLIC_DEXSCREENER may be an origin/base, a legacy chain prefix, or a
 * `{chain}` template. The live address kind always wins.
 */
export function dexScreenerUrl(
  address: string,
  kind: DexAddressKind,
  configuredBase = process.env.NEXT_PUBLIC_DEXSCREENER || DEFAULT_BASE,
): string | null {
  const ca = address.trim();
  if (!ca || !kind) return null;

  const chain = kind === 'evm' ? 'robinhood' : 'solana';
  const configured = configuredBase.trim() || DEFAULT_BASE;
  if (configured.includes('{chain}')) {
    const base = configured.replaceAll('{chain}', chain).replace(/\/+$/, '');
    return `${base}/${encodeURIComponent(ca)}`;
  }

  const base = configured
    .replace(/\/+$/, '')
    .replace(/\/(?:solana|robinhood)$/i, '');
  return `${base}/${chain}/${encodeURIComponent(ca)}`;
}
