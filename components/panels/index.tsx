'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Panel from '@/components/Panel';
import WickChat from '@/components/WickChat';
import {
  ARCHIVE, BRAND, HOARD_NOTE, HOLD, LOCK_GLYPHS, LOCK_ORDER, NOTES, RITES, SOCIALS,
  SPHERES, TALLY_NOTES, WICK,
} from '@/lib/content';
import {
  CANDLE_HOURS, NIGHTS_FOR_KEY, Save, candleState, markBlock, patch, read,
} from '@/lib/save';
import { PanelId, SceneId } from '@/lib/scenes';

type HostProps = {
  id: PanelId;
  onClose: () => void;
  onTravel: (to: SceneId) => void;
  save: Save;
  refresh: () => void;
};

function shortCa(ca: string) {
  return ca.length > 14 ? `${ca.slice(0, 6)}…${ca.slice(-4)}` : ca;
}

/* ------------------------------------------------- the sigil: the contract */
function Sigil({ save, refresh }: { save: Save; refresh: () => void }) {
  const [copied, setCopied] = useState(false);
  const ca = BRAND.contract;

  const copy = async () => {
    if (!ca) return;
    try {
      await navigator.clipboard.writeText(ca);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      setCopied(false);
    }
  };

  return (
    <>
      <p className="lead">
        The mark was burned into this floor long before me. This string is the only name
        the place has.
      </p>
      <div className="ca">
        <span className="mono">{ca || 'the address has not been spoken yet'}</span>
        <span className="chrome-spacer" />
        <button className="btn" onClick={copy} disabled={!ca}>
          {copied ? 'copied' : 'copy'}
        </button>
      </div>
      <dl className="rows">
        <div className="row"><dt>ticker</dt><dd className="mono">{BRAND.ticker}</dd></div>
        <div className="row"><dt>chain</dt><dd className="mono">{BRAND.chain}</dd></div>
        <div className="row">
          <dt>ledger</dt>
          <dd>
            {BRAND.explorer && ca ? (
              <a href={`${BRAND.explorer}${ca}`} target="_blank" rel="noreferrer">
                watch what moves
              </a>
            ) : (
              <span className="dim">explorer not wired up yet</span>
            )}
          </dd>
        </div>
      </dl>
      <p>Stir the ash? Nothing will change. But I do keep the count.</p>
      <div className="actions">
        <button
          className="btn primary"
          onClick={() => { patch({ stirred: read().stirred + 1 }); refresh(); }}
        >
          yes
        </button>
        <button className="btn" onClick={() => refresh()}>no</button>
        <span className="chrome-btn wide">stirred: {save.stirred}</span>
      </div>
    </>
  );
}

/* -------------------------------------------------- the raven: word outside */
function Raven({ save }: { save: Save }) {
  const keyEarned = save.nights >= NIGHTS_FOR_KEY;
  return (
    <>
      <p className="lead">
        The raven goes where I no longer can. It comes back with scraps. I read what
        survived the trip.
      </p>
      <div className="notes">
        {NOTES.map((n) => (
          <div className="note fresh" key={n.date}>
            <time>{n.date}</time>
            <p>{n.text}</p>
          </div>
        ))}
      </div>
      <dl className="rows">
        {SOCIALS.map((s) => (
          <div className="row" key={s.name}>
            <dt>{s.name}</dt>
            <dd>
              <a href={s.href} target="_blank" rel="noreferrer">
                {s.href.replace('https://', '')}
              </a>
              <div className="dim" style={{ fontSize: 13 }}>{s.note}</div>
            </dd>
          </div>
        ))}
      </dl>
      <p className={keyEarned ? '' : 'dim'}>
        {keyEarned
          ? 'Last time it brought a rusted key. Not mine. The gate below is not mine either.'
          : `It is holding something in its beak and will not let go. Maybe on night ${NIGHTS_FOR_KEY}.`}
      </p>
    </>
  );
}

/* ------------------------------------------- the chest: the lock and reward */
const GLYPHS = LOCK_GLYPHS;
const TARGET = LOCK_ORDER;

