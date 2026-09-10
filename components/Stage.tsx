'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Aspect, CANVASES, Scene, Zone, aspectFor } from '@/lib/scenes';

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
 * Two aspects are authored, 16:9 and 21:9, and they are the same picture from
 * the same camera — the wide pass keeps the vertical field of view and adds its
 * pixels at the sides. The window picks one, and the frame is then letterboxed
 * rather than cropped: a room that loses its edges is both worse to look at and
 * partly unusable, because that is where the door and the raven live.
 *
 * The interaction logic knows nothing about any of this. Zones carry the same
 * labels and actions in both aspects; only their rectangles differ.
 */
export default function Stage({ scene, onZone, locked }: Props) {
  const [hd, setHd] = useState(true);
  const [aspect, setAspect] = useState<Aspect>('16x9');
  const [active, setActive] = useState<Zone | null>(null);
  const [hovered, setHovered] = useState<string | null>(null);
  const [clipReady, setClipReady] = useState(false);
  const idleRef = useRef<HTMLVideoElement | null>(null);

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
