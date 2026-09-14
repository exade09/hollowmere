'use client';

import { useState } from 'react';
import { ACCOUNT } from '@/lib/content';
import { Save, patch } from '@/lib/save';
import { SCENES, SceneId } from '@/lib/scenes';
import { useAddress } from '@/lib/useAddress';
import { PageMark, XMark } from '@/components/icons';

type Props = {
  scene: SceneId;
  save: Save;
  onMap: () => void;
  onSigil: () => void;
  onSpeak: () => void;
  onLedger: () => void;
  onGames: () => void;
  refresh: () => void;
};

/**
 * The permanent bottom bar: the contract address is always on screen and
 * copies in one click. Same pattern as the reference, where the radio and the
 * menu were always docked there.
 *
 * The address is labelled CA and comes from the live config rather than the
 * bundle, so the admin desk changes it here without a deploy. It is free text
 * — before there is an address it can read TBA or SOON — and only a value
 * shaped like an address gets a copy button, because a page people paste into
 * a DEX must never hand them a word.
 */
export default function Chrome({
  scene,
  save,
  onMap,
  onSigil,
  onSpeak,
  onLedger,
  onGames,
  refresh,
}: Props) {
  const [copied, setCopied] = useState(false);
  const { text: ca, isAddress } = useAddress();

  const copy = async () => {
    if (!isAddress) {
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

  const shown = isAddress && ca.length > 14 ? `${ca.slice(0, 6)}…${ca.slice(-4)}` : ca;

  return (
    <div className="chrome">
      <button
        className="chrome-btn wide"
        onClick={copy}
        title={isAddress ? 'copy the address' : 'the mark of the hollow'}
      >
        <span className="dot" />
        <span className="mono">CA: {ca ? shown : 'not spoken yet'}</span>
        <span className="dim">{copied ? '· copied' : ''}</span>
      </button>

      <button className="chrome-btn" onClick={onMap}>the hold</button>
      <button className="chrome-btn speak-btn" onClick={onSpeak} title="talk to Wick">
        <span className="speak-mark" aria-hidden="true" />
        speak to wick
      </button>
      <button className="chrome-btn" onClick={onLedger} title="read a wallet">
        what you hold
      </button>
      <button className="chrome-btn" onClick={onGames} title="three small games">
        minigames
      </button>

      <button
        className="chrome-btn"
        onClick={() => { patch({ audio: { ...save.audio, muted: !save.audio.muted } }); refresh(); }}
        aria-pressed={!save.audio.muted}
      >
        {save.audio.muted ? '♪ off' : '♪ on'}
      </button>

      <span className="chrome-spacer" />

      <a
        className="chrome-btn chrome-link"
        href="/docs"
        title="the manual"
      >
        <PageMark />
        docs
      </a>
      <a
        className="chrome-btn chrome-link"
        href={`https://x.com/${ACCOUNT}`}
        target="_blank"
        rel="noreferrer"
        title={`@${ACCOUNT} on X`}
        aria-label={`@${ACCOUNT} on X`}
      >
        <XMark />
      </a>

      <span className="chrome-place">{SCENES[scene].title}</span>
      <span className="chrome-btn wide chrome-nights" title="distinct days you have come back">
        nights: {save.nights}
      </span>
    </div>
  );
}
