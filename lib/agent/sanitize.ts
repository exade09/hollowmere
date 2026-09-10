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
