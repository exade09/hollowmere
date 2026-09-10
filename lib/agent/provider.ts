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
 * chain reader and the site integration can all be built and tested before
 * anyone pays for a token.
 */
import { Angle } from './types';
import { WICK_VOICE } from './voice';

export type Generated = { text: string; provider: string; model: string };

export type Provider = {
  name: string;
  model: string;
  /**
   * Turns a task into one post in the house voice. The angle is passed
   * separately rather than parsed back out of the task: a test double that has
   * to guess what it was asked gives misleading results.
   */
  write(task: string, angle: Angle): Promise<Generated>;
};

const TIMEOUT_MS = 60_000;

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
  return {
    name: 'anthropic',
    model,
    async write(task) {
      const r = await post('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-api-key': key,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model,
          max_tokens: 400,
          temperature: 0.9,
          // The voice block is marked cacheable: it is identical on every call,
          // so after the first one it is billed as a cache read instead of
          // fresh input. It is the largest part of the prompt by far.
          system: [
            { type: 'text', text: WICK_VOICE, cache_control: { type: 'ephemeral' } },
          ],
          messages: [{ role: 'user', content: task }],
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
    },
  };
}

/* ------------------------------------------------------------------ openai */

function openai(): Provider {
  const key = process.env.OPENAI_API_KEY || '';
  const model = process.env.OPENAI_MODEL || 'gpt-5';
  return {
    name: 'openai',
    model,
    async write(task) {
      const body = (limitKey: 'max_completion_tokens' | 'max_tokens') =>
        JSON.stringify({
          model,
          [limitKey]: 400,
          messages: [
            { role: 'system', content: WICK_VOICE },
            { role: 'user', content: task },
          ],
        });
      const call = (limitKey: 'max_completion_tokens' | 'max_tokens') =>
        post('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: { 'content-type': 'application/json', authorization: `Bearer ${key}` },
          body: body(limitKey),
        });

      // Newer models take max_completion_tokens and reject max_tokens; older
      // ones do the reverse. Try the current name, fall back once on the
      // specific complaint rather than guessing from the model string.
      let r = await call('max_completion_tokens');
      if (r.status === 400) {
        const detail = await r.text();
        if (/max_completion_tokens|unsupported parameter/i.test(detail)) {
          r = await call('max_tokens');
        } else {
          throw new Error(`openai 400: ${detail.slice(0, 300)}`);
        }
      }
      if (!r.ok) throw new Error(`openai ${r.status}: ${(await r.text()).slice(0, 300)}`);
      const j = (await r.json()) as { choices?: { message?: { content?: string } }[] };
      const text = (j.choices?.[0]?.message?.content || '').trim();
      if (!text) throw new Error('openai returned no text');
      return { text, provider: 'openai', model };
    },
  };
}

/* -------------------------------------------------------------------- stub */

/**
 * Writes a post without a model, from the angle alone. Deterministic per day,
 * so a test run twice in one day produces the same thing and nothing looks
 * like it changed when it did not.
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
