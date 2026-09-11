import { BRAND } from '@/lib/content';

/**
 * Contract address and chain, served from their own endpoint so they can change
 * without a rebuild. Today they come from environment variables; when they need
 * to change live, Vercel Edge Config drops in right here and the front end
 * stays untouched.
 *
 * It answers with BRAND rather than raw environment variables, which is the
 * same thing the room itself reads. Returning the bare variables made this look
 * unconfigured — four empty strings — while the site was in fact showing the
 * right chain and ticker from the defaults in code. Only the contract address
 * is genuinely empty, and it stays that way until there is one.
 */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  return Response.json({
    contract: BRAND.contract,
    chain: BRAND.chain,
    explorer: BRAND.explorer,
    ticker: BRAND.ticker,
  });
}
