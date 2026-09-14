/**
 * The one string on this site that has to change without a deploy.
 *
 * The contract address lands at an hour nobody chooses, and when it lands it
 * has to appear on the page immediately — not after a rebuild, and not after
 * somebody with a laptop wakes up. So it lives here, in a store, and the admin
 * desk at /admin writes it.
 *
 * It is a free string, deliberately. Before there is an address the bar should
 * be able to say TBA, or SOON, or nothing at all, and those are not addresses
 * to be validated: they are the same field in a different state. What does get
 * checked is shape rather than content — whether the text happens to look like
 * an address — and that only decides whether the copy button and the explorer
 * link mean anything. An "almost right" address on a page people paste into a
 * DEX is worse than no address at all, so a word that is not one gets no copy
 * button rather than a button that hands over a word.
 *
 * Two backends behind one interface, the same pair and the same reasoning as
 * the agent's store:
 *
 *   upstash — Redis over HTTP, which is what Vercel's KV integration
 *             provisions. This is the one that works in production.
 *   file    — .agent/settings.json. Local development only: a serverless
 *             filesystem is read-only and does not survive a cold start, so a
 *             value written to it in production would quietly vanish. The
 *             admin desk is told which backend answered and says so on screen,
 *             because a setting that silently un-sets itself is the worst
 *             possible behaviour for this particular field.
 */

export type Settings = {
  /** Whatever should appear after "CA:" on the site. Any text. */
  address: string;
  updatedAt: number;
};

const EMPTY: Settings = { address: '', updatedAt: 0 };
const KEY = 'hollowmere:settings';
const MAX = 64;

export type SettingsStore = {
  kind: 'upstash' | 'file';
  /** True when a value written here survives a cold start. */
  durable: boolean;
  read(): Promise<Settings>;
  write(s: Settings): Promise<void>;
};

/**
 * Keeps the field to one line of printable text.
 *
 * It is rendered into the page and into a canvas card, so a newline or a
 * control character has nothing to do here; and it is read by anyone who opens
 * the site, so the length is capped at something a bar can hold.
 */
export function cleanAddressText(raw: string): string {
  return String(raw)
    .replace(/[\u0000-\u001F\u007F-\u009F\u200B-\u200F\u202A-\u202E\u2060-\u206F\uFEFF]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX);
}

/**
 * Which kind of address the text is shaped like, if either.
 *
 * Both shapes, because the field has to survive the project being on either
 * kind of chain — and the first time a real Solana address went through here it
 * was treated as a word: no copy button, no chart, no link. An EVM address is
 * 0x and forty hex; a Solana address is base58, thirty-two to forty-four
 * characters, from an alphabet with no zero, capital O, capital I or lower-case
 * l in it. Nothing a person would type as a placeholder — TBA, SOON, later —
 * is long enough to be mistaken for either.
 *
 * The distinction is kept rather than flattened to a boolean because the links
 * are not interchangeable: a block explorer for one chain cannot read an
 * address from another, and a chart URL carries its chain in the path.
 */
export function addressKind(text: string): 'evm' | 'solana' | null {
  const t = text.trim();
  if (/^0x[0-9a-fA-F]{40}$/.test(t)) return 'evm';
  if (/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(t)) return 'solana';
  return null;
}

/** Whether the text is shaped like an address at all. */
export function looksLikeAddress(text: string): boolean {
  return addressKind(text) !== null;
}

function upstash(url: string, token: string): SettingsStore {
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
    durable: true,
    async read() {
      const raw = await cmd(['GET', KEY]);
      if (typeof raw !== 'string' || !raw) return { ...EMPTY };
      try {
        return { ...EMPTY, ...(JSON.parse(raw) as Partial<Settings>) };
      } catch {
        return { ...EMPTY };
      }
    },
    async write(s) {
      await cmd(['SET', KEY, JSON.stringify(s)]);
    },
  };
}

function fileStore(): SettingsStore {
  const path = '.agent/settings.json';
  return {
    kind: 'file',
    durable: false,
    async read() {
      const { readFile } = await import('node:fs/promises');
      try {
        const raw = await readFile(path, 'utf8');
        return { ...EMPTY, ...(JSON.parse(raw) as Partial<Settings>) };
      } catch {
        return { ...EMPTY };
      }
    },
    async write(s) {
      const { mkdir, writeFile } = await import('node:fs/promises');
      await mkdir('.agent', { recursive: true });
      await writeFile(path, JSON.stringify(s, null, 2), 'utf8');
    },
  };
}

export function getSettingsStore(): SettingsStore {
  const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
  if (url && token) return upstash(url, token);
  return fileStore();
}

/**
 * What the site should show, with the store winning over the build.
 *
 * NEXT_PUBLIC_CONTRACT stays supported and stays the fallback: a deployment
 * that never opens the admin desk behaves exactly as it did before this file
 * existed. Never throws — if the store is unreachable the site shows the
 * compiled value rather than an error, because a bar that says nothing is a
 * worse failure than a bar that is one edit out of date.
 */
export async function currentAddress(): Promise<{ text: string; from: 'store' | 'env' | 'none' }> {
  const env = (process.env.NEXT_PUBLIC_CONTRACT || '').trim();
  try {
    const s = await getSettingsStore().read();
    const text = cleanAddressText(s.address);
    if (text) return { text, from: 'store' };
  } catch {
    /* fall through to the compiled value */
  }
  return env ? { text: env, from: 'env' } : { text: '', from: 'none' };
}
