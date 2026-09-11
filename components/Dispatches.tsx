'use client';

import { useEffect, useState } from 'react';
import { NOTES } from '@/lib/content';

/**
 * What the raven brought back.
 *
 * Approved dispatches from the agent, with the written NOTES standing in until
 * there are any. That fallback is the whole reason this is safe to ship before
 * the agent is switched on: the room reads as finished either way, and nobody
 * sees an empty panel waiting on a cron.
 *
 * Nothing here is trusted to be short. The agent writes to the house voice, but
 * a dispatch is still model output arriving in a fixed layout, so it is clamped
 * rather than allowed to push the panel around.
 */

type Scrap = { date: string; text: string; live?: boolean };

export default function Dispatches() {
  const [scraps, setScraps] = useState<Scrap[]>(() =>
    NOTES.map((n) => ({ date: n.date, text: n.text })),
  );

  useEffect(() => {
    let dropped = false;
    fetch('/api/raven', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((j: { dispatches?: Scrap[] } | null) => {
        if (dropped || !j?.dispatches?.length) return;
        setScraps(j.dispatches.slice(0, 4).map((d) => ({ ...d, live: true })));
      })
      .catch(() => {
        /* the written scraps are already on screen */
      });
    return () => {
      dropped = true;
    };
  }, []);

  return (
    <div className="notes">
      {scraps.map((s, i) => (
        <div className={`note ${s.live ? 'fresh' : ''}`} key={`${s.date}-${i}`}>
          <time>{s.date}</time>
          <p>{s.text}</p>
        </div>
      ))}
    </div>
  );
}
