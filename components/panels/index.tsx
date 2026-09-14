'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Panel from '@/components/Panel';
import Dispatches from '@/components/Dispatches';
import KeepTheFire from '@/components/games/KeepTheFire';
import Pairs from '@/components/games/Pairs';
import Slab from '@/components/games/Slab';
import WalletRead from '@/components/WalletRead';
import WickChat from '@/components/WickChat';
import { XMark } from '@/components/icons';
import {
  ARCHIVE, BRAND, HOARD_NOTE, HOLD, LOCK_GLYPHS, LOCK_ORDER, RITES, SOCIALS,
  SPHERES, TALLY_NOTES, WICK,
} from '@/lib/content';
import {
  CANDLE_HOURS, NIGHTS_FOR_KEY, Save, candleState, markBlock, patch, read, todayKey,
} from '@/lib/save';
import { PanelId, SceneId } from '@/lib/scenes';
import { WALLPAPERS } from '@/lib/wallpapers';
import { useAddress } from '@/lib/useAddress';

type HostProps = {
  id: PanelId;
  onClose: () => void;
  onTravel: (to: SceneId) => void;
  /** Opens another panel in place of this one, for the few that link. */
  onPanel: (id: PanelId) => void;
  save: Save;
  refresh: () => void;
};

function shortCa(ca: string) {
  return ca.length > 14 ? `${ca.slice(0, 6)}…${ca.slice(-4)}` : ca;
}

/* ------------------------------------------------- the sigil: the contract */
function Sigil({ save, refresh }: { save: Save; refresh: () => void }) {
  const [copied, setCopied] = useState(false);
  // The field is free text: before there is an address it may hold a word like
  // TBA, and a word is not something to copy or to look up on an explorer.
  const { text: ca, isAddress } = useAddress();

  const copy = async () => {
    if (!isAddress) return;
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
      <p className="lead">the only name this place has.</p>
      <div className="ca">
        <span className="mono">{ca || 'the address has not been spoken yet'}</span>
        <span className="chrome-spacer" />
        <button className="btn" onClick={copy} disabled={!isAddress}>
          {copied ? 'copied' : 'copy'}
        </button>
      </div>
      <dl className="rows">
        <div className="row"><dt>ticker</dt><dd className="mono">{BRAND.ticker}</dd></div>
        <div className="row"><dt>chain</dt><dd className="mono">{BRAND.chain}</dd></div>
        <div className="row"><dt>the keeper runs on</dt><dd className="mono">{BRAND.model}</dd></div>
        <div className="row">
          <dt>ledger</dt>
          <dd>
            {BRAND.explorer && isAddress ? (
              <a href={`${BRAND.explorer}${ca}`} target="_blank" rel="noreferrer">
                watch what moves
              </a>
            ) : (
              <span className="dim">not wired yet</span>
            )}
          </dd>
        </div>
      </dl>
      <p>stir the ash. nothing changes. i keep the count</p>
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
      <p className="lead">it goes where i cannot. it comes back with scraps.</p>
      <Dispatches />
      <dl className="rows">
        {SOCIALS.map((s) => (
          <div className="row" key={s.name}>
            <dt>
              {s.mark === 'x' && <XMark className="mark-inline" />}
              {s.name}
            </dt>
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
          ? 'it brought a rusted key. not mine'
          : `something in its beak. maybe on night ${NIGHTS_FOR_KEY}`}
      </p>
    </>
  );
}

/* ------------------------------------------- the chest: the lock and reward */
const GLYPHS = LOCK_GLYPHS;
const TARGET = LOCK_ORDER;

function Chest({
  save,
  refresh,
  onPanel,
}: {
  save: Save;
  refresh: () => void;
  onPanel: (id: PanelId) => void;
}) {
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
      <p className="lead">three rings. bring the chosen marks under the notch.</p>
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
        <p className="dim">the same marks are cut into the cage wall. top to bottom</p>
      )}

      {/* The marks on the lock are the cards in one of the pastimes, so the
          chest is the other honest way into them. The line above the button is
          the one to change when there is something else to say here. */}
      <div className="label-sm">while you are thinking</div>
      <p className="chest-aside">
        the same eight marks are dealt out as a game downstairs. learning them there is not
        cheating, it is just slower than being told.
      </p>
      <div className="actions">
        <button className="btn" onClick={() => onPanel('games')}>
          the pastimes
        </button>
      </div>
    </>
  );
}

