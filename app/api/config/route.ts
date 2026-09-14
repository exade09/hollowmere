import { BRAND } from '@/lib/content';
import { addressKind, currentAddress, looksLikeAddress } from '@/lib/settings';

/**
 * Contract address and chain, served from their own endpoint so they can
 * change without a rebuild — and now they actually do. The address comes from
 * the store the admin desk writes, falling back to NEXT_PUBLIC_CONTRACT when
 * nothing has been set there, so a deployment that never opens the desk
 * behaves exactly as it always did.
 *
 * The rest still answers with BRAND rather than raw environment variables,
 * which is the same thing the room itself reads. Returning the bare variables
 * made this look unconfigured — four empty strings — while the site was in
 * fact showing the right chain and ticker from the defaults in code.
 *
 * `isAddress` is the flag the front end needs and should not work out for
 * itself: the field is free text, so it may hold TBA or SOON, and only a value
 * shaped like an address gets a copy button and an explorer link.
 */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const now = await currentAddress();
  return Response.json(
    {
      contract: now.text,
      isAddress: looksLikeAddress(now.text),
      // Which shape it is, so the front end can offer the links that shape
      // actually supports rather than all of them.
      kind: addressKind(now.text),
      from: now.from,
      chain: BRAND.chain,
      explorer: BRAND.explorer,
      ticker: BRAND.ticker,
    },
    // The bar has to change the moment the desk writes, so nothing on the way
    // here is allowed to hold a copy.
    { headers: { 'cache-control': 'no-store, max-age=0' } },
  );
}
