/**
 * Turning a reading into an account of what could happen to it.
 *
 * The reader says what is there. This says what it means — and the distance
 * between those two sentences is the whole design of this file, so it is worth
 * being exact about where the line falls.
 *
 * WHAT THIS DOES
 *
 * It names mechanisms. A token where the owner still holds the keys can mint;
 * a token behind a proxy can have its code replaced under a holder; a token
 * whose owner address holds sixty per cent of supply can be ended by one
 * transaction. Those are not opinions, they are properties of the contract,
 * and a holder who does not know them is holding something other than what
 * they think they are. Saying them plainly is the most useful thing this
 * project does.
 *
 * It also produces three THRESHOLDS: three figures that stand at a known value
 * today, each with a sentence about what a change in it would mean. Those are
 * the three scenarios a holder actually wants — not "sell at three times", but
 * "if this number moves, the thing you bought has changed". A threshold is
 * checkable tomorrow by the same reader that produced it, which is the test
 * that separates it from a forecast.
 *
 * WHAT THIS DOES NOT DO, AND WHY
 *
 * It does not grade. No score, no safe, no risky, no good to hold, no verdict
 * on whether to sell. Two reasons, and the second is the load-bearing one.
 *
 * First: the inputs cannot support it. There is no price here, no order book,
 * no liquidity depth, no history beyond a window of blocks. A grade built on
 * that is a guess wearing a number's clothes.
 *
 * Second: the moment this file says "safe to hold", the project is answerable
 * for every holder who read it and lost money — and it would be right to be.
 * A token that is structurally clean today can be drained tomorrow by a
 * mechanism nothing on chain announced in advance. Mechanisms are durable
 * facts; safety is a claim about the future, and the keeper does not read the
 * future. That sentence is on the account, in the film and in the docs, and a
 * feature that contradicts it would cost more than it adds.
 *
 * So: everything a person needs in order to decide, stated without flinching,
 * and the decision left where it belongs.
 */
import { TokenReport } from './token';
import { Position, WalletReport } from './wallet';

/** One thing worth knowing, as a line somebody can read aloud. */
export type Flag = {
  /** Stable key, for the interface to style and for tests to name. */
  id: string;
  text: string;
  /**
   * `hard` means a mechanism by which a holder can lose the position outright.
   * `note` means something to know. Neither is a grade: a token can carry
   * three hard flags and rise, and carry none and die.
   */
  weight: 'hard' | 'note';
};

/** A figure standing at a known value, and what a change in it would mean. */
export type Threshold = {
  /** What to watch. */
  name: string;
  /** Where it stands now, as text, because some of these are addresses. */
  now: string;
  /** What a change means. Never what to do about it. */
  means: string;
};

export type TokenAssessment = {
  /** A description of the contract, not a grade of it. */
  shape: string;
  flags: Flag[];
  /** The three scenarios, where the data supports three. */
  thresholds: Threshold[];
  /**
   * The answer to "can this be taken from me": every mechanism of loss the
   * reading can speak to, each one either present, absent, or unknown — and
   * unknown said as unknown.
   */
  mechanisms: Flag[];
};

export type WalletAssessment = {
  /** Portfolio-level lines. Counts and shares, never valuations. */
  summary: string[];
  /** Per-position, for the positions that were read in full. */
  tokens: { token: string; symbol?: string; assessment: TokenAssessment }[];
};

/** A plain ERC-20 compiles to roughly this. Anything above is extra logic. */
const BARE_CODE_BYTES = 3_000;

function kb(bytes: number): string {
  return bytes >= 1024 ? `${(bytes / 1024).toFixed(1)} kB` : `${bytes} bytes`;
}

function short(a: string): string {
  return `${a.slice(0, 6)}…${a.slice(-4)}`;
}

/* ------------------------------------------------------------------ a token */

/**
 * What kind of contract this is, said as a description.
 *
 * Every clause is a fact from the reading. The sentence is assembled rather
 * than chosen from a list of labels, because a label is a grade with a friendly
 * face — "clean" and "sketchy" are verdicts however they are spelled.
 */