function Chest({ save, refresh }: { save: Save; refresh: () => void }) {
  const solved = save.lockSolvedAt !== null;
  const [rings, setRings] = useState<number[]>([1, 6, 3]);
  const [tries, setTries] = useState(0);

  const ok = useMemo(() => rings.every((r, i) => r === TARGET[i]), [rings]);

  useEffect(() => {
    if (ok && !solved) {
      patch({ lockSolvedAt: Date.now() });
      markBlock('hoard');
      refresh();
    }
  }, [ok, solved, refresh]);

  if (solved) {
    return (
      <>
        <p className="lead">{HOARD_NOTE.title}</p>
        {HOARD_NOTE.body.map((b, i) => <p key={i}>{b}</p>)}
        <p className="mono dim">{HOARD_NOTE.sign}</p>
      </>
    );
  }

  const turn = (i: number, d: number) =>
    setRings((r) => {
      const next = [...r];
      next[i] = (next[i] + d + GLYPHS.length) % GLYPHS.length;
      setTries((t) => t + 1);
      return next;
    });

  return (
    <>
      <p className="lead">
        Three rings. Bring the marks someone already chose for us under the notch.
      </p>
      <div className="lock">
        <div className="lock-marker">▼ notch</div>
        <div className="rings">
          {rings.map((r, i) => (
            <div className={`ring-row ${r === TARGET[i] ? 'locked' : ''}`} key={i}>
              <button className="btn" onClick={() => turn(i, -1)} aria-label={`ring ${i + 1} left`}>‹</button>
              <div className="ring-track">
                {GLYPHS.map((g, k) => (
                  <div className={`ring-cell ${k === r ? 'mark' : ''}`} key={g}>{g}</div>
                ))}
              </div>
              <button className="btn" onClick={() => turn(i, 1)} aria-label={`ring ${i + 1} right`}>›</button>
            </div>
          ))}
        </div>
      </div>
      {tries >= 6 && (
        <p className="dim">
          The same marks are cut into the cage wall downstairs. Top to bottom.
        </p>
      )}
    </>
  );
}

/* ----------------------------------------------------- the shelf: archive */
function Books() {
  const tag = { ready: 'available', soon: 'not copied out yet', lost: 'pages missing' };
  return (
    <>
      <p className="lead">
        Everything saved from the library. Some of it was not saved. That stays as it is.
      </p>
      <div className="grid">
        {ARCHIVE.map((a) => (
          <div
            className={`card ${a.state === 'ready' ? 'open' : ''} ${a.state === 'lost' ? 'lost' : ''}`}
            key={a.name}
          >
            <b>{a.name}</b>
            <small>{a.note}</small>
            <span className="tag">
              {a.state === 'ready' && a.href
                ? <a href={a.href} download>{tag.ready}</a>
                : tag[a.state]}
            </span>
          </div>
        ))}
      </div>
    </>
  );
}

/* --------------------------------------------------------- the map: the hold */
function Hold({ onTravel }: { onTravel: (to: SceneId) => void }) {
  return (
    <>
      <p className="lead">The holding, all of it. Most of it is shut. I do not go there either.</p>
      <div className="grid">
        {HOLD.map((h) => (
          <div
            className={`card ${h.id ? 'open travel' : ''}`}
            key={h.name}
            onClick={() => h.id && onTravel(h.id)}
            role={h.id ? 'button' : undefined}
            tabIndex={h.id ? 0 : undefined}
            onKeyDown={(e) => { if (h.id && (e.key === 'Enter' || e.key === ' ')) onTravel(h.id); }}
          >
            {h.id && (
              <img
                className="card-icon"
                src={`/ui/icons/${h.id === 'sanctum' ? 'astro' : 'altar'}.png`}
                alt=""
                aria-hidden="true"
              />
            )}
            <b>{h.name}</b>
            <small>{h.note}</small>
            <span className="tag">{h.id ? 'go in' : 'shut'}</span>
          </div>
        ))}
      </div>
    </>
  );
}

