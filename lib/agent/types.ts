/**
 * Shapes shared by the agent and the site.
 *
 * The agent writes dispatches; the Sanctum's raven reads them. That is the
 * whole contract between the two, and it is deliberately this small: the site
 * stays a static page that fetches one endpoint, and the agent stays a job that
 * can be run, tested, and rewritten without touching the room.
 */

/** What the agent produced. One dispatch is one post. */
export type Dispatch = {
  id: string;
  /** ISO date, so they sort themselves the way NOTES already does. */
  date: string;
  createdAt: number;
  /** The post itself, in the house voice. */
  text: string;
  /** Which angle the brain chose, for variety accounting. */
  angle: Angle;
  /**
   * Nothing reaches the public until a human says so, unless AGENT_AUTOPOST is
   * explicitly turned on. A crypto account that posts unreviewed model output
   * is a liability, not a feature.
   */
  status: 'draft' | 'approved' | 'posted' | 'rejected';
  /** Set once it has gone out to X, so it is never posted twice. */
  postedAt?: number;
  /** Where the numbers in the text came from, if any. */
  usedChain?: ChainSnapshot;
  /** Which provider and model wrote it — useful when comparing voices. */
  by: { provider: string; model: string };
};

/**
 * The angles the agent is allowed to write from. Keeping them enumerated is
 * what stops the account from posting the same thought in ten costumes: the
 * brain sees which angles ran recently and picks one that did not.
 */
export type Angle =
  | 'the fire'      // the vigil, the candle, keeping watch
  | 'the nights'    // the tally, time passing, returning visitors
  | 'the raven'     // news from outside, what the bird brought
  | 'the hold'      // the nine places, what is still shut
  | 'the gate'      // the sealed gate below, the key
  | 'the room'      // an observation about the Sanctum or the Undercroft
  | 'the chain';    // an on-chain fact, stated flatly

export const ANGLES: Angle[] = [
  'the fire', 'the nights', 'the raven', 'the hold', 'the gate', 'the room', 'the chain',
];

/** What the agent can see on Robinhood Chain. Read-only, always. */
export type ChainSnapshot = {
  at: number;
  contract: string;
  ok: boolean;
  /** Absent when the explorer refused us or no contract is configured yet. */
  holders?: number;
  name?: string;
  symbol?: string;
  /** Recent transfer count in the window the reader asked for. */
  transfers?: number;
  /** Distinct addresses that received and sent in that window. */
  receivers?: number;
  senders?: number;
  /** How many blocks the window covered, so a figure can be given a period. */
  blocks?: number;
  /** Which reader produced this: 'rpc' or 'explorer'. */
  via?: 'rpc' | 'explorer';
  /** Why it failed, when it did. Kept so a tick can explain itself. */
  note?: string;
};

export type TickResult = {
  ok: boolean;
  wrote?: Dispatch;
  skipped?: string;
  chain?: ChainSnapshot;
};
