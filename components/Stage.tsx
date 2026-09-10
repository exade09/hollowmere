'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CANVAS, Scene, Zone } from '@/lib/scenes';

type Props = {
  scene: Scene;
  onZone: (zone: Zone) => void;
};

/**
 * A scene is a looping idle video, a hover clip layered on top, and a
 * transparent SVG of hotzone rectangles. Same trick as the reference: the
 * canvas is fixed at 1920x1080 and object-fit stretches it over the viewport,
 * so a click always lands on the right pixel with nothing to recompute on
 * resize.
 */
export default function Stage({ scene, onZone }: Props) {
  const [hd, setHd] = useState(true);
  const [fit, setFit] = useState<'cover' | 'contain'>('cover');
  const [active, setActive] = useState<Zone | null>(null);
  const [clipReady, setClipReady] = useState(false);
  const idleRef = useRef<HTMLVideoElement | null>(null);
  const clipRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    const pick = () => {
      setHd(window.innerWidth > 1280 && window.devicePixelRatio >= 1);
      // The frame is authored in 16:9. On a narrower viewport, cover would
      // crop away half the scene along with its hotzones, so fit it instead.
      setFit(window.innerWidth / window.innerHeight >= 1.34 ? 'cover' : 'contain');
    };
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
    setClipReady(false);
  }, [scene.id]);

  const enter = (z: Zone) => {
    if (z.clip === scene.idle) return; // zone with no clip of its own
    setClipReady(false);
    setActive(z);
  };

  const leave = () => {
    setActive(null);
    setClipReady(false);
  };

  const viewBox = `0 0 ${CANVAS.w} ${CANVAS.h}`;
  const par = fit === 'cover' ? 'xMidYMid slice' : 'xMidYMid meet';
  const hovered = useMemo(() => active?.label ?? null, [active]);

  return (
    <div className="stage">
      <video
        key={`${scene.id}-idle-${res}`}
        ref={idleRef}
        className="stage-frame"
        style={{ objectFit: fit }}
        src={src(scene.idle)}
        poster={poster(scene.idle)}
        autoPlay
        loop
        muted
        playsInline
        preload="auto"
      />

      {active && (
        <>
          {/* the poster shows instantly while the clip buffers */}
          <img
            className={`stage-frame ${clipReady ? 'hidden' : ''}`}
            style={{ objectFit: fit }}
            src={poster(active.clip)}
            alt=""
            aria-hidden="true"
          />
          <video
            key={`${scene.id}-${active.clip}-${res}`}
            ref={clipRef}
            className={`stage-frame ${clipReady ? '' : 'hidden'}`}
            style={{ objectFit: fit }}
            src={src(active.clip)}
            autoPlay
            loop
            muted
            playsInline
            preload="auto"
            onCanPlay={() => setClipReady(true)}
          />
        </>
      )}

      <svg
        className="hotzones"
        viewBox={viewBox}
        preserveAspectRatio={par}
        style={{ objectFit: fit }}
      >
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
