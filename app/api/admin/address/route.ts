import { NextRequest, NextResponse } from 'next/server';
import { createHash, timingSafeEqual } from 'node:crypto';
import { checkAdminLimits, ipOf, visitorKey } from '@/lib/agent/limits';
import {
  cleanAddressText,
  currentAddress,
  getSettingsStore,
  looksLikeAddress,
} from '@/lib/settings';

/**
 * The address desk.
 *
 *   GET  /api/admin/address              — what is set, and where it came from
 *   POST /api/admin/address  {address}   — set it. An empty string clears it.
 *
 * Both need the password, sent as a bearer token. Three things about that:
 *
 * 1. The password lives in ADMIN_PASSWORD on the server and nowhere else. It
 *    is never compiled into the browser bundle, never committed, and never put
 *    in a URL, where it would land in browser history and in request logs.
 * 2. With the variable unset this endpoint refuses everything. Default deny is
 *    the only sane behaviour for a route that changes what address the site
 *    tells people to buy — an unconfigured deployment should be closed, not
 *    open with a blank password.
 * 3. Both sides are hashed before they are compared, so the comparison is over
 *    two fixed-length buffers and leaks neither the length of the password nor
 *    the position of the first wrong character.
 *
 * The counter in front of it is the other half: constant-time comparison does
 * nothing against somebody simply trying thousands of guesses, so guesses are
 * limited per address and the limit is tight.
 */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function digest(s: string): Buffer {
  return createHash('sha256').update(s, 'utf8').digest();
}

type Gate = { ok: true } | { ok: false; status: number; error: string };

async function gate(req: NextRequest): Promise<Gate> {
  const expected = process.env.ADMIN_PASSWORD || '';
  if (!expected) {
    return {
      ok: false,
      status: 503,
      error: 'the desk is not configured: ADMIN_PASSWORD is not set on the server',
    };
  }

  const visitor = await visitorKey(ipOf(req.headers));
  const verdict = await checkAdminLimits(visitor);
  if (!verdict.allowed) {
    return { ok: false, status: 429, error: 'too many tries. wait a minute' };
  }

  const got =
    req.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ||
    req.headers.get('x-admin-password') ||
    '';
  return timingSafeEqual(digest(got), digest(expected))
    ? { ok: true }
    : { ok: false, status: 401, error: 'that password is not right' };
}

async function state() {
  const store = getSettingsStore();
  const stored = await store.read();
  const now = await currentAddress();
  return {
    address: cleanAddressText(stored.address),
    updatedAt: stored.updatedAt,
    /** What the site is actually showing, which may be the compiled fallback. */
    showing: now.text,
    from: now.from,
    isAddress: looksLikeAddress(now.text),
    store: store.kind,
    durable: store.durable,
  };
}

export async function GET(req: NextRequest) {
  const g = await gate(req);
  if (!g.ok) return NextResponse.json({ error: g.error }, { status: g.status });
  return NextResponse.json(await state());
}

export async function POST(req: NextRequest) {
  const g = await gate(req);
  if (!g.ok) return NextResponse.json({ error: g.error }, { status: g.status });

  let body: { address?: string };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: 'body must be json' }, { status: 400 });
  }

  // Any text at all, by design: TBA, SOON, an address, or nothing. The only
  // processing is the flattening every stored string gets.
  const address = cleanAddressText(String(body.address ?? ''));
  const store = getSettingsStore();
  try {
    await store.write({ address, updatedAt: Date.now() });
  } catch (e) {
    // The file store cannot write on a serverless host: the filesystem is
    // read-only, so this is not "the value will vanish later", it is a write
    // that fails now. Answering with an explanation rather than letting the
    // route throw, because a thrown route answers with an empty body and the
    // desk then reports a json parse error — which tells whoever is standing
    // in front of it nothing at all about what to do.
    const why =
      store.kind === 'file'
        ? 'this host will not let the site write to a file. set KV_REST_API_URL and ' +
          'KV_REST_API_TOKEN (Vercel: Storage, KV, Connect) and try again'
        : `the store refused the write: ${String(e).slice(0, 160)}`;
    return NextResponse.json({ error: why, store: store.kind }, { status: 503 });
  }
  return NextResponse.json({ ok: true, ...(await state()) });
}
