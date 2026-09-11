/**
 * Spending limits for the public endpoints.
 *
 * /api/wick calls a paid model on behalf of anyone who opens the site, which
 * makes it the one place in this project where a stranger can spend the
 * project's money. Three limits, all of them cheap to enforce:
 *
 *   per visitor, per minute  — stops one person hammering it
 *   per visitor, per day     — stops one person living in it
 *   everyone, per day        — the actual budget ceiling, and the one that
 *                              matters if the site is ever linked somewhere busy
 *
 * Counters live in Redis when it is configured, because serverless instances
 * do not share memory and an in-memory counter is no limit at all in
 * production. Locally they fall back to a Map, which is correct for one
 * process and honest about being nothing more.
 */

const memory = new Map<string, { n: number; resetAt: number }>();

type Limit = { key: string; max: number; windowSec: number };

export type Verdict = { allowed: boolean; which?: string; retryAfterSec?: number };

function redis(): { url: string; token: string } | null {
  const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
  return url && token ? { url, token } : null;
}

async function bump(l: Limit): Promise<number> {
  const r = redis();
  if (!r) {
    const now = Date.now();
    const cur = memory.get(l.key);
    if (!cur || cur.resetAt <= now) {
      memory.set(l.key, { n: 1, resetAt: now + l.windowSec * 1000 });
      return 1;
    }
    cur.n += 1;
    return cur.n;
  }
  const send = async (args: unknown[]) => {
    const res = await fetch(r.url, {
      method: 'POST',
      headers: { authorization: `Bearer ${r.token}`, 'content-type': 'application/json' },
      body: JSON.stringify(args),
      cache: 'no-store',
    });
    const j = (await res.json()) as { result?: unknown };
    return j.result;
  };
  const n = Number(await send(['INCR', l.key]));
  // Only the first hit in a window needs the expiry set.
  if (n === 1) await send(['EXPIRE', l.key, l.windowSec]);
  return Number.isFinite(n) ? n : 1;
}

function day(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Identifies a visitor well enough to rate-limit, and no better.
 *
 * The IP is hashed with a per-deployment salt before it is stored, so the
 * counters cannot be turned back into a list of who visited. Rate limiting
 * needs to tell two visitors apart; it does not need to know either of them.
 */
export async function visitorKey(ip: string): Promise<string> {
  const salt = process.env.CRON_SECRET || 'hollowmere';
  const data = new TextEncoder().encode(`${salt}:${ip}`);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return [...new Uint8Array(digest)].slice(0, 8).map((b) => b.toString(16).padStart(2, '0')).join('');
}

const PER_MIN = Number(process.env.WICK_PER_MINUTE || 4);
const PER_DAY = Number(process.env.WICK_PER_VISITOR_DAY || 40);
const ALL_DAY = Number(process.env.WICK_GLOBAL_DAY || 800);

export async function checkChatLimits(visitor: string): Promise<Verdict> {
  const checks: (Limit & { label: string; retry: number })[] = [
    { key: `wick:m:${visitor}:${Math.floor(Date.now() / 60_000)}`, max: PER_MIN, windowSec: 60, label: 'minute', retry: 60 },
    { key: `wick:d:${visitor}:${day()}`, max: PER_DAY, windowSec: 86_400, label: 'day', retry: 3600 },
    { key: `wick:all:${day()}`, max: ALL_DAY, windowSec: 86_400, label: 'global', retry: 3600 },
  ];
  for (const c of checks) {
    const n = await bump(c);
    if (n > c.max) return { allowed: false, which: c.label, retryAfterSec: c.retry };
  }
  return { allowed: true };
}

/** The token lookup is cheaper (no model call) but still hits an rpc node. */
export async function checkTokenLimits(visitor: string): Promise<Verdict> {
  const n = await bump({
    key: `tok:m:${visitor}:${Math.floor(Date.now() / 60_000)}`,
    max: Number(process.env.TOKEN_PER_MINUTE || 10),
    windowSec: 60,
  });
  return n > Number(process.env.TOKEN_PER_MINUTE || 10)
    ? { allowed: false, which: 'minute', retryAfterSec: 60 }
    : { allowed: true };
}

/** Best effort, and that is all a client IP ever is behind a proxy. */
export function ipOf(headers: Headers): string {
  return (
    headers.get('x-forwarded-for')?.split(',')[0].trim() ||
    headers.get('x-real-ip') ||
    'unknown'
  );
}
