import type { Metadata } from 'next';
import AgentConsole from '@/components/AgentConsole';

/**
 * Kept out of search results and out of link previews. The page is harmless
 * without the secret, but there is no reason for it to be discoverable either.
 */
export const metadata: Metadata = {
  title: 'HOLLOWMERE — the review desk',
  robots: { index: false, follow: false, nocache: true },
};

export default function AgentPage() {
  return <AgentConsole />;
}