function shapeOf(t: TokenReport): string {
  if (t.notAContract) return 'nothing is deployed at this address';
  const parts: string[] = [];

  const code = typeof t.codeBytes === 'number' ? t.codeBytes : undefined;
  if (code !== undefined) {
    parts.push(
      code <= BARE_CODE_BYTES
        ? `${kb(code)} of code, which is about what a plain ERC-20 comes to`
        : `${kb(code)} of code, where a plain ERC-20 is about 2 kB`,
    );
  }

  if (t.ownerRenounced === true) parts.push('ownership renounced');
  else if (t.ownerRenounced === false) parts.push('ownership still held');
  else if (t.owner === undefined) parts.push('no owner function at all');

  parts.push(
    t.proxyImplementation
      ? 'and an implementation slot in use, which makes it a proxy'
      : 'and nothing in either implementation slot i know to look in',
  );

  return parts.join(', ');
}

export function assessToken(t: TokenReport): TokenAssessment {
  const flags: Flag[] = [];
  const mechanisms: Flag[] = [];
  const thresholds: Threshold[] = [];

  if (!t.ok || t.notAContract) {
    return {
      shape: shapeOf(t),
      flags: t.notAContract
        ? [{ id: 'no-code', text: 'there is no contract here to read', weight: 'note' }]
        : [],
      thresholds: [],
      mechanisms: [],
    };
  }

  const w = t.window;

  /* ---------------------------------------------------------------- flags */

  if (typeof t.ownerSharePct === 'number' && t.ownerSharePct >= 1) {
    flags.push({
      id: 'owner-share',
      text: `the owner address holds ${t.ownerSharePct}% of supply`,
      weight: t.ownerSharePct >= 20 ? 'hard' : 'note',
    });
  }
  if (t.proxyImplementation) {
    flags.push({
      id: 'upgradeable',
      text:
        `this is a proxy: the ${t.proxyVia === 'zeppelinos' ? 'older' : 'standard'} ` +
        `implementation slot holds ${short(t.proxyImplementation)}, so the code behind the ` +
        `token can be replaced after you buy it`,
      weight: 'hard',
    });
  }
  if (t.ownerRenounced === false) {
    flags.push({
      id: 'owner-held',
      text: `ownership is still held, by ${t.owner ? short(t.owner) : 'an address'}`,
      weight: 'note',
    });
  }
  if (t.ownerRenounced === true) {
    flags.push({
      id: 'renounced',
      text: 'ownership is renounced, and that cannot be taken back',
      weight: 'note',
    });
  }
  if (t.owner === undefined) {
    flags.push({
      id: 'no-owner-fn',
      text:
        'the contract exposes no owner function, which is not the same as renounced: ' +
        'whatever controls it, if anything, is not standard',
      weight: 'note',
    });
  }
  if (typeof t.codeBytes === 'number' && t.codeBytes > BARE_CODE_BYTES * 2) {
    flags.push({
      id: 'extra-code',
      text:
        `${kb(t.codeBytes)} of code. fees, transfer limits and allow lists all live in that ` +
        `extra, and which of them is in here cannot be told from its size`,
      weight: 'note',
    });
  }
  if (w && typeof w.topActiveSharePct === 'number' && w.topActiveSharePct >= 15) {
    flags.push({
      id: 'concentration',
      text:
        `the largest balance among the ${w.activeAddressesChecked} addresses that moved ` +
        `recently is ${w.topActiveSharePct}% of supply. this is not the largest holder ` +
        `overall, which a node cannot see`,
      weight: 'note',
    });
  }
  if (w && w.senders <= 3 && w.transfers > 0) {
    flags.push({
      id: 'few-hands',
      text: `only ${w.senders} address${w.senders === 1 ? '' : 'es'} sent it in the window`,
      weight: 'note',
    });
  }
  if (w && typeof w.mints === 'number' && w.mints > 0) {
    flags.push({
      id: 'minting',
      text: `${w.mints} mint${w.mints === 1 ? '' : 's'} happened inside the window, so supply grew while you were watching`,
      weight: 'hard',
    });
  }
  if (w && typeof w.burns === 'number' && w.burns > 0) {
    flags.push({
      id: 'burning',
      text: `${w.burns} burn${w.burns === 1 ? '' : 's'} inside the window`,
      weight: 'note',
    });
  }

  /* ----------------------------------------------------------- mechanisms */

  // Can the supply grow under me?
  if (w && typeof w.mints === 'number' && w.mints > 0) {
    mechanisms.push({
      id: 'supply-grew',
      text: 'the supply can grow: it already did inside the window i can see',
      weight: 'hard',
    });
  } else if (t.ownerRenounced === true) {
    mechanisms.push({
      id: 'supply-quiet',
      text:
        'nothing minted in the window and ownership is renounced. that is not proof that ' +
        'nothing can mint, only that nothing did and that the usual hand is gone',
      weight: 'note',
    });
  } else {
    mechanisms.push({
      id: 'supply-unknown',
      text:
        'whether the supply can grow cannot be settled from here: nothing minted in the ' +
        'window, and an owner is still in place',
      weight: 'note',
    });
  }

  // Can the code change under me?
  mechanisms.push(
    t.proxyImplementation
      ? {
          id: 'code-replaceable',
          text: 'the code can be replaced: the standard proxy slot is in use',
          weight: 'hard',
        }
      : {
          id: 'code-slot-empty',
          text:
            'nothing sits in either implementation slot i know to look in. that rules out ' +
            'the two common ways of replacing code and not every other one: a proxy can ' +
            'keep its implementation wherever it likes',
          weight: 'note',
        },
  );

  // Can my transfer be blocked?
  mechanisms.push(
    typeof t.codeBytes === 'number' && t.codeBytes > BARE_CODE_BYTES
      ? {
          id: 'transfer-maybe-blocked',
          text:
            'whether a transfer of yours can be blocked or taxed is not visible from here. ' +
            'there is more code than a plain ERC-20 needs, and what it does is in the code ' +
            'rather than in its size',
          weight: 'note',
        }
      : {
          id: 'transfer-bare',
          text:
            'the contract is about the size of a plain ERC-20, so there is not much room in ' +
            'it for a blacklist. not none. reading the source is the only way to be sure',
          weight: 'note',
        },
  );

  // Can one hand end it?
  if (typeof t.ownerSharePct === 'number' && t.ownerSharePct >= 20) {
    mechanisms.push({
      id: 'one-hand',
      text: `one address holds ${t.ownerSharePct}% of supply, which is enough to end it in one transaction`,
      weight: 'hard',
    });
  }

  /* ----------------------------------------------------------- thresholds */

  // Three scenarios, in the order of how much a change in them would mean.
  // Each one is a figure that stands somewhere today and can be read again
  // tomorrow by the same reader, which is what makes it a threshold rather
  // than a forecast.
  if (t.proxyImplementation) {
    thresholds.push({
      name: 'the implementation behind the proxy',
      now: t.proxyImplementation,
      means:
        'if this address is ever different, the code you read has been replaced and ' +
        'everything else on this page was about the old one',
    });
  }
  if (typeof t.ownerSharePct === 'number' && t.ownerSharePct > 0) {
    thresholds.push({
      name: "the owner's share of supply",
      now: `${t.ownerSharePct}%`,
      means:
        'when this falls, that supply has gone somewhere. it is the largest single hand ' +
        'and the one whose movement precedes most of what people call a rug',
    });
  }
  if (t.ownerRenounced === false && t.owner) {
    thresholds.push({
      name: 'who owns the contract',
      now: t.owner,
      means:
        'ownership moving to another address is a change of who can do whatever the code ' +
        'lets an owner do. renounced to the zero address is the other direction',
    });
  }
  if (w && typeof w.senders === 'number') {
    thresholds.push({
      name: 'how many addresses are still moving it',
      now: `${w.senders} in ${w.blocks} blocks`,
      means:
        'when this falls toward one, the only party still trading it is whoever made it, ' +
        'and an exit needs somebody on the other side',
    });
  }
  if (w && typeof w.topActiveSharePct === 'number') {
    thresholds.push({
      name: 'the largest balance among recent movers',
      now: `${w.topActiveSharePct}% of supply`,
      means:
        'a number that climbs means the float is gathering in fewer hands, and a number ' +
        'that drops means somebody large has been distributing',
    });
  }
  if (typeof t.supply === 'number') {
    thresholds.push({
      name: 'total supply',
      now: t.supply.toLocaleString('en-GB'),
      means: 'if this ever rises, something minted, whatever the contract says it can do',
    });
  }

  return { shape: shapeOf(t), flags, thresholds: thresholds.slice(0, 3), mechanisms };
}

