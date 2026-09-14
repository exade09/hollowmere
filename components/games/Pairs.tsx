'use client';

import { useEffect, useRef, useState } from 'react';
import { PERFECT, PairsState, begin, clear, flip, isDone } from '@/lib/games/pairs';
import { LOCK_GLYPHS } from '@/lib/content';
import { Save, recordPairs } from '@/lib/save';

/**
 * THE MARKS — concentration, played with the eight marks from the lock.
 *
 * The oldest card game there is, and the one classic that needed nothing
 * invented to sit in this room: those eight runes are already cut into the
 * chest and scratched into the cage wall, so a player who spends a few rounds
 * here learns the alphabet the chest is locked with. That is the whole reason
 * this is the third pastime and not a snake.
 *
 * The rules are in lib/games/pairs.ts. The only thing this file adds is the
 * pause: two wrong cards stay up for a moment so they can be read, and a
 * player who does not wait is never blocked, because turning a third card
 * clears them itself.
 */

/** How long two wrong cards stay up when nobody touches anything. */
const LOOK_MS = 750;

export default function Pairs({ save, refresh }: { save: Save; refresh: () => void }) {
  const [state, setState] = useState<PairsState>(() => begin());
  const timer = useRef<number | null>(null);
  const done = isDone(state);
  const best = save.games.pairsBest;

  // Two wrong cards turn themselves back over. The timer is cancelled on every
  // change, so a player who flips on ahead is not interrupted by a stale one.
  useEffect(() => {
    if (timer.current) window.clearTimeout(timer.current);
    if (state.faceUp.length === 2) {
      timer.current = window.setTimeout(() => setState((s) => clear(s)), LOOK_MS);
    }
    return () => {
      if (timer.current) window.clearTimeout(timer.current);
    };
  }, [state]);

  // Recorded once, when the last pair lands.
  const banked = useRef(false);
  useEffect(() => {
    if (done && !banked.current) {
      banked.current = true;
      recordPairs(state.turns);
      refresh();
    }
  }, [done, state.turns, refresh]);

  const again = () => {
    banked.current = false;
    setState(begin());
  };

  return (
    <div className="game pairs">
      <div className="game-head">
        <span className="game-score">{state.turns}</span>
        <span className="game-label">turns</span>
        <span className="chrome-spacer" />
        <span className="game-label">
          {best ? `best ${best}` : `${PERFECT} is perfect`}
        </span>
      </div>

      <div className="pairs-grid" role="group" aria-label="the marks">
        {state.board.map((glyph, i) => {
          const up = state.faceUp.includes(i);
          const found = state.matched.includes(i);
          return (
            <button
              key={i}
              className={`pair-card ${up ? 'up' : ''} ${found ? 'found' : ''}`}
              onClick={() => setState((s) => flip(s, i))}
              disabled={found || done}
              aria-label={up || found ? `mark ${glyph + 1}` : 'a card face down'}
            >
              <span aria-hidden={!up && !found}>{up || found ? LOCK_GLYPHS[glyph] : ''}</span>
            </button>
          );
        })}
      </div>

      <div className="game-foot">
        <button className="btn" onClick={again}>
          {done ? 'again' : 'shuffle'}
        </button>
        <p>
          {done
            ? state.turns <= PERFECT
              ? 'eight. you did not guess once'
              : `${state.turns} turns. ${PERFECT} is the fewest there is`
            : 'the same eight marks are cut into the chest, and into the wall downstairs'}
        </p>
      </div>
    </div>
  );
}
