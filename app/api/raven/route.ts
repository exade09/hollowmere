import { NextResponse } from 'next/server';
import { publicDispatches } from '@/lib/agent/brain';

/**
 * What the raven brought back. Public, read-only, approved dispatches only.
 *
 * This is the entire seam between the agent and the room: the Raven panel
 * fetches this, and falls back to the written NOTES when it is empty, so the
 * site works exactly as it does today with no agent running at all.
 */
export const runtime = 'nodejs';
export const revalidate = 60;

export async function GET() {
  try {
    const dispatches = await publicDispatches(6);
    return NextResponse.json(
      {
        dispatches: dispatches.map((d) => ({ date: d.date, text: d.text })),
      },
      { headers: { 'cache-control': 'public, max-age=60, stale-while-revalidate=300' } },
    );
  } catch {
    // The room must open even if the store is unreachable.
    return NextResponse.json({ dispatches: [] });
  }
}