/* ----------------------------------------------------- the shelf: archive */

/**
 * The library, in two shelves.
 *
 * The volumes were here first. The wallpapers are the other thing people
 * actually come to a library for, and they are the same kind of object — take
 * it or do not — so they are a shelf rather than a room of their own.
 *
 * The list of them is generated from the folder by scripts/wallpaper-manifest,
 * so adding one is a file copy and this file never learns about it.
 */
function Books() {
  const [shelf, setShelf] = useState<'volumes' | 'wallpapers'>('volumes');
  const tag = { ready: 'take it', soon: 'not copied', lost: 'lost' };

  return (
    <>
      <div className="shelves" role="tablist" aria-label="the library">
        <button
          role="tab"
          aria-selected={shelf === 'volumes'}
          className={`chrome-btn ${shelf === 'volumes' ? 'on' : ''}`}
          onClick={() => setShelf('volumes')}
        >
          the shelf
        </button>
        <button
          role="tab"
          aria-selected={shelf === 'wallpapers'}
          className={`chrome-btn ${shelf === 'wallpapers' ? 'on' : ''}`}
          onClick={() => setShelf('wallpapers')}
        >
          wallpapers <span className="dim">{WALLPAPERS.length}</span>
        </button>
      </div>

      {shelf === 'volumes' && (
        <>
          <p className="lead">what was saved from the library. some of it was not.</p>
          <div className="grid">
            {ARCHIVE.map((a) => (
              <div
                className={`card ${a.state === 'ready' ? 'open' : ''} ${a.state === 'lost' ? 'lost' : ''}`}
                key={a.name}
              >
                <b>{a.name}</b>
                <small>{a.note}</small>
                <span className="tag">
                  {a.state === 'ready' && a.href ? (
                    // A file is taken; a page is opened. The manual is a page,
                    // and a download attribute on it saves the markup instead
                    // of reading it, which is worse than no link at all.
                    a.href.startsWith('/docs') ? (
                      <a href={a.href}>read it</a>
                    ) : (
                      <a href={a.href} download>
                        {tag.ready}
                      </a>
                    )
                  ) : (
                    tag[a.state]
                  )}
                </span>
              </div>
            ))}
          </div>
        </>
      )}

      {shelf === 'wallpapers' && <Wallpapers />}
    </>
  );
}

/** The wallpapers shelf: a click opens one whole, the corner saves it. */
function Wallpapers() {
  if (!WALLPAPERS.length) {
    return <p className="lead">nothing pinned up yet.</p>;
  }
  return (
    <>
      <div className="label-sm">wallpapers — click to open one, save whichever</div>
      <div className="papers">
        {WALLPAPERS.map((w) => (
          <figure className="paper" key={w.id}>
            <a href={w.full} target="_blank" rel="noreferrer" aria-label={`open ${w.id}`}>
              {/* The ratio is reserved from the real dimensions so the grid
                  does not reflow as the images arrive. */}
              <img
                src={w.thumb}
                alt=""
                loading="lazy"
                decoding="async"
                style={{ aspectRatio: `${w.w} / ${w.h}` }}
              />
            </a>
            <a className="paper-save" href={w.full} download={`hollowmere-${w.id}.jpg`}>
              save
            </a>
          </figure>
        ))}
      </div>
      <p className="wick-small">
        they are all this place, rendered at rest. take the ones you want. i am not counting
        these.
      </p>
    </>
  );
}

/* --------------------------------------------------------- the map: the hold */

