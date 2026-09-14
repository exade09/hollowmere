/**
 * The pairs on the cage floor, as pure functions.
 *
 * Concentration, which is the oldest card game there is and the only classic
 * that needed nothing invented to fit this place: the eight marks are already
 * cut into the chest and into the cage wall, so the cards are those marks and
 * the game is remembering where each one was.
 *
 * Separated from the component for the same reason as the watch and the slab:
 * the rules that actually break are the ones about the third flip — what
 * happens when somebody turns a card while two wrong ones are still face up —
 * and that is checkable in a script, invisible by eye, and the source of every
 * memory-game bug worth having.
 *
 * No imports, deliberately: this file is runnable on its own.
 */

/** Eight marks, sixteen cards. */
export const PAIRS = 8;
export const CARDS = PAIRS * 2;

export type PairsState = {
  /** Which mark is under each position. Fixed for the round. */
  board: number[];
  /** Positions currently face up and not yet resolved. Never more than two. */
  faceUp: number[];
  /** Positions whose pair has been found. */
  matched: number[];
  /** Attempts, counted when a second card is turned rather than per card. */
  turns: number;
};

/** A small deterministic generator, so a test can deal the same board twice. */
export function seeded(seed: number): () => number {
  let x = seed >>> 0 || 1;
  return () => {
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    x >>>= 0;
    return x / 4294967296;
  };
}

/**
 * A shuffled board: each mark twice, Fisher-Yates.
 *
 * Unlike the slab, every arrangement here is playable, so there is nothing to
 * guarantee by construction — the shuffle only has to be even. Fisher-Yates
 * from the top is; sorting by a random comparator, which is the tempting
 * one-liner, is not.
 */
export function deal(rng: () => number = Math.random): number[] {
  const board: number[] = [];
  for (let i = 0; i < PAIRS; i += 1) board.push(i, i);
  for (let i = board.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    [board[i], board[j]] = [board[j], board[i]];
  }
  return board;
}

export function begin(rng: () => number = Math.random): PairsState {
  return { board: deal(rng), faceUp: [], matched: [], turns: 0 };
}

/** Turns the two unmatched cards back over. Safe to call at any time. */
export function clear(s: PairsState): PairsState {
  return s.faceUp.length ? { ...s, faceUp: [] } : s;
}

/**
 * Turns one card over.
 *
 * Three rules, and the third is the one that matters. A card already matched or
 * already face up does nothing. A third card turned while two wrong ones are
 * still showing clears those two first and then turns the third — so a player
 * who does not wait is never blocked and never loses the turn they just took.
 * The alternative, ignoring the click until a timer fires, feels broken on a
 * slow machine and is the usual bug in this game.
 */
export function flip(s: PairsState, at: number): PairsState {
  if (at < 0 || at >= s.board.length) return s;
  if (s.matched.includes(at) || s.faceUp.includes(at)) return s;

  const base = s.faceUp.length >= 2 ? clear(s) : s;
  const faceUp = [...base.faceUp, at];

  if (faceUp.length < 2) return { ...base, faceUp };

  const [a, b] = faceUp;
  const hit = base.board[a] === base.board[b];
  return {
    ...base,
    faceUp: hit ? [] : faceUp,
    matched: hit ? [...base.matched, a, b] : base.matched,
    turns: base.turns + 1,
  };
}

export function isDone(s: PairsState): boolean {
  return s.matched.length === s.board.length;
}

/**
 * The fewest turns a round can possibly take.
 *
 * Eight, and it is worth having as a number rather than a feeling: a perfect
 * round is eight attempts, so a score of nine is one mistake and not a
 * disaster. The panel says this so nobody reads their own eleven as bad.
 */
export const PERFECT = PAIRS;
