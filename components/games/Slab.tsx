'use client';

import { useMemo, useState } from 'react';
import { HOLE, N, TILES, isSolved, neighbours, shuffled, slide } from '@/lib/games/slab';
import { Save, recordSlab, todayKey } from '@/lib/save';

/**
 * THE SLAB — one puzzle a day, the same one for everyone.
 *
 * A flagstone lifted out of the floor and broken into nine, which is a sliding
 * puzzle cut from our own render rather than a stock photograph: the image is
 * the Sanctum poster, so solving it hands back a picture of the room the
 * visitor is standing in.
 *
 * The rules are in lib/games/slab.ts, where the one claim that matters can be
 * tested — that today's slab can actually be solved. Half of all random
 * permutations of a sliding puzzle cannot be, so the shuffle walks the gap
 * through legal moves instead of permuting tiles, which makes the result
 * reachable by construction rather than by hope.
 */

const IMAGE = '/clips/sanctum/poster/00_idle.jpg';

export default function Slab({ save, refresh }: { save: Save; refresh: () => void }) {
  const key = todayKey();
  const start = useMemo(() => shuffled(key), [key]);
  const [board, setBoard] = useState<number[]>(start);
  const [moves, setMoves] = useState(0);

  const solved = isSolved(board);
  const best = save.games.slabBest[key];

  const push = (i: number) => {
    if (solved) return;
    const next = slide(board, i);
    if (!next) return;
    setBoard(next);
    const count = moves + 1;
    setMoves(count);
    if (isSolved(next)) {
      recordSlab(count);
      refresh();
    }
  };

  const reset = () => {
    setBoard(shuffled(key));
    setMoves(0);
  };

  return (
    <div className="game slab">
      <div className="game-head">
        <span className="game-score">{moves}</span>
        <span className="game-label">moves</span>
        <span className="chrome-spacer" />
        <span className="game-label">{best !== undefined ? `best today ${best}` : key}</span>
      </div>

      <div className={`slab-grid ${solved ? 'whole' : ''}`} role="group" aria-label="the slab">
        {board.map((tile, i) => {
          const r = Math.floor(tile / N);
          const c = tile % N;
          const hole = tile === HOLE;
          return (
            <button
              key={i}
              className={`slab-tile ${hole && !solved ? 'gap' : ''}`}
              onPointerDown={() => push(i)}
              disabled={solved}
              aria-label={hole ? 'the gap' : `piece ${tile + 1}`}
              style={
                hole && !solved
                  ? undefined
                  : {
                      backgroundImage: `url(${IMAGE})`,
                      backgroundSize: `${N * 100}% ${N * 100}%`,
                      backgroundPosition: `${(c / (N - 1)) * 100}% ${(r / (N - 1)) * 100}%`,
                    }
              }
            />
          );
        })}
      </div>

      <div className="game-foot">
        {solved ? (
          <p>
            whole again in {moves}
            {best !== undefined && best < moves ? `. your best today is ${best}` : ''}
          </p>
        ) : (
          <p className="dim">one slab a day. everyone gets the same one.</p>
        )}
        <button className="btn" onClick={reset}>
          {solved ? 'break it again' : 'start over'}
        </button>
      </div>
    </div>
  );
}
