/**
 * The watch at the sconces, as a pure state machine.
 *
 * The rules live here rather than inside the component for one practical
 * reason: a game loop driven by requestAnimationFrame cannot be tested without
 * a browser that is actually painting, and a browser that is actually painting
 * is not available to a script. Given a clock as an argument, every rule below
 * can be checked in a second — including the one that matters most, which is
 * that a stalled tab does not cost you the watch.
 *
 * No imports, deliberately: this file is runnable on its own.
 *
 * Time that should not count is passed in rather than guessed at. An earlier
 * version inferred it from the size of the gap between frames — anything over
 * 250 ms was assumed to be a hidden tab — and that was wrong twice over: a
 * player who simply stopped clicking for two seconds was forgiven, and on a
 * device slow enough to drop below four frames a second no flame could ever
 * expire, which would have made the game unlosable. The component watches
 * visibilitychange, which is the actual signal, and hands over exactly how
 * long the page was not being painted.
 */

export type Failing = { slot: number; until: number; fuse: number };

export type FireState = {
  failing: Failing[];
  score: number;
  /** When the next flame should start to fail. */
  nextAt: number;
  /** The slot that went out, once one has. */
  dead: number | null;
  /** Timestamp of the last step, for spotting a stall. */
  last: number;
};

export const SLOTS = 8;
/** How long a failing flame lasts, at the start and at the floor, in ms. */
export const FUSE_START = 1900;
export const FUSE_FLOOR = 620;
/** Gap between one flame failing and the next, at the start and at the floor. */
export const GAP_START = 1250;
export const GAP_FLOOR = 430;
/** Relights after which a second flame can fail at the same time. */
export const DOUBLE_FROM = 14;
/** Difficulty reaches its floor after this many relights. */
const RAMP_OVER = 20;

const ramp = (n: number) => Math.min(1, n / RAMP_OVER);
export const fuseFor = (n: number) => FUSE_START - (FUSE_START - FUSE_FLOOR) * ramp(n);
export const gapFor = (n: number) => GAP_START - (GAP_START - GAP_FLOOR) * ramp(n);

export function begin(now: number): FireState {
  return { failing: [], score: 0, nextAt: now + 500, dead: null, last: now };
}

/** How much of a flame is left, 1 down to 0. */
export function fractionLeft(f: Failing, now: number): number {
  return Math.max(0, Math.min(1, (f.until - now) / f.fuse));
}

function pickSlot(state: FireState, rnd: () => number): number | null {
  const taken = new Set(state.failing.map((f) => f.slot));
  const free: number[] = [];
  for (let i = 0; i < SLOTS; i += 1) if (!taken.has(i)) free.push(i);
  if (!free.length) return null;
  return free[Math.floor(rnd() * free.length)];
}

/**
 * Moves the watch on to time `t`.
 *
 * `rnd` is passed in so a test can make the choice of sconce predictable, and
 * `forgive` is how many milliseconds the page was not being painted since the
 * last step. Both are the caller's to supply; this function knows no clock and
 * no browser.
 */
export function step(
  state: FireState,
  t: number,
  opts: { rnd?: () => number; forgive?: number } = {},
): FireState {
  if (state.dead !== null) return state;
  const rnd = opts.rnd ?? Math.random;

  // Time the page spent unpainted, measured by the caller. Pushed out of the
  // way before anything else is judged, so looking away cannot cost a watch —
  // and nothing else is forgiven, so slow frames still count.
  const forgive = opts.forgive ?? 0;
  if (forgive > 0) {
    return {
      ...state,
      last: t,
      nextAt: state.nextAt + forgive,
      failing: state.failing.map((f) => ({ ...f, until: f.until + forgive })),
    };
  }

  const gone = state.failing.find((f) => t >= f.until);
  if (gone) return { ...state, last: t, dead: gone.slot };

  let next: FireState = { ...state, last: t };
  if (t >= state.nextAt) {
    const wanted = state.score >= DOUBLE_FROM ? 2 : 1;
    const failing = [...next.failing];
    while (failing.length < wanted) {
      const slot = pickSlot({ ...next, failing }, rnd);
      if (slot === null) break;
      failing.push({ slot, until: t + fuseFor(next.score), fuse: fuseFor(next.score) });
    }
    next = { ...next, failing, nextAt: t + gapFor(next.score) };
  }
  return next;
}

/** Puts a failing flame back. Ignores a slot that is not failing. */
export function relight(state: FireState, slot: number): FireState {
  if (state.dead !== null) return state;
  if (!state.failing.some((f) => f.slot === slot)) return state;
  return {
    ...state,
    failing: state.failing.filter((f) => f.slot !== slot),
    score: state.score + 1,
  };
}
