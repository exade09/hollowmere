/**
 * Every string the visitor can read lives here.
 *
 * One voice throughout, and it is Wick's: lower case, short, one thought at a
 * time. Only names take capitals — HOLLOWMERE, WICK, Robinhood Chain, and the
 * place plates in THE HOLD, which are signage rather than prose. The posts the
 * agent writes and the answers it gives in the mirror follow the same rules, so
 * the room and the account sound like one thing.
 *
 * Length is a design constraint here, not a matter of taste. These strings sit
 * in fixed plates beside rendered icons; a sentence that wraps to three lines
 * unbalances the plate it is in.
 */

export const BRAND = {
  world: 'HOLLOWMERE',
  hero: 'the curse never checked out.',
  ticker: process.env.NEXT_PUBLIC_TICKER || 'HOLLOW',
  chain: process.env.NEXT_PUBLIC_CHAIN || 'Robinhood Chain',
  /** Token page prefix; the contract address is appended to it. */
  explorer:
    process.env.NEXT_PUBLIC_EXPLORER || 'https://robinhoodchain.blockscout.com/token/',
  contract: process.env.NEXT_PUBLIC_CONTRACT || '',
};

export const SOCIALS: { name: string; href: string; note: string }[] = [
  { name: 'X', href: 'https://x.com/', note: 'loudest there' },
  { name: 'Telegram', href: 'https://t.me/', note: 'for the ones who never sleep' },
];

/**
 * Scraps the raven brings back, used until the agent has approved dispatches of
 * its own. Dates are ISO so they sort themselves.
 */
export const NOTES: { date: string; text: string; href?: string }[] = [
  { date: '2026-09-10', text: 'the sanctum is mapped. the door down is open' },
  { date: '2026-09-09', text: 'another night. i lose the thread every time' },
  { date: '2026-09-08', text: 'it brought a stranger’s note. the ink had run' },
];

/** The roadmap, kept as a list of duties rather than quarters. */
export const RITES: { text: string; done: boolean }[] = [
  { text: 'map the sanctum', done: true },
  { text: 'go down', done: true },
  { text: 'mark what answers to a touch', done: true },
  { text: 'write down the raven’s voice', done: false },
  { text: 'find the key', done: false },
  { text: 'open the third place', done: false },
  { text: 'stop counting', done: false },
];

/** Some volumes are deliberately lost. That is tone, not an unfinished task. */
export const ARCHIVE: {
  name: string;
  note: string;
  state: 'ready' | 'lost' | 'soon';
  href?: string;
}[] = [
  {
    name: 'box art',
    note: 'the sanctum, framed',
    state: 'ready',
    href: '/clips/sanctum/poster/00_idle.jpg',
  },
  {
    name: 'the sanctum',
    note: '1920 by 1080, at rest',
    state: 'ready',
    href: '/clips/sanctum/poster/00_idle.jpg',
  },
  {
    name: 'the undercroft',
    note: '1920 by 1080, at rest',
    state: 'ready',
    href: '/clips/undercroft/poster/00_idle.jpg',
  },
  { name: 'press kit', note: 'palette and mark', state: 'soon' },
  { name: 'seals', note: 'twenty. none drawn', state: 'soon' },
  { name: 'the manual', note: 'pages torn out', state: 'lost' },
  { name: 'the full rites', note: 'burnt at the edges', state: 'lost' },
];

/** Only the places that actually have a scene are open. */
export const HOLD: { name: string; id?: 'sanctum' | 'undercroft'; note: string }[] = [
  { name: 'THE SANCTUM', id: 'sanctum', note: 'the tower. where i live' },
  { name: 'THE UNDERCROFT', id: 'undercroft', note: 'below. quiet down there' },
  { name: 'THE GREAT HALL', note: '' },
  { name: 'THE HOLLOW WOOD', note: '' },
  { name: 'THE LOW QUARTER', note: '' },
  { name: 'THE CHAPEL OF ASH', note: '' },
  { name: 'THE WATCHTOWER', note: '' },
  { name: 'THE OSSUARY', note: '' },
  { name: '???', note: 'i do not remember' },
];