function Hold({
  onTravel,
  onPanel,
  save,
}: {
  onTravel: (to: SceneId) => void;
  onPanel: (id: PanelId) => void;
  save: Save;
}) {
  return (
    <>
      <p className="lead">all of it. most of it is shut.</p>
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
                /* The centrepiece of each room: the astrolabe upstairs, the
                   cage below. The sigil was tried first and reads as a teal
                   smudge at this size — a place icon has to survive being
                   26 pixels tall. */
                src={`/ui/icons/${h.id === 'sanctum' ? 'astro' : 'cage'}.png`}
                alt=""
                aria-hidden="true"
              />
            )}
            <b>{h.name}</b>
            {h.note && <small>{h.note}</small>}
            <span className="tag">{h.id ? 'go in' : 'shut'}</span>
          </div>
        ))}
      </div>

      <div className="label-sm">pastimes</div>
      <div className="grid">
        {/* The games used to live inside this panel. They are their own room
            now, reached from the bar as well, because a person looking for
            something to do should not have to find the map first. */}
        <div
          className="card open travel"
          onClick={() => onPanel('games')}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') onPanel('games');
          }}
        >
          <img className="card-icon" src="/ui/icons/altar.png" alt="" aria-hidden="true" />
          <b>the pastimes</b>
          <small>three of them. the fire, the slab, the marks</small>
          <span className="tag">
            {save.games.fireBest > 0 ? `best watch ${save.games.fireBest}` : 'play'}
          </span>
        </div>
      </div>
    </>
  );
}

/* ------------------------------------------------ the pastimes: minigames */

/**
 * Three small games, in a room of their own.
 *
 * They were in the map, which is where somebody goes to see the places rather
 * than to play something, so half the people who would have played them never
 * found them. Now the bar has a way in and so does the chest.
 *
 * All three are classics and none of them is a stock classic: the watch is
 * whack-a-mole played on the sconces that are already in the room, the slab is
 * a sliding puzzle cut out of our own render of the Sanctum, and the marks are
 * concentration played with the eight runes the chest is locked with. Every
 * score is local, because there is nowhere to send one and pretending
 * otherwise would be a promise.
 */
type Pastime = 'fire' | 'slab' | 'pairs';

const PASTIMES: { id: Pastime; name: string; note: string; icon: string }[] = [
  { id: 'fire', name: 'keep the fire', note: 'they go out. put them back', icon: 'altar' },
  { id: 'slab', name: 'the slab', note: 'one a day, the same for everyone', icon: 'map' },
  { id: 'pairs', name: 'the marks', note: 'eight of them, twice. remember where', icon: 'chest' },
];

function Games({ save, refresh }: { save: Save; refresh: () => void }) {
  const [playing, setPlaying] = useState<Pastime | null>(null);

  if (playing) {
    return (
      <>
        <button className="back" onClick={() => setPlaying(null)}>
          ‹ back to the pastimes
        </button>
        {playing === 'fire' && <KeepTheFire save={save} refresh={refresh} />}
        {playing === 'slab' && <Slab save={save} refresh={refresh} />}
        {playing === 'pairs' && <Pairs save={save} refresh={refresh} />}
      </>
    );
  }

  const score = (id: Pastime) => {
    if (id === 'fire') return save.games.fireBest > 0 ? `best ${save.games.fireBest}` : 'play';
    if (id === 'pairs') return save.games.pairsBest > 0 ? `best ${save.games.pairsBest}` : 'play';
    const today = save.games.slabBest[todayKey()];
    return today !== undefined ? `today ${today}` : 'play';
  };

  return (
    <>
      <p className="lead">small things, for the nights nothing is happening.</p>
      <div className="grid">
        {PASTIMES.map((g) => (
          <div
            className="card open travel"
            key={g.id}
            onClick={() => setPlaying(g.id)}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') setPlaying(g.id);
            }}
          >
            <img className="card-icon" src={`/ui/icons/${g.icon}.png`} alt="" aria-hidden="true" />
            <b>{g.name}</b>
            <small>{g.note}</small>
            <span className="tag">{score(g.id)}</span>
          </div>
        ))}
      </div>
      <p className="wick-small">
        every score stays in this browser. there is nowhere here to send one, and a
        leaderboard would be a promise i have not made.
      </p>
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
      <p className="lead">the rings catch a sound that is not in the room.</p>
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
      <p className="dim">nothing plays until you step in. browsers hold it back</p>
    </>
  );
}

