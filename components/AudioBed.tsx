'use client';

import { useEffect, useRef } from 'react';
import { SPHERES } from '@/lib/content';
import { Save } from '@/lib/save';

type Props = {
  save: Save;
  /** True once the visitor has clicked into the room — the gesture browsers require. */
  started: boolean;
};

const FADE_MS = 700;

/**
 * One looping audio element for the whole site, driven by the save.
 *
 * Two things make this fiddly and both are handled here: browsers refuse to
 * start audio before a real user gesture, so nothing plays until the visitor
 * has clicked into the room; and cutting between tracks is jarring, so the
 * volume is ramped down before a swap and back up after it.
 */
export default function AudioBed({ save, started }: Props) {
  const el = useRef<HTMLAudioElement | null>(null);
  const ramp = useRef<number | null>(null);
  const current = useRef<string | null>(null);

  const stopRamp = () => {
    if (ramp.current !== null) {
      window.clearInterval(ramp.current);
      ramp.current = null;
    }
  };

  /** Slides the element's volume to `to` over FADE_MS, then runs `done`. */
  const fadeTo = (to: number, done?: () => void) => {
    const a = el.current;
    if (!a) return;
    stopRamp();
    const from = a.volume;
    const steps = Math.max(1, Math.round(FADE_MS / 40));
    let i = 0;
    ramp.current = window.setInterval(() => {
      i += 1;
      const v = from + (to - from) * (i / steps);
      a.volume = Math.min(1, Math.max(0, v));
      if (i >= steps) {
        stopRamp();
        done?.();
      }
    }, 40);
  };

  useEffect(() => {
    const a = el.current;
    if (!a) return;

    const sphere = SPHERES.find((s) => s.id === save.audio.track);
    const wanted = !save.audio.muted && started ? sphere?.file ?? null : null;

    if (!wanted) {
      if (!a.paused) fadeTo(0, () => a.pause());
      current.current = null;
      return;
    }

    if (current.current === wanted) {
      fadeTo(save.audio.vol);
      return;
    }

    const swap = () => {
      a.src = wanted;
      current.current = wanted;
      a.volume = 0;
      a.play().then(() => fadeTo(save.audio.vol)).catch(() => {
        // Autoplay was still refused; the next gesture will get another go.
        current.current = null;
      });
    };

    if (!a.paused && a.volume > 0.01) fadeTo(0, swap);
    else swap();
  }, [save.audio.track, save.audio.muted, save.audio.vol, started]);

  useEffect(() => stopRamp, []);

  return <audio ref={el} loop preload="none" aria-hidden="true" />;
}
