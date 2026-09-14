'use client';

import { useEffect, useState } from 'react';
import { BRAND } from './content';

/**
 * The address, live.
 *
 * Every place the address appears — the bottom bar, the sigil panel, the share
 * card — reads it through here, so the admin desk changes all three at once and
 * none of them can disagree with the others. That was the whole reason the
 * value was centralised in the first place; the only change is that it now
 * comes over the wire instead of out of the bundle.
 *
 * Three things make it feel immediate rather than eventual:
 *
 *   - it starts at the compiled value, so the first paint is never empty on a
 *     deployment that has one and there is no flash of "not spoken yet";
 *   - it re-reads when the tab comes back to the front, which covers the case
 *     that actually happens — the address lands, somebody switches to the tab
 *     they left open;
 *   - it polls slowly in the background for the case where the tab was never
 *     left at all, which is launch night with the site on a second monitor.
 *
 * A failed read changes nothing on screen. A bar showing a slightly stale
 * address is a smaller problem than a bar that empties itself because one
 * request timed out.
 */

const POLL_MS = 20_000;

export type LiveAddress = {
  /** Whatever should sit after "CA:" — an address, or a word like TBA. */
  text: string;
  /** True only when the text is shaped like an address on this chain. */
  isAddress: boolean;
};

function shape(text: string): LiveAddress {
  return { text, isAddress: /^0x[0-9a-fA-F]{40}$/.test(text.trim()) };
}

export function useAddress(): LiveAddress {
  const [live, setLive] = useState<LiveAddress>(() => shape(BRAND.contract));

  useEffect(() => {
    let alive = true;

    const pull = async () => {
      try {
        const r = await fetch('/api/config', { cache: 'no-store' });
        if (!r.ok) return;
        const j = (await r.json()) as { contract?: string; isAddress?: boolean };
        if (!alive || typeof j.contract !== 'string') return;
        setLive({
          text: j.contract,
          isAddress:
            typeof j.isAddress === 'boolean' ? j.isAddress : shape(j.contract).isAddress,
        });
      } catch {
        /* keep whatever is on screen */
      }
    };

    void pull();
    const timer = setInterval(pull, POLL_MS);
    const onShow = () => {
      if (document.visibilityState === 'visible') void pull();
    };
    document.addEventListener('visibilitychange', onShow);
    window.addEventListener('focus', onShow);

    return () => {
      alive = false;
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onShow);
      window.removeEventListener('focus', onShow);
    };
  }, []);

  return live;
}
