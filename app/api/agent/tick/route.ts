import { NextRequest, NextResponse } from 'next/server';
import { timingSafeEqual } from 'node:crypto';
import { tick } from '@/lib/agent/brain';

/**
 * The agent's heartbeat. Something calls this on a schedule; it writes at most
 * one dispatch and returns what it did.
 *
 * It is gated on a shared secret because it costs money to run: an open
 * endpoint that calls a paid model is a way to have someone else spend your
 * budget. Vercel's own cron sends `Authorization: Bearer <CRON_SECRET>`, and a
 * GitHub Actions schedule can send the same header, so one check covers both.
 */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function authorised(req: NextRequest): boolean {
  const expected = process.env.CRON_SECRET || process.env.AGENT_CRON_SECRET || '';
  if (!expected) return false;
  const got =
    req.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ||
    req.headers.get('x-agent-secret') ||
    '';
  const a = Buffer.from(got);
  const b = Buffer.from(expected);
  // Length is compared first because timingSafeEqual throws on a mismatch.
  return a.length === b.length && timingSafeEqual(a, b);
}

async function run(req: NextRequest) {
  if (!authorised(req)) {
    return NextResponse.json({ error: 'not authorised' }, { status: 401 });
  }
  const force = new URL(req.url).searchParams.get('force') === '1';
  try {
    const result = await tick({ force });
    return NextResponse.json(result);
  } catch (e) {
    // A failed tick is not a crashed site. Report it and let the next one try.
    return NextResponse.json({ ok: false, error: String(e).slice(0, 400) }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  return run(req);
}

/** Vercel cron issues a GET, so both verbs do the same thing. */
export async function GET(req: NextRequest) {
  return run(req);
}