/* ----------------------------------------------------------------- a wallet */

/**
 * The wallet, summarised.
 *
 * Counts and shares only. There is no price feed in this project, so there is
 * no total, no allocation and no "this much of your wallet is in X" — a
 * percentage of a portfolio needs values, and inventing values is worse than
 * having none.
 */
export function assessWallet(
  w: WalletReport,
  deep: { position: Position; token: TokenReport }[],
): WalletAssessment {
  const summary: string[] = [];
  const positions = w.positions || [];
  const held = positions.filter((p) => (p.balance || 0) > 0);

  if (typeof w.positionsFound === 'number' && w.positionsFound > positions.length) {
    summary.push(
      `${w.positionsFound} tokens sit in this wallet. the ${positions.length} the index ranks ` +
        `highest were listed, and the ${deep.length} largest of those ` +
        `${deep.length === 1 ? 'was' : 'were'} opened up`,
    );
  } else if (held.length) {
    summary.push(
      `${held.length} position${held.length === 1 ? '' : 's'} with a live balance` +
        (deep.length
          ? `, of which ${deep.length} ${deep.length === 1 ? 'was' : 'were'} opened up`
          : ''),
    );
  }

  const minted = positions.filter((p) => p.minted).length;
  if (minted) {
    summary.push(
      `${minted} of them arrived straight from the zero address. that is how airdrop dust ` +
        `and bait tokens turn up in a wallet, and it does not mean the holder asked for them`,
    );
  }

  // A wallet holding a large share of a token's whole supply is not a whale;
  // it is holding something very small. Worth saying, because the number looks
  // flattering and means the opposite.
  const dominant = held.filter((p) => (p.sharePct || 0) >= 1);
  if (dominant.length) {
    summary.push(
      `${dominant.length} of these are tokens where this wallet holds 1% or more of the ` +
        `entire supply, which says the token is tiny rather than the wallet is large`,
    );
  }

  const assessments = deep.map(({ position, token }) => ({
    token: position.token,
    symbol: position.symbol,
    assessment: assessToken(token),
  }));

  const replaceable = assessments.filter((a) =>
    a.assessment.mechanisms.some((m) => m.id === 'code-replaceable'),
  );
  if (replaceable.length) {
    summary.push(
      `${replaceable.length} of the ones opened up can have their code replaced: ` +
        replaceable.map((a) => a.symbol || short(a.token)).join(', '),
    );
  }

  const bigOwner = assessments.filter((a) =>
    a.assessment.flags.some((f) => f.id === 'owner-share' && f.weight === 'hard'),
  );
  if (bigOwner.length) {
    summary.push(
      `${bigOwner.length} have an owner address holding a fifth of supply or more: ` +
        bigOwner.map((a) => a.symbol || short(a.token)).join(', '),
    );
  }

  const renounced = assessments.filter((a) =>
    a.assessment.flags.some((f) => f.id === 'renounced'),
  );
  if (renounced.length) {
    summary.push(
      `${renounced.length} have renounced ownership: ` +
        renounced.map((a) => a.symbol || short(a.token)).join(', '),
    );
  }

  if (!positions.length) {
    summary.push('no token position could be read for this address');
  }

  return { summary, tokens: assessments };
}

