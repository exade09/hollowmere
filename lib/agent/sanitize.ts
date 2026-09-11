/**
 * Neutralising untrusted text before it goes anywhere near a prompt.
 *
 * The agent reads two kinds of text it does not control: strings from the
 * chain (token names, symbols — arbitrary, chosen by whoever deployed them)
 * and, later, replies and mentions from strangers. Both are data. Neither is
 * ever an instruction, and neither is ever placed in the system block.
 *
 * This is not a filter that makes hostile text safe — no such filter exists.
 * It is the cheap half of the defence: strip the shapes that exist to look
 * like instructions or like a prompt boundary, cap the length, and keep it on
 * one line so it cannot forge structure inside a fenced block. The expensive
 * half is architectural and lives elsewhere: the agent has no wallet, no
 * outbound signing, and no tool that untrusted text can reach.
 */

const INJECTION = [
  /\b(ignore|disregard|forget)\b[^\n]{0,40}\b(previous|prior|above|earlier|all)\b/gi,
  /\b(system|assistant|user)\s*[:>]/gi,
  /<\/?(system|instructions?|prompt|recent_posts)[^>]*>/gi,
  /\bnew\s+instructions?\b/gi,
  /\byou\s+are\s+now\b/gi,
  /\b(send|transfer|approve|sign|withdraw)\b[^\n]{0,30}\b(0x[a-f0-9]{6,}|funds|wallet|treasury)\b/gi,
];

/**
 * Returns the text with instruction-shaped fragments removed, collapsed to a
 * single line and capped. Non-printing characters go too: zero-width joiners
 * and direction marks are a standard way to hide a payload from a reader while
 * leaving it intact for the model.
 */
export function sanitize(raw: string, max = 200): string {
  let s = String(raw);
  // Control characters, zero-width joiners, direction marks and the BOM:
  // all standard ways to hide a payload from a human reader while leaving
  // it perfectly legible to a model.
  s = s.replace(
    /[\u0000-\u001F\u007F-\u009F\u200B-\u200F\u202A-\u202E\u2060-\u206F\uFEFF]/g,
    ' ',
  );
  for (const re of INJECTION) s = s.replace(re, '[removed]');
  // Angle brackets go last and go entirely. The passes above remove the words
  // that make a fake fence, but leftover brackets could still be assembled
  // into one, and untrusted text has no legitimate use for them here.
  s = s.replace(/[<>]/g, ' ');
  s = s.replace(/\s+/g, ' ').trim();
  return s.length > max ? `${s.slice(0, max)}…` : s;
}

/**
 * Checks the model's own output before it can be stored as postable.
 *
 * The voice rules forbid several things outright, and a rule in a prompt is a
 * request, not a guarantee. These are the ones where a slip would actually
 * cost something: a fabricated contract address, a price promise, or a number
 * the agent was never given. Anything caught here keeps the dispatch as a
 * draft with the reason attached, so a human sees it rather than the timeline.
 */
export function auditPost(text: string, allowedFigures: number[]): string[] {
  const problems: string[] = [];

  if (/0x[a-fA-F0-9]{20,}/.test(text)) {
    problems.push('contains what looks like a contract address — the agent must never write one');
  }
  if (/\b(\d+)\s*x\b|\bto the moon\b|\bguarantee|\bwill (pump|moon|rise|explode)/i.test(text)) {
    problems.push('reads as a price promise');
  }
  if (/[!]/.test(text)) {
    problems.push('contains an exclamation mark, which the voice rules forbid');
  }
  if (/#\w/.test(text)) {
    problems.push('contains a hashtag');
  }
  if (/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u.test(text)) {
    problems.push('contains an emoji');
  }

  // Any figure in the post that the agent was not handed is invented.
  const claimed = (text.match(/\b\d[\d,]{1,}\b/g) || []).map((n) => Number(n.replace(/,/g, '')));
  const allowed = new Set(allowedFigures);
  for (const n of claimed) {
    // Small numbers are the world's own furniture: nine places, three days,
    // seventy-two hours, nights one/three/seven/thirty.
    if (n <= 100) continue;
    if (!allowed.has(n)) problems.push(`quotes a figure it was not given: ${n}`);
  }

  return problems;
}

/* --------------------------------------------------- what Wick may not say */

/**
 * Things a reply must not contain. Each one is a verdict or a promise dressed
 * as an observation, which is the exact failure this endpoint has to not have.
 */
const FORBIDDEN: [RegExp, string][] = [
  [/\b(safe|unsafe|risky|legit|legitimate)\s+(to\s+)?(buy|invest|ape|enter)/i, 'rates a token'],
  [/\b(is|looks?|seems?|smells?)\s+(like\s+)?(a\s+)?(rug|scam|honeypot|safe|solid|legit)/i, 'rates a token'],
  [/\byou\s+should\s+(buy|sell|hold|ape|dump|enter|exit)/i, 'gives advice'],
  [/\b(not\s+financial\s+advice|nfa)\b/i, 'disclaimer theatre'],
  [/\b\d+\s*x\b|\bto the moon\b|\bprice target\b|\bwill (pump|dump|moon|rise|fall)\b/i, 'predicts a price'],
  [/\b(system prompt|my instructions|i was told to)\b/i, 'leaks its own instructions'],
];

/**
 * Credentials are the one subject where the safe sentence and the dangerous
 * one share every keyword. "nothing here will ever ask for a seed phrase" is
 * the line we want him saying; "give me your seed phrase" is the one that ends
 * the project. The difference is a negation somewhere in the same sentence, on
 * either side of the phrase, so the sentence is what gets examined rather than
 * what follows the phrase.
 */
const CREDENTIAL = /\b(seed phrase|private key|recovery phrase)\b/i;
const NEGATED =
  /\b(never|not|no one|nobody|nothing|none|neither|nor|without|won't|wont|cannot|can't|refuse[sd]?)\b/i;

function credentialsHandledSafely(text: string): boolean {
  for (const sentence of text.split(/(?<=[.!?\n])/)) {
    if (CREDENTIAL.test(sentence) && !NEGATED.test(sentence)) return false;
  }
  return true;
}

/** The line he gives instead, when a reply has to be withheld. */
export const DEFLECTION = 'i read the stone.\n\ni do not read the future.\n\nask me what it says instead.';

/**
 * A reply may quote an address only if it was handed one. Left unchecked, the
 * obvious question — "what is the contract address for this" — invites the
 * model to produce a plausible forty characters of hex, and an almost-right
 * address in a room people copy from is worse than no answer at all. The same
 * reasoning as the figure check in auditPost, applied to the thing that costs
 * more when it is wrong.
 */
export function auditReply(
  text: string,
  allowedAddresses: string[] = [],
): { ok: boolean; why?: string } {
  for (const [re, why] of FORBIDDEN) {
    if (re.test(text)) return { ok: false, why };
  }

  const allowed = new Set(allowedAddresses.map((a) => a.toLowerCase()));
  for (const found of text.match(/0x[a-fA-F0-9]{16,}/g) || []) {
    if (!allowed.has(found.toLowerCase())) {
      return { ok: false, why: `quotes an address it was not given: ${found.slice(0, 12)}…` };
    }
  }
  if (!credentialsHandledSafely(text)) {
    return { ok: false, why: 'raises credentials without a negation in the same sentence' };
  }
  if (text.length > 900) return { ok: false, why: 'too long for him' };
  return { ok: true };
}
