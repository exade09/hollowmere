/**
 * The model behind the agent, as one swappable thing.
 *
 * Both providers are plain HTTP, so there is no SDK here and no new
 * dependency: this project has three, and the agent adds none. Which one runs
 * is a single environment variable, so the choice never becomes a rewrite —
 * and the two can be compared on the same prompt, which is the only honest way
 * to pick between them for a job that lives or dies on holding a voice.
 *
 *     AI_PROVIDER=anthropic | openai | stub
 *
 * `stub` needs no key and no network. It exists so the store, the cron, the
 * chain reader, the chat endpoint and the site integration can all be built
 * and tested before anyone pays for a token.
 *
 * Two jobs, one seam: `write` produces a post from an angle, `chat` answers a
 * visitor over a few turns. They differ only in the system block and in how
 * much rope the model gets.
 */
import { Angle } from './types';
import { WICK_VOICE } from './voice';

export type Generated = { text: string; provider: string; model: string };
export type Turn = { role: 'user' | 'assistant'; content: string };

export type Provider = {
  name: string;
  model: string;
  /**
   * Turns a task into one post in the house voice. The angle is passed
   * separately rather than parsed back out of the task: a test double that has
   * to guess what it was asked gives misleading results.
   */
  write(task: string, angle: Angle): Promise<Generated>;
  /** Answers a visitor. The system block is the caller's, not this file's. */
  chat(system: string, turns: Turn[]): Promise<Generated>;
};

const TIMEOUT_MS = 60_000;
/**
 * Budgets, sized for a reasoning model rather than a plain one. On a model
 * that thinks first, this number covers the thinking as well as the words, and
 * a tight budget produces an empty reply instead of a short one. The audit
 * caps a reply at 900 characters anyway, so the headroom costs nothing when it
 * is not used.
 */
const POST_TOKENS = 1600;
const CHAT_TOKENS = 1400;

async function post(url: string, init: RequestInit): Promise<Response> {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: ctl.signal });
  } finally {
    clearTimeout(t);
  }
}

/* --------------------------------------------------------------- anthropic */

function anthropic(): Provider {
  const key = process.env.ANTHROPIC_API_KEY || '';
  const model = process.env.ANTHROPIC_MODEL || 'claude-sonnet-5';

  const call = async (system: string, turns: Turn[], maxTokens: number): Promise<Generated> => {
    const r = await post('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': key,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model,
        max_tokens: maxTokens,
        temperature: 0.9,
        // The system block is identical on every call of a given kind, so it is
        // marked cacheable: after the first one it is billed as a cache read
        // rather than fresh input, and it is the largest part of the prompt.
        system: [{ type: 'text', text: system, cache_control: { type: 'ephemeral' } }],
        messages: turns,
      }),
    });
    if (!r.ok) throw new Error(`anthropic ${r.status}: ${(await r.text()).slice(0, 300)}`);
    const j = (await r.json()) as { content?: { type: string; text?: string }[] };
    const text = (j.content || [])
      .filter((c) => c.type === 'text')
      .map((c) => c.text || '')
      .join('')
      .trim();
    if (!text) throw new Error('anthropic returned no text');
    return { text, provider: 'anthropic', model };
  };

  return {
    name: 'anthropic',
    model,
    write: (task) => call(WICK_VOICE, [{ role: 'user', content: task }], POST_TOKENS),
    chat: (system, turns) => call(system, turns, CHAT_TOKENS),
  };
}

/* ------------------------------------------------------------------ openai */

