/**
 * Where the agent keeps what it has said.
 *
 * Two implementations behind one interface, chosen by environment, for the
 * same reason the model provider is: so that building and testing does not
 * wait on an account being created.
 *
 *   - file    — a JSON file under .agent/. Local development only: a
 *               serverless filesystem is read-only and does not persist.
 *   - upstash — Redis over HTTP, which is what Vercel's KV integration
 *               provisions. No driver, no dependency, just fetch.
 *
 * The whole state is one JSON document read and rewritten as a unit. That is
 * crude and completely adequate here: there is exactly one writer, it runs at
 * most a few times an hour, and the document is a few kilobytes.
 */
import { Angle, Dispatch } from './types';

export type AgentState = {
  dispatches: Dispatch[];
  /** Angles most recently used, newest first, so the brain can avoid them. */
  lastAngles: Angle[];
  lastTickAt: number;
};

const EMPTY: AgentState = { dispatches: [], lastAngles: [], lastTickAt: 0 };
const KEY = 'hollowmere:agent';
/** Kept short on purpose: the raven shows a handful and memory needs a handful. */
const MAX_KEEP = 60;

export type Store = {
  kind: string;
  read(): Promise<AgentState>;
  write(s: AgentState): Promise<void>;
};

/* -------------------------------------------------------------- upstash rest */

function upstash(url: string, token: string): Store {
  const cmd = async (args: unknown[]): Promise<unknown> => {
    const r = await fetch(url, {
      method: 'POST',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify(args),
      cache: 'no-store',
    });
    if (!r.ok) throw new Error(`kv ${r.status}: ${(await r.text()).slice(0, 200)}`);
    const j = (await r.json()) as { result?: unknown };
    return j.result;
  };
  return {
    kind: 'upstash',
    async read() {
      const raw = await cmd(['GET', KEY]);
      if (typeof raw !== 'string' || !raw) return { ...EMPTY };
      try {
        return { ...EMPTY, ...(JSON.parse(raw) as Partial<AgentState>) };
      } catch {
        return { ...EMPTY };
      }
    },
    async write(s) {
      await cmd(['SET', KEY, JSON.stringify(trim(s))]);
    },
  };
}

/* --------------------------------------------------------------------- file */

function fileStore(): Store {
  const path = '.agent/state.json';
  return {
    kind: 'file',
    async read() {
      const { readFile } = await import('node:fs/promises');
      try {
        const raw = await readFile(path, 'utf8');
        return { ...EMPTY, ...(JSON.parse(raw) as Partial<AgentState>) };
      } catch {
        return { ...EMPTY };
      }
    },
    async write(s) {
      const { mkdir, writeFile } = await import('node:fs/promises');
      await mkdir('.agent', { recursive: true });
      await writeFile(path, JSON.stringify(trim(s), null, 2), 'utf8');
    },
  };
}

function trim(s: AgentState): AgentState {
  return {
    ...s,
    dispatches: [...s.dispatches]
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, MAX_KEEP),
    lastAngles: s.lastAngles.slice(0, 6),
  };
}

export function getStore(): Store {
  // Vercel's KV integration injects the first pair; Upstash's own dashboard
  // calls them UPSTASH_*. Accept either so neither setup needs renaming.
  const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
  if (url && token) return upstash(url, token);
  return fileStore();
}