/* ------------------------------------------------------- lines for the model */

/**
 * The assessment as sentences the keeper may repeat.
 *
 * Same contract as tokenFacts and walletFacts: he may say these and nothing
 * else. Note what is not in here — no instruction to sell, no safety verdict,
 * and no price — because what is not in this list is what he cannot say.
 */
export function assessmentFacts(a: TokenAssessment): string[] {
  const out: string[] = [`the shape of the contract: ${a.shape}`];
  for (const f of a.flags) out.push(`${f.weight === 'hard' ? 'weighs heavily' : 'worth knowing'}: ${f.text}`);
  for (const m of a.mechanisms) out.push(`how a holder could lose it: ${m.text}`);
  a.thresholds.forEach((t, i) => {
    out.push(
      `scenario ${i + 1} — ${t.name}, standing at ${t.now}. ${t.means}`,
    );
  });
  if (!a.thresholds.length) {
    out.push('there was not enough in the reading to set out a single threshold worth watching');
  }
  return out;
}

export function walletAssessmentFacts(a: WalletAssessment): string[] {
  const out = [...a.summary];
  for (const t of a.tokens) {
    out.push(`--- ${t.symbol || short(t.token)} (${t.token}) ---`);
    out.push(...assessmentFacts(t.assessment));
  }
  return out;
}
