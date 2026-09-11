/**
 * The daily slab, as pure functions.
 *
 * Separated from the component for the same reason as the watch: the one thing
 * that must be true here — that today's slab can actually be solved — is
 * checkable in a script and invisible by eye. Half of all random permutations
 * of a sliding puzzle are unsolvable, so the shuffle walks the gap through
 * legal moves instead of permuting the tiles. That makes the result solvable by
 * construction rather than by hope.
 *
 * No imports, deliberately: this file is runnable on its own.
 */

export const N = 3;
export const TILES = N * N;
/** The piece that is missing. It is the last one, so solved order is 0..8. */
export const HOLE = TILES - 1;
/** How many legal moves the shuffle walks. Enough to look thoroughly broken. */
const WALK = 80;

/** A small deterministic generator, so one date always gives one slab. */
export function seeded(seed: number): () => number {
  let x = seed >>> 0 || 1;
  return () => {
    x ^= x << 13;
    x >>>= 0;
    x ^= x >>> 17;
    x ^= x << 5;
    x >>>= 0;
    return x / 4294967296;
  };
}

export function seedFor(key: string): number {
  let h = 2166136261;
  for (let i = 0; i < key.length; i += 1) {
    h ^= key.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function neighbours(i: number): number[] {
  const r = Math.floor(i / N);
  const c = i % N;
  const out: number[] = [];
  if (r > 0) out.push(i - N);
  if (r < N - 1) out.push(i + N);
  if (c > 0) out.push(i - 1);
  if (c < N - 1) out.push(i + 1);
  return out;
}

export function isSolved(board: number[]): boolean {
  return board.every((t, i) => t === i);
}

/**
 * Solved order, then WALK legal moves. Reachable by construction, and identical
 * for a given key.
 */
export function shuffled(key: string): number[] {
  const rnd = seeded(seedFor(key));
  const board = Array.from({ length: TILES }, (_, i) => i);
  let hole = HOLE;
  let came = -1;
  for (let step = 0; step < WALK; step += 1) {
    // Never immediately undo the previous move; that wastes half the walk.
    const options = neighbours(hole).filter((o) => o !== came);
    const pick = options[Math.floor(rnd() * options.length)];
    board[hole] = board[pick];
    board[pick] = HOLE;
    came = hole;
    hole = pick;
  }
  return board;
}

/** Slides the piece at `i` into the gap, if they are neighbours. */
export function slide(board: number[], i: number): number[] | null {
  const hole = board.indexOf(HOLE);
  if (!neighbours(hole).includes(i)) return null;
  const next = [...board];
  next[hole] = next[i];
  next[i] = HOLE;
  return next;
}

/**
 * Whether a board can be solved at all, by the standard parity rule: for an
 * odd-width puzzle, the number of inversions must be even. Used by the test to
 * prove the shuffle above, not by the game.
 */
export function solvable(board: number[]): boolean {
  const order = board.filter((t) => t !== HOLE);
  let inversions = 0;
  for (let i = 0; i < order.length; i += 1) {
    for (let j = i + 1; j < order.length; j += 1) {
      if (order[i] > order[j]) inversions += 1;
    }
  }
  return inversions % 2 === 0;
}