/* ------------------------------------------------- the spheres: room sound */
function Spheres({ save, refresh }: { save: Save; refresh: () => void }) {
  const pick = (id: string) => {
    patch({ audio: { ...save.audio, track: id, muted: id === 'silence' ? true : false } });
    refresh();
  };
  const setVol = (v: number) => {
    patch({ audio: { ...save.audio, vol: v } });
    refresh();
  };
  const playing = !save.audio.muted;

  return (
    <>
      <p className="lead">
        The rings catch a sound that is not in the room. Pick one and it keeps
        going while you walk around; it is remembered for next time.
      </p>
      <div className="tracks">
        {SPHERES.map((s) => {
          const on = save.audio.track === s.id;
          return (
            <button
              className={`track ${on ? 'on' : ''}`}
              key={s.id}
              onClick={() => pick(s.id)}
              aria-pressed={on}
            >
              <span className="track-mark" aria-hidden="true" />
              <span className="track-name">
                <b>{s.title}</b>
                {s.artist && <small>{s.artist}</small>}
              </span>
              <span className="track-note">{s.note}</span>
              <span className="track-state">
                {on ? (s.file ? (playing ? 'playing' : 'paused') : 'kept') : ''}
              </span>
            </button>
          );
        })}
      </div>
      <div className="actions">
        <button
          className="btn"
          onClick={() => { patch({ audio: { ...save.audio, muted: !save.audio.muted } }); refresh(); }}
        >
          {playing ? 'stop' : 'play'}
        </button>
        <label className="vol">
          <span className="mono dim">volume</span>
          <input
            type="range"
            min={0}
            max={100}
            value={Math.round(save.audio.vol * 100)}
            onChange={(e) => setVol(Number(e.target.value) / 100)}
            aria-label="volume"
          />
          <span className="mono dim">{Math.round(save.audio.vol * 100)}</span>
        </label>
      </div>
      <p className="dim">
        Nothing plays until you have stepped into the room — browsers hold sound
        back until then, and I am not going to argue with them.
      </p>
    </>
  );
}

/* ---------------------------------------------- the mirror: card to share */
function Mirror({ save }: { save: Save }) {
  const canvas = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const c = canvas.current;
    if (!c) return;
    const g = c.getContext('2d');
    if (!g) return;
    // 1200x630 is what X and Telegram show as a link preview, so the same
    // image works both as a download and as an OG card.
    const W = 1200;
    const H = 630;
    c.width = W;
    c.height = H;

    g.fillStyle = '#0b0a10';
    g.fillRect(0, 0, W, H);
    g.strokeStyle = '#2e2a3a';
    g.lineWidth = 2;
    g.strokeRect(24, 24, W - 48, H - 48);

    g.fillStyle = '#4fd6c4';
    g.font = '600 20px ui-monospace, monospace';
    g.fillText('HOLLOWMERE · THE SANCTUM', 64, 92);

    g.fillStyle = '#e8e3d6';
    g.font = '700 68px Georgia, serif';
    g.fillText('WICK', 64, 176);

    g.font = '400 22px system-ui, sans-serif';
    g.fillStyle = '#9a93a4';
    g.fillText('the curse never checked out.', 64, 216);

    const rows: [string, string][] = [
      ['nights at the fire', String(save.nights)],
      ['places opened', `${save.blocks.length} of 10`],
      ['the chest lock', save.lockSolvedAt ? 'opened' : 'shut'],
      ['the candle', candleState(save).label],
      ['key to the gate', save.hasKey ? 'in hand' : 'none'],
    ];
    rows.forEach(([k, v], i) => {
      const y = 300 + i * 52;
      g.fillStyle = '#9a93a4';
      g.font = '400 16px ui-monospace, monospace';
      g.fillText(k.toUpperCase(), 64, y);
      g.fillStyle = '#e8e3d6';
      g.font = '600 26px Georgia, serif';
      g.fillText(v, 420, y + 4);
      g.strokeStyle = '#241f2f';
      g.lineWidth = 1;
      g.beginPath();
      g.moveTo(64, y + 18);
      g.lineTo(W - 64, y + 18);
      g.stroke();
    });

    g.fillStyle = '#d97a3d';
    g.font = '400 18px ui-monospace, monospace';
    g.fillText(
      BRAND.contract ? shortCa(BRAND.contract) : 'the address has not been spoken yet',
      64,
      H - 64,
    );

    // Wick goes on the right of the card. The image is async, so the card
    // draws complete without him first and he lands a moment later.
    const fig = new Image();
    fig.src = '/ui/wick.png';
    fig.onload = () => {
      const h = 470;
      const w = (fig.naturalWidth / fig.naturalHeight) * h;
      g.drawImage(fig, W - w - 78, H - h - 74, w, h);
    };
  }, [save]);

  const download = () => {
    canvas.current?.toBlob((b) => {
      if (!b) return;
      const url = URL.createObjectURL(b);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'hollowmere-card.png';
      a.click();
      URL.revokeObjectURL(url);
    }, 'image/png');
  };

  return (
    <>
      <p className="lead">
        There is no room in the mirror. There is only how long you have been standing here.
      </p>
      <div className="mirror-figure">
        <img src="/ui/wick.png" alt="Wick" className="wick" />
        <dl className="rows">
          {WICK.map(([k, v]) => (
            <div className="row" key={k}><dt>{k}</dt><dd>{v}</dd></div>
          ))}
        </dl>
      </div>
      <WickChat />
      <div className="share-preview">
        <canvas ref={canvas} aria-label="progress card" />
      </div>
      <div className="actions">
        <button className="btn primary" onClick={download}>save as image</button>
      </div>
    </>
  );
}

