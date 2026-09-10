/**
 * Contract address and chain are served from their own endpoint so they can
 * change without a rebuild. Today they come from Vercel environment
 * variables; when they need to change live, Vercel Edge Config drops in right
 * here and the front end stays untouched.
 */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  return Response.json({
    contract: process.env.NEXT_PUBLIC_CONTRACT ?? '',
    chain: process.env.NEXT_PUBLIC_CHAIN ?? '',
    explorer: process.env.NEXT_PUBLIC_EXPLORER ?? '',
    ticker: process.env.NEXT_PUBLIC_TICKER ?? '',
  });
}
