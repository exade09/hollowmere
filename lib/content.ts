/**
 * Every string the visitor can read lives here.
 *
 * Anything marked TODO is a placeholder written in the world's voice on
 * purpose: the site reads as finished until the real copy arrives, instead of
 * showing "lorem ipsum" or an empty panel.
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
  { name: 'X', href: 'https://x.com/', note: 'the herald shouts loudest there' },
  { name: 'Telegram', href: 'https://t.me/', note: 'where the ones who never sleep sit' },
];

/** Scraps the raven brings back. Dates are ISO so they sort themselves. */
export const NOTES: { date: string; text: string; href?: string }[] = [
  {
    date: '2026-09-10',
    text:
      'The Sanctum is mapped. Eight things answer to a touch, and the door down is open. ' +
      'Below it: a cage, an altar, and a gate that stays shut.',
  },
  {
    date: '2026-09-09',
    text: 'Another night. I will not count them. I always lose the thread.',
  },
  {
    date: '2026-09-08',
    text: 'The raven came back with someone else’s note. The ink had run. I could not read it.',
  },
];

/** The roadmap, kept as a list of duties rather than quarters. */
export const RITES: { text: string; done: boolean }[] = [
  { text: 'map the Sanctum', done: true },
  { text: 'go down into the Undercroft', done: true },
  { text: 'mark everything that answers to a touch', done: true },
  { text: 'write down the raven’s voice', done: false },
  { text: 'find the key to the gate', done: false },
  { text: 'open the third place', done: false },
  { text: 'stop counting the nights', done: false },
];

/** Some volumes are deliberately lost. That is tone, not an unfinished task. */
export const ARCHIVE: {
  name: string;
  note: string;
  state: 'ready' | 'lost' | 'soon';
  href?: string;
}[] = [
  {
    name: 'Box art',
    note: 'the Sanctum, framed the way it would sit on a shelf',
    state: 'ready',
    href: '/clips/sanctum/poster/00_idle.jpg',
  },
  {
    name: 'Wallpaper: the Sanctum',
    note: '1920 by 1080, everything at rest',
    state: 'ready',
    href: '/clips/sanctum/poster/00_idle.jpg',
  },
  {
    name: 'Wallpaper: the Undercroft',
    note: '1920 by 1080, everything at rest',
    state: 'ready',
    href: '/clips/undercroft/poster/00_idle.jpg',
  },
  { name: 'Press kit', note: 'palette, mark, what you may and may not do with them', state: 'soon' },
  { name: 'Seals', note: 'twenty of them. none drawn yet', state: 'soon' },
  { name: 'Instruction manual', note: 'pages torn out', state: 'lost' },
  { name: 'The full rites', note: 'burnt at the edges, readable every other word', state: 'lost' },
];

/** Only the places that actually have a scene are open. */
export const HOLD: { name: string; id?: 'sanctum' | 'undercroft'; note: string }[] = [
  { name: 'THE SANCTUM', id: 'sanctum', note: 'the tower. this is where I live' },
  { name: 'THE UNDERCROFT', id: 'undercroft', note: 'below. it is quiet down there' },
  { name: 'THE GREAT HALL', note: 'shut. come back later' },
  { name: 'THE HOLLOW WOOD', note: 'shut. come back later' },
  { name: 'THE LOW QUARTER', note: 'shut. come back later' },
  { name: 'THE CHAPEL OF ASH', note: 'shut. come back later' },
  { name: 'THE WATCHTOWER', note: 'shut. come back later' },
  { name: 'THE OSSUARY', note: 'shut. come back later' },
  { name: '???', note: 'I do not remember what is in there' },
];

/** Character sheet, shown in the mirror. */
export const WICK: [string, string][] = [
  ['name', 'WICK'],
  ['height', 'shorter than you expect'],
  ['holding', 'HOLLOWMERE, all of it'],
  ['duty', 'keep the fire'],
  ['likes', 'quiet, a steady flame, the raven'],
  ['dislikes', 'draughts, counting nights, visitors'],
  ['status', 'cursed. otherwise fine'],
];

/** Scratches on the cage wall. Unlocked by how many nights you have come back. */
export const TALLY_NOTES: { at: number; text: string }[] = [
  { at: 1, text: 'First mark. It gets easier after this one.' },
  { at: 3, text: 'The raven brings food. It brought a stranger’s note too. I could not read it.' },
  { at: 7, text: 'The door was never locked. I checked. There is simply no reason to lock it.' },
  { at: 30, text: 'On the thirtieth night I stopped waiting. I did not stop counting.' },
  { at: 100, text: 'A hundred. Someone is keeping the count for me now, and that is the worst part.' },
];

/** TODO: replace with the real founder's note — this is the reward for the lock. */
export const HOARD_NOTE = {
  title: 'the note at the bottom of the chest',
  body: [
    'This is where the letter from whoever started HOLLOWMERE goes: why the place ' +
      'exists, what comes next, and why the lock had to be opened by hand instead of ' +
      'handed over as a link.',
    'The page is still blank. The chest is open, which means you got here first and ' +
      'you will see the text the moment it lands.',
  ],
  sign: '— TODO: signature',
};

export const SPHERES: { id: string; name: string; note: string }[] = [
  { id: 'wind', name: 'wind in the stone', note: 'not recorded yet' },
  { id: 'deep', name: 'the deep hour', note: 'not recorded yet' },
  { id: 'embers', name: 'embers', note: 'not recorded yet' },
  { id: 'silence', name: 'silence', note: 'always available' },
];
