'use client';

import { useState } from 'react';
import { BRAND } from '@/lib/content';
import { Save, patch } from '@/lib/save';
import { SCENES, SceneId } from '@/lib/scenes';

type Props = {
  scene: SceneId;
  save: Save;
  onMap: () => void;
  onSigil: () => void;
  refresh: () => void;
};

/**
 * The permanent bottom bar: the contract address is always on screen and
 * copies in one click. Same pattern as the reference, where the radio and the
 * menu were always docked there.
 */
export default function Chrome({ scene, save, onMap, onSigil, refresh }: Props) {
  const [copied, setCopied] = useState(false);
  const ca = BRAND.contract;

  const copy = async () => {
    if (!ca) {
      onSigil();
      return;
    }
    try {
      await navigator.clipboard.writeText(ca);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      onSigil();
    }
  };

  const short = ca.length > 14 ? `${ca.slice(0, 6)}…${ca.slice(-4)}` : ca;

  return (
    <div className="chrome">
      <button className="chrome-btn wide" onClick={copy} title="copy the address">
        <span className="dot" />
        <span className="mono">{ca ? short : 'address not spoken yet'}</span>
        <span className="dim">{copied ? '· copied' : ''}</span>
      </button>

      <button className="chrome-btn" onClick={onMap}>the hold</button>

      <button
        className="chrome-btn"
        onClick={() => { patch({ audio: { ...save.audio, muted: !save.audio.muted } }); refresh(); }}
        aria-pressed={!save.audio.muted}
      >
        {save.audio.muted ? '♪ off' : '♪ on'}
      </button>

      <span className="chrome-spacer" />

      <span className="chrome-place">{SCENES[scene].title}</span>
      <span className="chrome-btn wide chrome-nights" title="distinct days you have come back">
        nights: {save.nights}
      </span>
    </div>
  );
}
