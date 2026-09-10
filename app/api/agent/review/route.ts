import { NextRequest, NextResponse } from 'next/server';
import { timingSafeEqual } from 'node:crypto';
import { getStore } from '@/lib/agent/store';

/**
 * The human gate.
 *
 * Drafts sit here until someone approves or rejects one, and only approved
 * dispatches reach /api/raven. GET lists everything with its status so there
 * is something to review; POST sets a status on one id.
 *
 *   GET  /api/agent/review                       — list
 *   POST /api/agent/review  {id, status}         — approve | reject
 *
 * Both need the same secret as the tick. The text can also be corrected while
 * approving, because a nearly-right post is worth fixing rather than binning.
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
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function GET(req: NextRequest) {
  if (!authorised(req)) return NextResponse.json({ error: 'not authorised' }, { status: 401 });
  const state = await getStore().read();
  return NextResponse.json({
    store: getStore().kind,
    lastTickAt: state.lastTickAt,
    dispatches: state.dispatches.map((d) => ({
      id: d.id,
      date: d.date,
      status: d.status,
      angle: d.angle,
      by: d.by,
      text: d.text,
    })),
  });
}

export async function POST(req: NextRequest) {
  if (!authorised(req)) return NextResponse.json({ error: 'not authorised' }, { status: 401 });

  let body: { id?: string; status?: 'approved' | 'rejected'; text?: string };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: 'body must be json' }, { status: 400 });
  }

  const { id, status, text } = body;
  if (!id || (status !== 'approved' && status !== 'rejected')) {
    return NextResponse.json(
      { error: 'send {id, status: "approved" | "rejected", text?}' },
      { status: 400 },
    );
  }

  const store = getStore();
  const state = await store.read();
  const found = state.dispatches.find((d) => d.id === id);
  if (!found) return NextResponse.json({ error: 'no such dispatch' }, { status: 404 });

  const updated = state.dispatches.map((d) =>
    d.id === id ? { ...d, status, ...(text ? { text } : {}) } : d,
  );
  await store.write({ ...state, dispatches: updated });

  return NextResponse.json({ ok: true, id, status });
}