/** Character sheet, shown in the mirror. */
export const WICK: [string, string][] = [
  ['name', 'WICK'],
  ['height', 'shorter than you expect'],
  ['holding', 'all of HOLLOWMERE'],
  ['duty', 'keep the fire'],
  ['likes', 'quiet, a steady flame'],
  ['dislikes', 'draughts, visitors'],
  ['status', 'cursed. otherwise fine'],
];

/**
 * The chest lock, and the only place its answer is written down.
 *
 * The chest panel tells the visitor the same marks are cut into the cage wall,
 * so both panels must read this one array — the order below is the order the
 * scratches appear in downstairs, top to bottom.
 */
export const LOCK_GLYPHS = ['ᛗ', 'ᚦ', 'ᛟ', 'ᚱ', 'ᛊ', 'ᛉ', 'ᚨ', 'ᛝ'];
export const LOCK_ORDER = [5, 2, 6];

/** Scratches on the cage wall. Unlocked by how many nights you have come back. */
export const TALLY_NOTES: { at: number; text: string }[] = [
  { at: 1, text: 'first mark. it gets easier' },
  { at: 3, text: 'the raven brings food. and a note i could not read' },
  { at: 7, text: 'the door was never locked. there was no reason' },
  { at: 30, text: 'i stopped waiting. i did not stop counting' },
  { at: 100, text: 'a hundred. someone else is counting now' },
];

/** TODO: replace with the real founder's note — this is the reward for the lock. */
export const HOARD_NOTE = {
  title: 'the note at the bottom',
  body: [
    'the letter from whoever started HOLLOWMERE goes here: why the place exists, ' +
      'and why the lock had to be opened by hand.',
    'the page is still blank. you got here first',
  ],
  sign: '— unsigned',
};

export type Sphere = {
  id: string;
  title: string;
  /** Credit line. Empty for silence. */
  artist: string;
  /** Path under /public/audio, or null for silence. */
  file: string | null;
  /** What the room sounds like when this one is playing. */
  note: string;
};

/**
 * What the rings are tuned to. These are real recordings, so the panel credits
 * them by name rather than hiding them behind world flavour.
 */
export const SPHERES: Sphere[] = [
  {
    id: 'harvest-dawn',
    title: 'Harvest Dawn',
    artist: 'Jeremy Soule · The Elder Scrolls IV',
    file: '/audio/harvest-dawn.mp3',
    note: 'before anything is asked of you',
  },
  {
    id: 'moog-city-2',
    title: 'Moog City 2',
    artist: 'C418 · slowed',
    file: '/audio/moog-city-2.mp3',
    note: 'someone keeping house, far off',
  },
  {
    id: 'space-ii',
    title: 'Space II',
    artist: 'Dorian Concept · slowed + reverb',
    file: '/audio/space-ii.mp3',
    note: 'the hole in the ceiling',
  },
  {
    id: 'hide',
    title: 'Hide',
    artist: 'Dorian Concept · slowed',
    file: '/audio/hide.mp3',
    note: 'for the nights i do not answer',
  },
  {
    id: 'silence',
    title: 'Silence',
    artist: '',
    file: null,
    note: 'cheaper to keep',
  },
];

/**
 * The raven's caw, trimmed to a single call and timed to the beak.
 *
 * In the Sanctum's idle loop the beak keys sit at frames 97, 114, 126 and 142
 * of 240 at 24 fps: it starts opening at 4.04 s, is widest from 4.75 s to
 * 5.25 s, and is shut again by 5.92 s. The clip is 0.40 s with its loudest
 * 120 ms up front, so starting at 4.6 s lands the call on the widest point.
 */
export const RAVEN_CAW = {
  file: '/audio/sfx/raven-caw.mp3',
  at: 4.6,
  /** Quieter than the music, which it has to sit on top of. */
  gain: 0.75,
};
