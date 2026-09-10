'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { CANVAS, Scene, Zone } from '@/lib/scenes';

type Props = {
  scene: Scene;
  onZone: (zone: Zone) => void;
  /**
   * Zone whose clip must stay on screen regardless of the cursor — set while a
   * panel is open, so opening a widget does not snap the room back to idle.
   */
  locked?: Zone | null;
};

/**
 * A scene is a looping idle video, a hover clip layered on top, and a
 * transparent SVG of hotzone rectangles.
 *
 * The frame is authored once at 1920x1080 and always letterboxed, never
 * cropped: a room that gets its sides cut off on a 16:10 laptop is both worse
 * to look at and unusable, because the door and the raven end up outside the
 * window. The SVG uses the matching preserveAspectRatio, so a hotzone stays
 * exactly on its object at any window size.
 */
export default function Stage({ scene, onZone, locked }: Props) {
  const [hd, setHd] = useState(true);
  const [active, setActive] = useState<Zone | null>(null);
  const [hovered, setHovered] = useState<string | null>(null);
  const [clipReady, setClipReady] = useState(false);
  const idleRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    const pick = () => setHd(window.innerWidth > 1280);
    pick();
    window.addEventListener('resize', pick);
    return () => window.removeEventListener('resize', pick);
  }, []);

  const res = hd ? '1080p' : '720p';
  const src = useCallback(
    (clip: string) => `/clips/${scene.dir}/${res}/${clip}.mp4`,
    [scene.dir, res],
  );
  const poster = useCallback(
    (clip: string) => `/clips/${scene.dir}/poster/${clip}.jpg`,
    [scene.dir],
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

  return (
    <div className="stage">
      <video
        key={`${scene.id}-idle-${res}`}
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
            key={`${scene.id}-${shown.clip}-${res}`}
            className={`stage-frame ${clipReady ? '' : 'hidden'}`}
            src={src(shown.clip)}
            autoPlay
            loop
            muted
            playsInline
            preload="auto"
            onCanPlay={() => setClipReady(true)}
          />
        </>
      )}

      <div className="stage-vignette" aria-hidden="true" />

      <svg className="hotzones" viewBox={`0 0 ${CANVAS.w} ${CANVAS.h}`} preserveAspectRatio="xMidYMid meet">
        {scene.zones.map((z) => (
          <rect
            key={z.label}
            className="hotzone"
            x={z.rect.x}
            y={z.rect.y}
            width={z.rect.w}
            height={z.rect.h}
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
        ))}
      </svg>

      <div className={`zone-label ${hovered ? 'on' : ''}`}>{hovered ?? ''}</div>
    </div>
  );
}
