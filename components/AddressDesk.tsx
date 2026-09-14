'use client';

import { useCallback, useEffect, useState } from 'react';

/**
 * The address desk.
 *
 * One field, and it is the one string on this site that has to change at an
 * hour nobody planned. Whatever is typed here appears after CA: on the site
 * within a few seconds — in the bottom bar, in the sigil panel and on the
 * share card at once, because all three read the same live value.
 *
 * The field takes any text on purpose. TBA and SOON are states this project
 * actually passes through, and they are the same field as an address rather
 * than a separate feature. A value shaped like an address gets a working copy
 * button and an explorer link on the site; a word gets neither, which is the
 * one piece of validation worth having — handing somebody the word SOON out of
 * a button they expected to give them a contract is worse than no button.
 *
 * The password is held in this browser's localStorage and sent as a bearer
 * token, never in the URL, where it would land in history and in server logs.
 * The page itself is public and does nothing at all without it.
 */

type State = {
  address: string;
  showing: string;
  from: 'store' | 'env' | 'none';
  isAddress: boolean;
  store: 'upstash' | 'file';
  durable: boolean;
  updatedAt: number;
};

const KEY = 'hollowmere.admin.key';

/**
 * A response body, whether or not it is json.
 *
 * A route that throws answers with an empty body, and calling .json() on that
 * throws its own error — which is how a read-only filesystem on the host
 * turned into "SyntaxError: Unexpected end of JSON input" on screen. The
 * status code is always something; the body is not.
 */
async function readJson(r: Response): Promise<Partial<State> & { error?: string }> {
  const text = await r.text();
  if (!text) return {};
  try {
    return JSON.parse(text) as Partial<State> & { error?: string };
  } catch {
    // A body that is not json at all — a host's own error page, usually.
    return { error: text.slice(0, 160) };
  }
}

export default function AddressDesk() {
  const [password, setPassword] = useState('');
  const [remembered, setRemembered] = useState(false);
  const [state, setState] = useState<State | null>(null);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState<'open' | 'save' | null>(null);
  const [note, setNote] = useState('');

  useEffect(() => {
    try {
      const k = window.localStorage.getItem(KEY);
      if (k) {
        setPassword(k);
        setRemembered(true);
      }
    } catch {
      /* private window; the field just starts empty */
    }
  }, []);

  const open = useCallback(
    async (key?: string) => {
      const use = key ?? password;
      if (!use) return;
      setBusy('open');
      setNote('');
      try {
        const r = await fetch('/api/admin/address', {
          headers: { authorization: `Bearer ${use}` },
          cache: 'no-store',
        });
        const j = await readJson(r);
        if (!r.ok) {
          setState(null);
          setNote(j.error || `that did not open (${r.status})`);
          return;
        }
        setState(j as State);
        setDraft(j.address || '');
        try {
          window.localStorage.setItem(KEY, use);
          setRemembered(true);
        } catch {
          /* nothing to do */
        }
      } catch (e) {
        setNote(`could not reach the desk: ${String(e).slice(0, 120)}`);
      } finally {
        setBusy(null);
      }
    },
    [password],
  );

  useEffect(() => {
    if (remembered && password && state === null) void open(password);
  }, [remembered, password, state, open]);

  const save = async (value: string) => {
    setBusy('save');
    setNote('');
    try {
      const r = await fetch('/api/admin/address', {
        method: 'POST',
        headers: { authorization: `Bearer ${password}`, 'content-type': 'application/json' },
        body: JSON.stringify({ address: value }),
      });
      const j = await readJson(r);
      if (!r.ok) {
        setNote(j.error || `it would not save (${r.status})`);
        return;
      }
      setState(j as State);
      setDraft(j.address || '');
      setNote(value ? 'written. the site is showing it' : 'cleared');
    } catch (e) {
      setNote(`it would not save: ${String(e).slice(0, 120)}`);
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
    setPassword('');
    setRemembered(false);
    setState(null);
    setNote('locked');
  };

  /* ------------------------------------------------------------- the gate */

  if (!state) {
    return (
      <main className="agent">
        <h1>the address desk</h1>
        <p className="agent-lead">
          One field: whatever should stand after CA: on the site. It can be an address, or a
          word like TBA.
        </p>
        <form
          className="agent-gate"
          onSubmit={(e) => {
            e.preventDefault();
            void open();
          }}
        >
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="password"
            aria-label="admin password"
            autoComplete="current-password"
            spellCheck={false}
          />
          <button className="btn primary" type="submit" disabled={!password || busy === 'open'}>
            {busy === 'open' ? 'checking' : 'open'}
          </button>
        </form>
        {note && <p className="agent-note">{note}</p>}
      </main>
    );
  }

  /* ------------------------------------------------------------- the desk */

  const dirty = draft.trim() !== state.address;

  return (
    <main className="agent">
      <header className="agent-head">
        <div>
          <h1>the address desk</h1>
          <p className="agent-meta">
            showing <b>{state.showing || 'nothing'}</b> · from <b>{state.from}</b> · store{' '}
            <b>{state.store}</b>
          </p>
        </div>
        <div className="agent-actions">
          <button className="btn" onClick={() => void open()} disabled={!!busy}>
            refresh
          </button>
          <button className="btn" onClick={forget}>
            lock
          </button>
        </div>
      </header>

      {!state.durable && (
        <p className="agent-note">
          There is no key-value store configured, so this desk is writing to a file. That
          works on a laptop and not on a serverless host, where the filesystem is read-only
          and the write fails outright. In Vercel: Storage, Create Database, Upstash, Redis
          — connect it to this project and redeploy. It sets the two variables itself and
          this line goes away. A Postgres database is not what this needs: the whole store
          is one string.
        </p>
      )}

      <article className="agent-card">
        <div className="agent-card-head">
          <span className="agent-tag">after CA:</span>
          <span className="agent-tag dim">
            {state.isAddress ? 'an address — copy and explorer are live' : 'plain text — no copy button'}
          </span>
        </div>

        <form
          className="agent-gate"
          onSubmit={(e) => {
            e.preventDefault();
            void save(draft.trim());
          }}
        >
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="0x… or TBA"
            aria-label="what stands after CA"
            spellCheck={false}
            maxLength={64}
          />
          <button className="btn primary" type="submit" disabled={busy === 'save' || !dirty}>
            {busy === 'save' ? 'writing' : 'write'}
          </button>
        </form>

        <div className="agent-actions">
          <button className="btn" onClick={() => void save('TBA')} disabled={!!busy}>
            TBA
          </button>
          <button className="btn" onClick={() => void save('SOON')} disabled={!!busy}>
            SOON
          </button>
          <button className="btn warm" onClick={() => void save('')} disabled={!!busy}>
            clear
          </button>
        </div>

        <p className="agent-note">
          {state.updatedAt
            ? `last written ${new Date(state.updatedAt).toLocaleString('en-GB')}`
            : 'nothing written here yet, so the site is using the build value'}
        </p>
      </article>

      {note && <p className="agent-note">{note}</p>}

      <p className="agent-lead">
        An open tab picks this up within twenty seconds, and immediately when it comes back to
        the front.
      </p>
    </main>
  );
}