function openai(): Provider {
  const key = process.env.OPENAI_API_KEY || '';
  const model = process.env.OPENAI_MODEL || 'gpt-5';

  const call = async (system: string, turns: Turn[], maxTokens: number): Promise<Generated> => {
    /**
     * The request is built from a set of optional parameters that different
     * models accept and reject, and any one of them is shed on the specific
     * 400 that names it. Guessing capabilities from the model string is how
     * this breaks every time a model is renamed.
     *
     * `reasoning_effort: 'low'` matters more than it looks. A reasoning model
     * spends max_completion_tokens on thinking before it writes anything, and
     * a short stylistic reply given a small budget comes back completely empty
     * with finish_reason "length" — which is exactly what happened on the
     * first live call. These replies need voice, not deliberation.
     */
    const optional = new Set(['limit_new', 'reasoning_effort']);

    const build = () => {
      const body: Record<string, unknown> = {
        model,
        messages: [{ role: 'system', content: system }, ...turns],
      };
      body[optional.has('limit_new') ? 'max_completion_tokens' : 'max_tokens'] = maxTokens;
      if (optional.has('reasoning_effort')) body.reasoning_effort = 'low';
      return JSON.stringify(body);
    };

    let last = '';
    for (let attempt = 0; attempt < 4; attempt += 1) {
      const r = await post('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${key}` },
        body: build(),
      });

      if (r.status === 400) {
        last = (await r.text()).slice(0, 400);
        if (/reasoning_effort/i.test(last) && optional.has('reasoning_effort')) {
          optional.delete('reasoning_effort');
          continue;
        }
        if (/max_completion_tokens/i.test(last) && optional.has('limit_new')) {
          optional.delete('limit_new');
          continue;
        }
        throw new Error(`openai 400: ${last}`);
      }
      if (!r.ok) throw new Error(`openai ${r.status}: ${(await r.text()).slice(0, 300)}`);

      const j = (await r.json()) as {
        choices?: { message?: { content?: string }; finish_reason?: string }[];
        usage?: { completion_tokens?: number; completion_tokens_details?: { reasoning_tokens?: number } };
      };
      const choice = j.choices?.[0];
      const text = (choice?.message?.content || '').trim();
      if (text) return { text, provider: 'openai', model };

      // Empty with finish_reason "length" is the budget being eaten before a
      // word is written. Say so, rather than reporting "no text" and leaving
      // the next person to guess.
      const reasoned = j.usage?.completion_tokens_details?.reasoning_tokens;
      throw new Error(
        `openai returned no text (finish_reason=${choice?.finish_reason ?? '?'}` +
          (reasoned ? `, reasoning_tokens=${reasoned}` : '') +
          `, budget=${maxTokens}). Raise the budget or lower reasoning_effort.`,
      );
    }
    throw new Error(`openai: gave up after shedding parameters. last error: ${last}`);
  };

  return {
    name: 'openai',
    model,
    write: (task) => call(WICK_VOICE, [{ role: 'user', content: task }], POST_TOKENS),
    chat: (system, turns) => call(system, turns, CHAT_TOKENS),
  };
}

/* -------------------------------------------------------------------- stub */

/**
 * Answers without a model, from the angle or the shape of the question alone.
 * It exists so every path around it can be tested; it is not trying to be
 * convincing.
 */
function stub(): Provider {
  const lines: Record<Angle, string[]> = {
    'the fire': ['the candle takes three days', 'come back inside them and it holds', 'leave it and you find it out'],
    'the nights': ['the wall counted nights before us', 'now it counts yours', 'no rewards. just a record'],
    'the raven': ['the raven goes where wick cannot', 'comes back with scraps', 'that is the whole news department'],
    'the hold': ['nine places', 'two open', 'six shut. we shut them'],
    'the gate': ['the gate takes a key', 'not a code', 'the raven has it and is not giving it up tonight'],
    'the room': ['a sconce, a crack, a cold floor', 'nothing much happens here', 'that is the job'],
    'the chain': ['the address sits in the corner of the room', 'on screen the whole time', 'one click to copy'],
  };

  return {
    name: 'stub',
    model: 'none',
    async write(_task, angle) {
      return { text: lines[angle].join('\n\n'), provider: 'stub', model: 'none' };
    },
    async chat(_system, turns) {
      const last = [...turns].reverse().find((t) => t.role === 'user')?.content || '';
      const reading = /<chain_reading/.test(last);
      const text = reading
        ? 'i read what the stone says about it.\n\nnumbers, nothing more.\n\nwhat it does next is not written there'
        : 'the fire holds.\n\nask me something about this place';
      return { text, provider: 'stub', model: 'none' };
    },
  };
}

/* ----------------------------------------------------------------- factory */

export function getProvider(): Provider {
  const want = (process.env.AI_PROVIDER || '').toLowerCase();
  if (want === 'anthropic') {
    if (!process.env.ANTHROPIC_API_KEY) throw new Error('AI_PROVIDER=anthropic but ANTHROPIC_API_KEY is missing');
    return anthropic();
  }
  if (want === 'openai') {
    if (!process.env.OPENAI_API_KEY) throw new Error('AI_PROVIDER=openai but OPENAI_API_KEY is missing');
    return openai();
  }
  if (want === 'stub' || !want) return stub();
  throw new Error(`unknown AI_PROVIDER: ${want}`);
}
