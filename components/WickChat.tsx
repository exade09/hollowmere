'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * Speaking into the mirror.
 *
 * Wick answers here in the first person, the way he already does in the rest
 * of the widgets. Paste a contract address and he reads the chain for it — the
 * endpoint notices an address in the message and hands him the figures. He
 * states them and will not judge them, which is enforced on the server rather
 * than asked for here.
 *
 * The transcript is kept in localStorage so closing the panel does not end the
 * conversation, and trimmed hard: it is atmosphere, not an archive, and it is
 * also what gets sent back as history on the next turn.
 */

type Turn = { role: 'user' | 'assistant'; content: string };

const KEY = 'hollowmere.wick.chat';
const KEEP = 8;
const MAX = 600;

export default function WickChat() {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState('');
  const tail = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(KEY);
      if (raw) setTurns(JSON.parse(raw) as Turn[]);
    } catch {
      /* private window, or nothing stored */
    }
  }, []);

  // Scroll to the newest line when one arrives, but never on the first run.
  // Opening the mirror should show the mirror: jumping straight to an old
  // conversation puts his portrait and his sheet above the top of the panel.
  const settled = useRef(false);
  useEffect(() => {
    try {
      window.localStorage.setItem(KEY, JSON.stringify(turns.slice(-KEEP)));
    } catch {
      /* storage blocked; the conversation simply does not survive a reload */
    }
    if (settled.current) tail.current?.scrollIntoView({ block: 'nearest' });
    else settled.current = true;
  }, [turns]);

  const send = async () => {
    const message = draft.trim().slice(0, MAX);
    if (!message || busy) return;
    setDraft('');
    setNote('');
    setBusy(true);
    const history = turns.slice(-6);
    setTurns((t) => [...t, { role: 'user', content: message }]);
    try {
      const r = await fetch('/api/wick', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ message, history }),
      });
      const j = (await r.json()) as { text?: string; error?: string; read?: { symbol?: string } };
      // Even a refusal comes back in his voice, so there is nothing to
      // translate here: whatever the server said is what he said.
      setTurns((t) => [
        ...t,
        { role: 'assistant', content: j.text || 'not tonight.\n\nthe words will not come' },
      ]);
      if (j.read?.symbol) setNote(`read the chain for ${j.read.symbol}`);
    } catch {
      setTurns((t) => [
        ...t,
        { role: 'assistant', content: 'the mirror went dark.\n\ntry again' },
      ]);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="wick-chat">
      <div className="label-sm">speak into it</div>

      {turns.length > 0 && (
        <div className="wick-log">
          {turns.slice(-KEEP).map((t, i) => (
            <p key={i} className={t.role === 'user' ? 'said' : 'wick'}>
              {t.content}
            </p>
          ))}
          <div ref={tail} />
        </div>
      )}

      <form
        className="wick-ask"
        onSubmit={(e) => {
          e.preventDefault();
          void send();
        }}
      >
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="ask him something, or paste a contract address"
          aria-label="speak to Wick"
          maxLength={MAX}
          disabled={busy}
        />
        <button className="btn primary" type="submit" disabled={busy || !draft.trim()}>
          {busy ? 'listening' : 'speak'}
        </button>
      </form>

      {note && <p className="wick-note">{note}</p>}
      <p className="wick-small">
        He reads what the chain says and does not rate it. Nothing here will ever ask you
        for a seed phrase or a private key.
      </p>
    </div>
  );
}
