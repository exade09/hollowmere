/**
 * One tick of the agent.
 *
 * Read the chain, remember what was said lately, pick an angle that has not
 * run recently, write one post, check it, keep it. That is the whole loop, and
 * keeping it one function makes it testable: nothing here touches the network
 * except through the two seams (provider, chain) that have stubs.
 *
 * Nothing published without a human. A dispatch is stored as a draft unless
 * AGENT_AUTOPOST is explicitly "true", and the audit can hold one back on its
 * own even then. An account for a token is not the place to discover what an
 * unattended model will say.
 */
import { allowedFigures, chainFacts, readChain } from './chain';
import { getProvider } from './provider';
import { getStore } from './store';
import { auditPost } from './sanitize';
import { ANGLES, Angle, Dispatch, TickResult } from './types';
import { buildTask } from './voice';

/** How long the agent waits between posts, unless told to ignore it. */
const MIN_GAP_HOURS = Number(process.env.AGENT_MIN_GAP_HOURS || 8);

function pickAngle(recent: Angle[]): Angle {
  const cold = ANGLES.filter((a) => !recent.slice(0, 3).includes(a));
  const pool = cold.length ? cold : ANGLES;
  return pool[Math.floor(Math.random() * pool.length)];
}

function isoDay(ts: number): string {
  return new Date(ts).toISOString().slice(0, 10);
}

export async function tick(opts: { force?: boolean } = {}): Promise<TickResult> {
  const store = getStore();
  const state = await store.read();
  const now = Date.now();

  const gapMs = MIN_GAP_HOURS * 3_600_000;
  const newest = state.dispatches[0]?.createdAt ?? 0;
  if (!opts.force && newest && now - newest < gapMs) {
    const hours = ((gapMs - (now - newest)) / 3_600_000).toFixed(1);
    return { ok: true, skipped: `too soon; ${hours}h left of the ${MIN_GAP_HOURS}h gap` };
  }

  const chain = await readChain();
  const facts = chainFacts(chain);

  // 'the chain' is only allowed as an angle when there is actually something
  // on the chain to say. Otherwise the model would have to invent a figure,
  // and inventing figures is the one thing it must never do.
  let angle = pickAngle(state.lastAngles);
  if (angle === 'the chain' && facts.length === 0) {
    angle = pickAngle([...state.lastAngles, 'the chain']);
  }

  const provider = getProvider();
  const task = buildTask({
    angle,
    recent: state.dispatches.slice(0, 6).map((d) => d.text),
    chainFacts: facts,
  });

  const written = await provider.write(task, angle);

  const problems = auditPost(written.text, allowedFigures(chain));

  const autopost = process.env.AGENT_AUTOPOST === 'true';
  const dispatch: Dispatch = {
    id: `${isoDay(now)}-${Math.random().toString(36).slice(2, 8)}`,
    date: isoDay(now),
    createdAt: now,
    text: written.text,
    angle,
    status: problems.length ? 'draft' : autopost ? 'approved' : 'draft',
    usedChain: chain.ok ? chain : undefined,
    by: { provider: written.provider, model: written.model },
  };

  await store.write({
    ...state,
    dispatches: [dispatch, ...state.dispatches],
    lastAngles: [angle, ...state.lastAngles],
    lastTickAt: now,
  });

  return {
    ok: true,
    wrote: dispatch,
    chain,
    skipped: problems.length ? `held as draft: ${problems.join('; ')}` : undefined,
  };
}

/**
 * What the raven shows in the Sanctum: only what a human let through, newest
 * first. The site never sees a draft.
 */
export async function publicDispatches(limit = 6): Promise<Dispatch[]> {
  const state = await getStore().read();
  return state.dispatches
    .filter((d) => d.status === 'approved' || d.status === 'posted')
    .slice(0, limit);
}