/* --------------------------------------------------- the cage: night count */
function Cage({ save }: { save: Save }) {
  const marks = Math.min(save.nights, 120);
  const opened = TALLY_NOTES.filter((n) => save.nights >= n.at);
  const next = TALLY_NOTES.find((n) => save.nights < n.at);
  return (
    <>
      <p className="lead">
        Someone counted nights in here. They never locked the door. There was no reason to.
      </p>
      <div className="tally" aria-label={`${save.nights} nights`}>
        {Array.from({ length: marks }, (_, i) => <i key={i} />)}
      </div>
      <dl className="rows">
        <div className="row"><dt>nights</dt><dd className="mono">{save.nights}</dd></div>
        <div className="row">
          <dt>first one</dt>
          <dd className="mono">
            {save.created ? new Date(save.created).toLocaleDateString('en-GB') : '—'}
          </dd>
        </div>
      </dl>
      <div className="notes">
        {opened.map((n) => (
          <div className="note" key={n.at}>
            <time>mark {n.at}</time>
            <p>{n.text}</p>
          </div>
        ))}
      </div>
      {next && <p className="dim">The next line shows up on night {next.at}.</p>}
      <div className="label-sm">cut deeper than the rest, top to bottom</div>
      <div className="scratches" aria-label="three marks cut into the wall">
        {LOCK_ORDER.map((g, i) => (
          <b key={i}>{LOCK_GLYPHS[g]}</b>
        ))}
      </div>
    </>
  );
}

/* ------------------------------------------- the altar: candle and duties */
function Altar({ save, refresh }: { save: Save; refresh: () => void }) {
  const st = candleState(save);
  const light = () => {
    patch({ vigilLitAt: Date.now(), vigilCount: read().vigilCount + 1 });
    refresh();
  };
  return (
    <>
      <p className="lead">
        My duty is to keep the fire. It burns down over {CANDLE_HOURS / 24} days, and it is
        the only thing here that changes on its own.
      </p>
      <div className="candle">
        <span className="mono dim" style={{ minWidth: 122 }}>{st.label}</span>
        <div className="candle-bar">
          <div className="candle-fill" style={{ width: `${Math.round(st.pct * 100)}%` }} />
        </div>
        <span className="mono dim">{Math.round(st.pct * 100)}%</span>
      </div>
      <div className="actions">
        <button className="btn warm" onClick={light}>
          {st.pct > 0 ? 'trim the wick' : 'light it again'}
        </button>
        <span className="chrome-btn wide">lit: {save.vigilCount}</span>
      </div>
      <p className="lead" style={{ marginTop: 22 }}>rites to keep</p>
      <div className="rites">
        {RITES.map((r) => (
          <div className={`rite ${r.done ? 'done' : ''}`} key={r.text}>
            <span className="box">{r.done ? '▣' : '□'}</span>
            <span>{r.text}</span>
          </div>
        ))}
      </div>
    </>
  );
}

