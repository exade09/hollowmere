import type { Metadata } from 'next';
import AgentConsole from '@/components/AgentConsole';
import { BRAND } from '@/lib/content';

/**
 * Kept out of search results and out of link previews. The page is harmless
 * without the secret, but there is no reason for it to be discoverable either.
 */
export const metadata: Metadata = {
  title: `${BRAND.world} — the review desk`,
  robots: { index: false, follow: false, nocache: true },
};

export default function AgentPage() {
  return <AgentConsole />;
}