/* ---------------------------------------------- the mirror: card to share */
function Mirror({ save }: { save: Save }) {
  const canvas = useRef<HTMLCanvasElement | null>(null);
  const { text: ca, isAddress } = useAddress();

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
    // A word like TBA is printed as it is; only an address gets shortened.
    g.fillText(
      ca ? (isAddress ? shortCa(ca) : ca) : 'the address has not been spoken yet',
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
    // The card is redrawn when the address changes, so a card saved a minute
    // after the desk writes one carries the new one.
  }, [save, ca, isAddress]);

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
      <p className="lead">no room in the glass. only how long you have stood here.</p>
      <div className="mirror-figure">
        <img src="/ui/wick.png" alt="Wick" className="wick" />
        <dl className="rows">
          {WICK.map(([k, v]) => (
            <div className="row" key={k}><dt>{k}</dt><dd>{v}</dd></div>
          ))}
        </dl>
      </div>
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
      <p className="lead">someone counted nights in here. the door was never locked.</p>
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
      {next && <p className="dim">the next line comes on night {next.at}</p>}
      <div className="label-sm">cut deeper, top to bottom</div>
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
        keep the fire. it burns down over {CANDLE_HOURS / 24} days on its own.
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
      <div className="label-sm">rites to keep</div>
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
        <p className="lead">the key fit. a corridor.</p>
        <p>nothing along it yet. i checked</p>
        <p className="dim">it opens on its own when the third place is mapped</p>
      </>
    );
  }

  return (
    <>
      <p className="lead">a chain, a padlock, three rings. the rings are decoration.</p>
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
          on night {NIGHTS_FOR_KEY}. come back {NIGHTS_FOR_KEY - save.nights} more time
          {NIGHTS_FOR_KEY - save.nights === 1 ? '' : 's'}
        </p>
      )}
    </>
  );
}

/* ------------------------------------------------------ the keeper: speech */

/**
 * Talking to him, given a room of its own.
 *
 * It lived inside the mirror, under the portrait and above the share card,
 * which meant the one genuinely new thing on the site was the hardest thing on
 * it to find. Now it is a panel with his name on it, reached from a button that
 * is on screen in every scene.
 */
function Speak() {
  return (
    <>
      <div className="speak-head">
        <img src="/ui/wick.png" alt="Wick" className="speak-figure" />
        <p className="lead">he keeps the fire, and answers when spoken to.</p>
      </div>
      <WickChat />
    </>
  );
}

/* ------------------------------------------------ the ledger: what you hold */

/**
 * The other half of what he does.
 *
 * He has always read a token for anyone who pasted one. This reads the other
 * side of the same question — what the person asking is actually holding — and
 * it is the same rule again: figures, and no opinion about them.
 */
function Ledger() {
  return (
    <>
      <p className="lead">
        give me an address and i will say what is in it, what each of those things can do to
        you, and the three figures that would tell you it has changed. i will not say what to
        do with any of it.
      </p>
      <WalletRead />
    </>
  );
}

/* --------------------------------------------------------------- the host */
const META: Record<PanelId, { kicker: string; title: string; icon?: string }> = {
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
  wick: { kicker: 'the keeper', title: 'SPEAK TO WICK', icon: undefined },
  ledger: { kicker: 'the ledger', title: 'WHAT YOU HOLD', icon: undefined },
  games: { kicker: 'the pastimes', title: 'MINIGAMES', icon: 'altar' },
};

export default function PanelHost({
  id,
  onClose,
  onTravel,
  onPanel,
  save,
  refresh,
}: HostProps) {
  useEffect(() => { markBlock(id); }, [id]);
  const meta = META[id];
  return (
    <Panel kicker={meta.kicker} title={meta.title} icon={meta.icon} onClose={onClose}>
      {id === 'sigil' && <Sigil save={save} refresh={refresh} />}
      {id === 'raven' && <Raven save={save} />}
      {id === 'chest' && <Chest save={save} refresh={refresh} onPanel={onPanel} />}
      {id === 'books' && <Books />}
      {id === 'map' && <Hold onTravel={onTravel} onPanel={onPanel} save={save} />}
      {id === 'astro' && <Spheres save={save} refresh={refresh} />}
      {id === 'mirror' && <Mirror save={save} />}
      {id === 'cage' && <Cage save={save} />}
      {id === 'altar' && <Altar save={save} refresh={refresh} />}
      {id === 'gate' && <Gate save={save} refresh={refresh} />}
      {id === 'wick' && <Speak />}
      {id === 'ledger' && <Ledger />}
      {id === 'games' && <Games save={save} refresh={refresh} />}
    </Panel>
  );
}
