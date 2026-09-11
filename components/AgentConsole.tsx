'use client';

import { useCallback, useEffect, useState } from 'react';

/**
 * The review desk.
 *
 * Everything the agent writes lands here as a draft and waits. This page is
 * the human gate made usable: read it, fix a line if it needs one, approve or
 * bin it. Built for a phone, because that is where it will actually be used.
 *
 * The secret is the same one the cron uses, and it is held only in this
 * browser's localStorage and sent as a bearer token — never in the URL, which
 * would put it in history and in server logs. The page itself is public; it
 * simply cannot do anything without the secret.
 */

type Row = {
  id: string;
  date: string;
  status: 'draft' | 'approved' | 'posted' | 'rejected';
  angle: string;
  by: { provider: string; model: string };
  text: string;
};

const KEY = 'hollowmere.agent.key';

export default function AgentConsole() {
  const [secret, setSecret] = useState('');
  const [remembered, setRemembered] = useState(false);
  const [rows, setRows] = useState<Row[] | null>(null);
  const [store, setStore] = useState('');
  const [lastTick, setLastTick] = useState(0);
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [drafts, setDrafts] = useState<Record<string, string>>({});

  useEffect(() => {
    try {
      const k = window.localStorage.getItem(KEY);
      if (k) {
        setSecret(k);
        setRemembered(true);
      }
    } catch {
      /* private window; the field just starts empty */
    }
  }, []);

  const auth = useCallback(
    (extra?: Record<string, string>) => ({
      authorization: `Bearer ${secret}`,
      ...(extra || {}),
    }),
    [secret],
  );

  const load = useCallback(
    async (key?: string) => {
      const use = key ?? secret;
      if (!use) return;
      setBusy('load');
      setNote('');
      try {
        const r = await fetch('/api/agent/review', {
          headers: { authorization: `Bearer ${use}` },
          cache: 'no-store',
        });
        if (r.status === 401) {
          setNote('that secret is not right');
          setRows(null);
          return;
        }
        if (!r.ok) throw new Error(`${r.status}`);
        const j = (await r.json()) as { dispatches: Row[]; store: string; lastTickAt: number };
        setRows(j.dispatches);
        setStore(j.store);
        setLastTick(j.lastTickAt);
        try {
          window.localStorage.setItem(KEY, use);
          setRemembered(true);
        } catch {
          /* nothing to do */
        }
      } catch (e) {
        setNote(`could not load: ${String(e).slice(0, 120)}`);
      } finally {
        setBusy(null);
      }
    },
    [secret],
  );

  useEffect(() => {
    if (remembered && secret && rows === null) void load(secret);
  }, [remembered, secret, rows, load]);

  const act = async (id: string, status: 'approved' | 'rejected') => {
    setBusy(id);
    setNote('');
    try {
      const edited = drafts[id];
      const r = await fetch('/api/agent/review', {
        method: 'POST',
        headers: auth({ 'content-type': 'application/json' }),
        body: JSON.stringify({ id, status, ...(edited ? { text: edited } : {}) }),
      });
      if (!r.ok) throw new Error(`${r.status}`);
      setDrafts((d) => {
        const next = { ...d };
        delete next[id];
        return next;
      });
      await load();
    } catch (e) {
      setNote(`could not save: ${String(e).slice(0, 120)}`);
    } finally {
      setBusy(null);
    }
  };

  const writeNow = async () => {
    setBusy('tick');
    setNote('');
    try {
      const r = await fetch('/api/agent/tick?force=1', { method: 'POST', headers: auth() });
      const j = (await r.json()) as { ok?: boolean; skipped?: string; error?: string };
      if (j.error) setNote(j.error);
      else if (j.skipped) setNote(j.skipped);
      else setNote('written');
      await load();
    } catch (e) {
      setNote(`tick failed: ${String(e).slice(0, 140)}`);
    } finally {
      setBusy(null);
    }
  };

  const forget = () => {
    try {
      window.localStorage.removeItem(KEY);
    } catch {
      /* nothing to do */
    }
    setSecret('');
    setRemembered(false);
    setRows(null);
  };

  /* ------------------------------------------------------------- the gate */

  if (!rows) {
    return (
      <main className="agent">
        <h1>the review desk</h1>
        <p className="agent-lead">
          Nothing the agent writes reaches the raven until it is approved here.
        </p>
        <form
          className="agent-gate"
          onSubmit={(e) => {
            e.preventDefault();
            void load();
          }}
        >
          <input
            type="password"
            value={secret}
            onChange={(e) => setSecret(e.target.value)}
            placeholder="CRON_SECRET"
            aria-label="agent secret"
            autoComplete="current-password"
            spellCheck={false}
          />
          <button className="btn primary" type="submit" disabled={!secret || busy === 'load'}>
            {busy === 'load' ? 'checking' : 'open'}
          </button>
        </form>
        {note && <p className="agent-note">{note}</p>}
      </main>
    );
  }

  /* -------------------------------------------------------------- the desk */

  const waiting = rows.filter((r) => r.status === 'draft');
  const settled = rows.filter((r) => r.status !== 'draft');

  return (
    <main className="agent">
      <header className="agent-head">
        <div>
          <h1>the review desk</h1>
          <p className="agent-meta">
            <b>{waiting.length}</b> waiting · last tick{' '}
            <b>
              {lastTick
                ? new Date(lastTick).toLocaleString('en-GB', {
                    day: '2-digit',
                    month: 'short',
                    hour: '2-digit',
                    minute: '2-digit',
                  })
                : 'never'}
            </b>{' '}
            · store <b>{store}</b>
          </p>
        </div>
        <div className="agent-actions">
          <button className="btn primary" onClick={() => void writeNow()} disabled={!!busy}>
            {busy === 'tick' ? 'writing' : 'write one now'}
          </button>
          <button className="btn" onClick={() => void load()} disabled={!!busy}>
            refresh
          </button>
          <button className="btn" onClick={forget}>
            lock
          </button>
        </div>
      </header>

      {note && <p className="agent-note">{note}</p>}

      {waiting.length === 0 && (
        <p className="agent-lead">No drafts waiting. Press “write one now” to make one.</p>
      )}

      {waiting.map((r) => (
        <article className="agent-card" key={r.id}>
          <div className="agent-card-head">
            <span className="pill draft">draft</span>
            <span className="agent-tag">{r.angle}</span>
            <span className="agent-tag dim">
              {r.date} · {r.by.provider}/{r.by.model}
            </span>
          </div>
          <textarea
            value={drafts[r.id] ?? r.text}
            onChange={(e) => setDrafts((d) => ({ ...d, [r.id]: e.target.value }))}
            rows={Math.max(5, (drafts[r.id] ?? r.text).split('\n').length + 1)}
            spellCheck={false}
            aria-label={`post text, ${r.angle}`}
          />
          <div className="agent-card-foot">
            <button
              className="btn primary"
              onClick={() => void act(r.id, 'approved')}
              disabled={busy === r.id}
            >
              {busy === r.id ? 'saving' : drafts[r.id] ? 'save and approve' : 'approve'}
            </button>
            <button
              className="btn warm"
              onClick={() => void act(r.id, 'rejected')}
              disabled={busy === r.id}
            >
              reject
            </button>
            {drafts[r.id] && (
              <button
                className="btn"
                onClick={() =>
                  setDrafts((d) => {
                    const next = { ...d };
                    delete next[r.id];
                    return next;
                  })
                }
              >
                undo edits
              </button>
            )}
          </div>
        </article>
      ))}

      {settled.length > 0 && (
        <>
          <h2 className="agent-h2">already dealt with</h2>
          {settled.map((r) => (
            <article className="agent-card quiet" key={r.id}>
              <div className="agent-card-head">
                <span className={`pill ${r.status}`}>{r.status}</span>
                <span className="agent-tag">{r.angle}</span>
                <span className="agent-tag dim">{r.date}</span>
              </div>
              <p className="agent-text">{r.text}</p>
              {r.status === 'rejected' && (
                <div className="agent-card-foot">
                  <button
                    className="btn"
                    onClick={() => void act(r.id, 'approved')}
                    disabled={busy === r.id}
                  >
                    approve after all
                  </button>
                </div>
              )}
            </article>
          ))}
        </>
      )}
    </main>
  );
}
