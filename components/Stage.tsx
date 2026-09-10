'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { RAVEN_CAW } from '@/lib/content';
import { Aspect, CANVASES, Scene, Zone, aspectFor } from '@/lib/scenes';

type Props = {
  scene: Scene;
  onZone: (zone: Zone) => void;
  /**
   * Zone whose clip must stay on screen regardless of the cursor — set while a
   * panel is open, so opening a widget does not snap the room back to idle.
   */
  locked?: Zone | null;
  /** Sound state, for the raven's caw. Off until the visitor enables audio. */
  sfx?: { on: boolean; vol: number };
};

/**
 * A scene is a looping idle video, a hover clip layered on top, and a
 * transparent SVG of hotzone rectangles.
 *
 * Two aspects are authored, 16:9 and 21:9, and they are the same picture from
 * the same camera — the wide pass keeps the vertical field of view and adds its
 * pixels at the sides. The window picks one, and the frame is then letterboxed
 * rather than cropped: a room that loses its edges is both worse to look at and
 * partly unusable, because that is where the door and the raven live.
 *
 * The interaction logic knows nothing about any of this. Zones carry the same
 * labels and actions in both aspects; only their rectangles differ.
 */
export default function Stage({ scene, onZone, locked, sfx }: Props) {
  const [hd, setHd] = useState(true);
  const [aspect, setAspect] = useState<Aspect>('16x9');
  const [active, setActive] = useState<Zone | null>(null);
  const [hovered, setHovered] = useState<string | null>(null);
  const [clipReady, setClipReady] = useState(false);
  const idleRef = useRef<HTMLVideoElement | null>(null);
  const hoverRef = useRef<HTMLVideoElement | null>(null);
  const cawRef = useRef<HTMLAudioElement | null>(null);
  const cawFired = useRef(false);

  useEffect(() => {
    const pick = () => {
      setHd(window.innerWidth > 1280);
      setAspect(aspectFor(window.innerWidth, window.innerHeight));
    };
    pick();
    window.addEventListener('resize', pick);
    return () => window.removeEventListener('resize', pick);
  }, []);

  const res = hd ? '1080p' : '720p';
  const dir = scene.dirs[aspect];
  const src = useCallback(
    (clip: string) => `/clips/${dir}/${res}/${clip}.mp4`,
    [dir, res],
  );
  const poster = useCallback(
    (clip: string) => `/clips/${dir}/poster/${clip}.jpg`,
    [dir],
  );

  // Dropping hover when the scene changes keeps a stale clip off screen.
  useEffect(() => {
    setActive(null);
    setHovered(null);
    setClipReady(false);
  }, [scene.id]);

  const enter = (z: Zone) => {
    if (locked) return;
    setHovered(z.label);
    if (z.clip === scene.idle) return; // zone with no clip of its own
    setClipReady(false);
    setActive(z);
  };

  const leave = () => {
    if (locked) return;
    setHovered(null);
    setActive(null);
    setClipReady(false);
  };

  const shown = locked && locked.clip !== scene.idle ? locked : locked ? null : active;
  const canvas = CANVASES[aspect];

  // Last resort for the same race: if a clip is on screen and playable but
  // nothing told us, notice within a frame or two rather than never.
  useEffect(() => {
    if (!shown || clipReady) return;
    const tick = window.setInterval(() => {
      const v = hoverRef.current;
      if (v && v.readyState >= 3) setClipReady(true);
    }, 120);
    return () => window.clearInterval(tick);
  }, [shown, clipReady]);

  // Warm the hover posters once the room is up, so the first hover over a zone
  // never shows a gap where the idle frame is still on screen. Posters only —
  // the clips themselves are far larger and arrive fast enough on their own.
  useEffect(() => {
    let cancelled = false;
    const queue = scene.zones
      .filter((z) => z.clip !== scene.idle)
      .map((z) => poster(z.clip));
    const warm = (i: number) => {
      if (cancelled || i >= queue.length) return;
      const img = new Image();
      img.onload = img.onerror = () => warm(i + 1);
      img.src = queue[i];
    };
    const start = window.setTimeout(() => warm(0), 1200);
    return () => {
      cancelled = true;
      window.clearTimeout(start);
    };
  }, [scene, poster]);

  // The caw belongs to the Sanctum's idle loop and nowhere else: the hover
  // clips do not animate the beak. Polled rather than driven by timeupdate,
  // which only fires about four times a second and would miss the mark.
  const cawArmed = scene.id === 'sanctum' && !shown && !!sfx?.on;
  useEffect(() => {
    if (!cawArmed) {
      cawFired.current = false;
      return;
    }
    const tick = window.setInterval(() => {
      const v = idleRef.current;
      const a = cawRef.current;
      if (!v || !a || v.paused) return;
      const t = v.currentTime;
      if (t < RAVEN_CAW.at - 0.4) cawFired.current = false;
      if (!cawFired.current && t >= RAVEN_CAW.at) {
        cawFired.current = true;
        a.currentTime = 0;
        a.volume = Math.min(1, (sfx?.vol ?? 0) * RAVEN_CAW.gain);
        a.play().catch(() => { /* still waiting on a gesture */ });
      }
    }, 60);
    return () => window.clearInterval(tick);
  }, [cawArmed, sfx?.vol]);

  return (
    <div className="stage">
      <video
        key={`${scene.id}-idle-${aspect}-${res}`}
        ref={idleRef}
        className="stage-frame"
        src={src(scene.idle)}
        poster={poster(scene.idle)}
        autoPlay
        loop
        muted
        playsInline
        preload="auto"
      />

      {shown && (
        <>
          {/* the poster shows instantly while the clip buffers */}
          <img
            className={`stage-frame ${clipReady ? 'hidden' : ''}`}
            src={poster(shown.clip)}
            alt=""
            aria-hidden="true"
          />
          <video
            key={`${scene.id}-${shown.clip}-${aspect}-${res}`}
            ref={(el) => {
              hoverRef.current = el;
              // A cached clip can reach canplay before React attaches the
              // handler below, and then the event never arrives: the poster
              // stays on top of a video that is playing underneath it, so the
              // room shows one frozen frame instead of the animation. Reading
              // the state here as well as listening for it closes that race.
              if (el && el.readyState >= 3) setClipReady(true);
            }}
            className={`stage-frame ${clipReady ? '' : 'hidden'}`}
            src={src(shown.clip)}
            autoPlay
            loop
            muted
            playsInline
            preload="auto"
            onCanPlay={() => setClipReady(true)}
            onLoadedData={() => setClipReady(true)}
          />
        </>
      )}

      <audio ref={cawRef} src={RAVEN_CAW.file} preload="auto" aria-hidden="true" />

      <div className="stage-vignette" aria-hidden="true" />

      <svg
        className="hotzones"
        viewBox={`0 0 ${canvas.w} ${canvas.h}`}
        preserveAspectRatio="xMidYMid meet"
      >
        {scene.zones.map((z) => {
          const r = z.rects[aspect];
          return (
            <rect
              key={z.label}
              className="hotzone"
              x={r.x}
              y={r.y}
              width={r.w}
              height={r.h}
              role="button"
              tabIndex={0}
              aria-label={z.label}
              onMouseEnter={() => enter(z)}
              onMouseLeave={leave}
              onFocus={() => enter(z)}
              onBlur={leave}
              onClick={() => onZone(z)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  onZone(z);
                }
              }}
            />
          );
        })}
      </svg>

      <div className={`zone-label ${hovered ? 'on' : ''}`}>{hovered ?? ''}</div>
    </div>
  );
}
