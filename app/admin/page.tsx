import type { Metadata } from 'next';
import AddressDesk from '@/components/AddressDesk';
import { BRAND } from '@/lib/content';

/**
 * Kept out of search results and out of link previews. The page is harmless
 * without the password — it can do nothing at all until the server accepts one
 * — but there is no reason for it to be discoverable either.
 */
export const metadata: Metadata = {
  title: `${BRAND.world} — the address desk`,
  robots: { index: false, follow: false, nocache: true },
};

export default function AdminPage() {
  return <AddressDesk />;
}
