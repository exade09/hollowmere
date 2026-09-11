'use client';

/**
 * All player state is one object in localStorage. There is no backend.
 *
 * The key must stay stable: returning visitors already have an older shape
 * stored, so read() merges defaults into whatever is there instead of
 * overwriting it.
 */
export const KEY = 'hollowmere.save';

export type Save = {
  created: number;
  lastVisit: number;
  playSec: number;
  /** How many distinct calendar days the visitor has come back. */
  nights: number;
  /** Which panels have been opened at least once. */
  blocks: string[];
  /** When the chest lock was solved, if ever. */
  lockSolvedAt: number | null;
  /** When the candle was last lit, and how many times in total. */
  vigilLitAt: number | null;
  vigilCount: number;
  /** The rusted key to the sealed gate. */
  hasKey: boolean;
  /** Local-only counter, exactly as theatrical as the reference's. */
  stirred: number;
  audio: { track: string; vol: number; muted: boolean };
};

const DEFAULTS: Save = {
  created: 0,
  lastVisit: 0,
  playSec: 0,
  nights: 0,
  blocks: [],
  lockSolvedAt: null,
  vigilLitAt: null,
  vigilCount: 0,
  hasKey: false,
  stirred: 0,
  // Sound is on by default and the first track is Harvest Dawn. The click on
  // the boot overlay is the user gesture browsers demand, so the room has
  // music from the moment it opens rather than after a second deliberate act.
  // Anyone who turns it off is remembered: this default only applies to a save
  // that has never been written.
  audio: { track: 'harvest-dawn', vol: 0.45, muted: false },
};

function dayOf(ts: number) {
  const d = new Date(ts);
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

export function read(): Save {
  if (typeof window === 'undefined') return { ...DEFAULTS };
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return { ...DEFAULTS };
    const parsed = JSON.parse(raw) as Partial<Save>;
    return { ...DEFAULTS, ...parsed, audio: { ...DEFAULTS.audio, ...(parsed.audio ?? {}) } };
  } catch {
    return { ...DEFAULTS };
  }
}

export function write(s: Save) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* private window or storage blocked — the visit simply is not recorded */
  }
}

/** Opens a session: counts the night and returns the current save. */
export function openSession(): Save {
  const now = Date.now();
  const s = read();
  if (!s.created) s.created = now;
  const firstToday = !s.lastVisit || dayOf(s.lastVisit) !== dayOf(now);
  if (firstToday) s.nights += 1;
  s.lastVisit = now;
  write(s);
  return s;
}

export function markBlock(id: string): Save {
  const s = read();
  if (!s.blocks.includes(id)) {
    s.blocks.push(id);
    write(s);
  }
  return s;
}

export function patch(part: Partial<Save>): Save {
  const s = { ...read(), ...part };
  write(s);
  return s;
}

/** The raven hands over the key on this night. */
export const NIGHTS_FOR_KEY = 3;

/** The candle burns down over this many hours of real time. */
export const CANDLE_HOURS = 72;

export function candleState(s: Save): { pct: number; label: string } {
  if (!s.vigilLitAt) return { pct: 0, label: 'gone out' };
  const hours = (Date.now() - s.vigilLitAt) / 3_600_000;
  const pct = Math.max(0, 1 - hours / CANDLE_HOURS);
  if (pct <= 0) return { pct: 0, label: 'gone out' };
  if (pct < 0.25) return { pct, label: 'a stub' };
  if (pct < 0.7) return { pct, label: 'burning' };
  return { pct, label: 'burning steady' };
}
