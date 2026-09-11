'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  FireState,
  SLOTS,
  begin,
  fractionLeft,
  relight,
  step,
} from '@/lib/games/fire';
import { Save, recordFire } from '@/lib/save';

/**
 * KEEP THE FIRE — the arcade.
 *
 * Eight sconces in a ring, the way they sit on the Sanctum wall. One at a time
 * a flame starts to fail; click it before it goes out. Let one die and the
 * watch is over. The window shrinks as you go, and past fourteen relights two
 * can fail at once.
 *
 * It is Wick's actual duty, which is why it is the arcade rather than a
 * shooter: the reference's game was a cat shooting things, and copying the
 * shape of that here would have produced a game about nothing.
 *
 * All the rules live in lib/games/fire.ts. This file is the shell: it runs the
 * clock, measures how long the page was not being painted, and draws. No
 * canvas — eight elements on a circle keep the chamfered edges everything else
 * in this project is cut to.
 */
export default function KeepTheFire({ save, refresh }: { save: Save; refresh: () => void }) {
  const [state, setState] = useState<FireState | null>(null);
  /** Redraw ticker: fuses are read off the clock, not stored per frame. */
  const [, setBeat] = useState(0);

  const ref = useRef<FireState | null>(null);
  const raf = useRef<number | null>(null);
  /** Set while the page is not being painted; the gap is forgiven on return. */
  const hiddenAt = useRef<number | null>(null);
  const forgive = useRef(0);

  const best = save.games.fireBest;
  const phase = state === null ? 'idle' : state.dead !== null ? 'over' : 'watching';

  const stop = useCallback(() => {
    if (raf.current !== null) cancelAnimationFrame(raf.current);
    raf.current = null;
  }, []);

  useEffect(() => stop, [stop]);

  // A hidden tab gets no frames while the clock keeps running. The time is
  // measured here and handed to the machine, which is the only honest way to
  // tell "looked away" apart from "did not click".
  useEffect(() => {
    const onVisibility = () => {
      if (document.hidden) {
        hiddenAt.current = performance.now();
      } else if (hiddenAt.current !== null) {
        forgive.current += performance.now() - hiddenAt.current;
        hiddenAt.current = null;
      }
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, []);

  const start = () => {
    stop();
    forgive.current = 0;
    hiddenAt.current = null;
    const first = begin(performance.now());
    ref.current = first;
    setState(first);

    const frame = (t: number) => {
      const taken = forgive.current;
      forgive.current = 0;
      const next = step(ref.current as FireState, t, { forgive: taken });
      ref.current = next;
      setState(next);
      if (next.dead !== null) {
        recordFire(next.score);
        refresh();
        stop();
        return;
      }
      setBeat((b) => (b + 1) % 1000);
      raf.current = requestAnimationFrame(frame);
    };
    raf.current = requestAnimationFrame(frame);
  };

  const put = (slot: number) => {
    if (!ref.current || ref.current.dead !== null) return;
    const next = relight(ref.current, slot);
    ref.current = next;
    setState(next);
  };

  const now = typeof performance === 'undefined' ? 0 : performance.now();

  return (
    <div className="game fire">
      <div className="game-head">
        <span className="game-score">{state?.score ?? 0}</span>
        <span className="game-label">relit</span>
        <span className="chrome-spacer" />
        <span className="game-label">best {best}</span>
      </div>

      <div className="ring" role="group" aria-label="eight sconces">
        {Array.from({ length: SLOTS }, (_, i) => {
          const f = state?.failing.find((x) => x.slot === i);
          const left = f ? fractionLeft(f, now) : 1;
          const angle = (i / SLOTS) * 360 - 90;
          return (
            <button
              key={i}
              className={`sconce ${f ? 'failing' : ''} ${state?.dead === i ? 'dead' : ''}`}
              style={{
                transform: `rotate(${angle}deg) translate(var(--ring-r)) rotate(${-angle}deg)`,
              }}
              onPointerDown={() => put(i)}
              disabled={phase !== 'watching'}
              aria-label={`sconce ${i + 1}${f ? ', failing' : ''}`}
            >
              <span className="flame" style={f ? { opacity: 0.3 + left * 0.7 } : undefined} />
              {f && <span className="fuse" style={{ transform: `scaleX(${left})` }} />}
            </button>
          );
        })}
        <div className="ring-core" aria-hidden="true" />
      </div>

      {phase === 'idle' && (
        <div className="game-foot">
          <p className="dim">they go out one at a time. put them back.</p>
          <button className="btn primary" onClick={start}>
            take the watch
          </button>
        </div>
      )}

      {phase === 'watching' && <p className="dim game-foot">keep them lit</p>}

      {phase === 'over' && state && (
        <div className="game-foot">
          <p>
            {state.score === 0
              ? 'one went out before you moved'
              : state.score >= best
                ? `${state.score} relit. the longest watch yet`
                : `${state.score} relit`}
          </p>
          <button className="btn primary" onClick={start}>
            again
          </button>
        </div>
      )}
    </div>
  );
}