/* ---------------------------------------------------- the gate: still shut */
function Gate({ save, refresh }: { save: Save; refresh: () => void }) {
  const earned = save.nights >= NIGHTS_FOR_KEY;
  const take = () => { patch({ hasKey: true }); refresh(); };

  if (save.hasKey) {
    return (
      <>
        <p className="lead">The key fit. There is a corridor behind the gate.</p>
        <p>There is nothing further along it yet. I checked.</p>
        <p className="dim">
          Once the third place is mapped the corridor becomes a way through, on its own,
          with no change to this page.
        </p>
      </>
    );
  }

  return (
    <>
      <p className="lead">
        A chain, a padlock, and three rings cut into it. The rings are decoration: this
        lock takes a key, not an order of marks.
      </p>
      <dl className="rows">
        <div className="row"><dt>lock</dt><dd>shut</dd></div>
        <div className="row"><dt>key</dt><dd>{earned ? 'the raven brought it' : 'the raven has it'}</dd></div>
        <div className="row"><dt>nights</dt><dd className="mono">{save.nights} of {NIGHTS_FOR_KEY}</dd></div>
      </dl>
      {earned ? (
        <div className="actions">
          <button className="btn primary" onClick={take}>take the key</button>
        </div>
      ) : (
        <p className="dim">
          It hands the key over on night {NIGHTS_FOR_KEY}. Come back{' '}
          {NIGHTS_FOR_KEY - save.nights} more time
          {NIGHTS_FOR_KEY - save.nights === 1 ? '' : 's'}.
        </p>
      )}
    </>
  );
}

/* --------------------------------------------------------------- the host */
const META: Record<PanelId, { kicker: string; title: string; icon: string }> = {
  sigil: { kicker: 'the sigil', title: 'MARK OF THE HOLLOW', icon: 'sigil' },
  raven: { kicker: 'the raven', title: 'WORD FROM OUTSIDE', icon: 'raven' },
  chest: { kicker: 'the chest', title: 'THE LOCK', icon: 'chest' },
  books: { kicker: 'the shelf', title: 'THE ARCHIVE', icon: 'books' },
  map: { kicker: 'the old map', title: 'THE HOLD', icon: 'map' },
  astro: { kicker: 'the spheres', title: 'THE SPHERES', icon: 'astro' },
  mirror: { kicker: 'the mirror', title: 'THE OTHER SIDE', icon: 'mirror' },
  cage: { kicker: 'the cage', title: 'NIGHTS KEPT', icon: 'cage' },
  altar: { kicker: 'the altar', title: 'THE LONG VIGIL', icon: 'altar' },
  gate: { kicker: 'the gate', title: 'THE SEALED GATE', icon: 'gate' },
};

export default function PanelHost({ id, onClose, onTravel, save, refresh }: HostProps) {
  useEffect(() => { markBlock(id); }, [id]);
  const meta = META[id];
  return (
    <Panel kicker={meta.kicker} title={meta.title} icon={meta.icon} onClose={onClose}>
      {id === 'sigil' && <Sigil save={save} refresh={refresh} />}
      {id === 'raven' && <Raven save={save} />}
      {id === 'chest' && <Chest save={save} refresh={refresh} />}
      {id === 'books' && <Books />}
      {id === 'map' && <Hold onTravel={onTravel} />}
      {id === 'astro' && <Spheres save={save} refresh={refresh} />}
      {id === 'mirror' && <Mirror save={save} />}
      {id === 'cage' && <Cage save={save} />}
      {id === 'altar' && <Altar save={save} refresh={refresh} />}
      {id === 'gate' && <Gate save={save} refresh={refresh} />}
    </Panel>
  );
}
