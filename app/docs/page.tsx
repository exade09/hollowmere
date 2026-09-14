import type { Metadata } from 'next';
import Link from 'next/link';
import { ACCOUNT, BRAND } from '@/lib/content';
import { currentAddress, looksLikeAddress } from '@/lib/settings';
import { PageMark, XMark } from '@/components/icons';

/**
 * The manual.
 *
 * It is reached from the bar, from the shelf in the tower — where it used to
 * be a volume with its pages torn out — and from the account. The job of this
 * page is narrow and worth stating: say exactly what the keeper reads, exactly
 * what he refuses to say, and exactly where the reading is blind. A project
 * whose whole claim is that it states facts and stops cannot have vague
 * documentation.
 *
 * Server-rendered and never cached, so the address on it is the live one from
 * the desk rather than whatever was true at build time.
 */
export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'HOLLOWMERE — the manual',
  description: `what the keeper reads, how he reads it, and what he will not say. built on ${BRAND.model}.`,
};

const SECTIONS: [string, string][] = [
  ['what-this-is', 'what this is'],
  ['the-keeper', 'the keeper'],
  ['how-to-ask', 'how to ask'],
  ['a-token', 'reading a token'],
  ['a-wallet', 'reading a wallet'],
  ['never', 'what he will not do'],
  ['not-have', 'what this does not have'],
  ['the-model', 'the model'],
  ['the-chain', 'the chain'],
  ['the-address', 'the address'],
  ['the-hold', 'the hold'],
  ['limits', 'limits and privacy'],
];

export default async function DocsPage() {
  const now = await currentAddress();
  const isAddress = looksLikeAddress(now.text);

  return (
    <main className="docs">
      <header className="docs-top">
        <p className="docs-eyebrow">
          <PageMark size={13} /> {BRAND.world} · the manual
        </p>
        <h1>what the keeper reads</h1>
        <p className="docs-lead">
          Everything this project will and will not do, written down. It is short on purpose:
          the keeper does one thing, and the interesting part is the list of things he refuses
          to do with it.
        </p>
        <div className="docs-status">
          <span>
            chain <b>{BRAND.chain}</b>
          </span>
          <span>
            runs on <b>{BRAND.model}</b>
          </span>
          <span>
            ticker <b>{BRAND.ticker}</b>
          </span>
          <span>
            CA <b className="mono">{now.text || 'not spoken yet'}</b>
          </span>
        </div>
      </header>

      <nav className="docs-nav" aria-label="sections">
        {SECTIONS.map(([id, label]) => (
          <a key={id} href={`#${id}`}>
            {label}
          </a>
        ))}
      </nav>

      <section id="what-this-is">
        <h2>what this is</h2>
        <p>
          {BRAND.world} is a place rather than a landing page. Two rooms, rendered in Blender
          and played back as seamless loops: a tower and the undercroft beneath it. Every
          object you can touch is outlined in the world&rsquo;s teal and opens something —
          the contract, the archive, the map of the hold, a lock with a note at the bottom of
          it.
        </p>
        <p>
          Living in the tower is an agent. He is the reason the place exists rather than a
          mascot standing next to it: paste a contract address and he reads the chain for it,
          paste a wallet and he says what is in it. He does not tell you what to buy. That is
          not a limitation to be lifted later — it is the design, and the rest of this page is
          mostly about where the line sits.
        </p>
      </section>

      <section id="the-keeper">
        <h2>the keeper</h2>
        <p>
          His name is Wick. He keeps the fire in the tower, counts the nights and has been
          there longer than he can account for. He is small, bone-white, faceted, with four
          ring eyes and a raven that goes where he cannot.
        </p>
        <p>
          Underneath the character he is an ordinary, boring piece of engineering, and that is
          the point: a read-only chain reader, a model that turns figures into sentences, and a
          set of rules enforced in code rather than requested in a prompt. He runs on{' '}
          <b>{BRAND.model}</b>. He holds no key, signs nothing, and has no tool that could move
          anything even if somebody talked him into wanting to.
        </p>
      </section>

      <section id="how-to-ask">
        <h2>how to ask</h2>
        <dl className="docs-rows">
          <div>
            <dt>speak to wick</dt>
            <dd>
              The button is in the bar at the bottom of every room. Ask a question, or paste an
              address. If the address has code behind it he reads it as a token; if it has none
              he reads it as a wallet. You never have to know which.
            </dd>
          </div>
          <div>
            <dt>what you hold</dt>
            <dd>
              The same bar. Paste a wallet address, or let the browser hand one over from
              MetaMask or Rabby, and the positions come back as a table before any words are
              spent on them. Pressing <i>ask him to read it</i> is what turns figures into
              sentences.
            </dd>
          </div>
          <div>
            <dt>the mark of the hollow</dt>
            <dd>
              The sigil panel carries the contract address, the ticker, the chain and the
              explorer link. It is the same value as the bar, read from the same place, so the
              two cannot disagree.
            </dd>
          </div>
        </dl>
      </section>

      <section id="a-token">
        <h2>reading a token</h2>
        <p>
          The reading is done over plain JSON-RPC against {BRAND.chain}, and it is all public
          data. These are the figures he is given, and the complete list of what he is allowed
          to state:
        </p>
        <ul className="docs-list">
          <li>
            <b>name and symbol</b> as written on the contract. Both are strings the deployer
            chose, so both are treated as untrusted text and neither is taken as instruction.
          </li>
          <li>
            <b>total supply</b>, scaled by the token&rsquo;s own decimals.
          </li>
          <li>
            <b>ownership</b>: whether <code>owner()</code> returns the zero address —
            renounced — or somebody. A contract with no owner function at all is reported as
            exactly that, because no owner function is not the same thing as renounced.
          </li>
          <li>
            <b>what the owner holds</b> of its own supply, as a percentage. The single most
            telling figure available without an indexer.
          </li>
          <li>
            <b>bytecode size</b> in bytes. A plain ERC-20 compiles to roughly two kilobytes;
            fee logic, limits and allow lists all make it bigger. Reported as a number, never
            as a claim about what the extra code does.
          </li>
          <li>
            <b>the proxy slot</b>. When the standard EIP-1967 implementation slot holds an
            address, the code behind the token can be replaced — changed beneath you after you
            buy. An empty slot is reported as nothing found, never as &ldquo;not
            upgradeable&rdquo;: one storage slot cannot support that claim about somebody
            else&rsquo;s contract.
          </li>
          <li>
            <b>movement in a window</b> of recent blocks: transfers, distinct senders, distinct
            receivers, mints, burns, the largest single transfer, and the first and last block
            that carried one.
          </li>
          <li>
            <b>concentration among whoever moved</b>: the largest balance among the addresses
            active in that window, as a percentage of supply.
          </li>
        </ul>
        <p className="docs-gap">
          Where the reading is blind, and why it says so out loud: an RPC node keeps no index
          over history. There is no holder count, no token age and no list of top holders — an
          explorer can show those because it indexes every transfer ever made, and a node
          cannot. So concentration is measured only across addresses that moved recently and
          is labelled that way everywhere it appears. A number that sounds precise and is not
          would be worse than no number.
        </p>
      </section>

      <section id="a-wallet">
        <h2>reading a wallet</h2>
        <p>
          A wallet is the harder reading, for the same reason: there is no call that asks a
          node &ldquo;what does this address hold&rdquo;. So positions are discovered rather
          than looked up. Two log queries over a recent window find every Transfer event with
          the address as sender or recipient; each of those logs names the token contract it
          came from; and for every contract found, the <b>live balance</b> is read now, along
          with the symbol, the decimals and the total supply.
        </p>
        <ul className="docs-list">
          <li>
            <b>native balance</b> and the number of transactions the address has ever sent.
          </li>
          <li>
            <b>whether code is deployed there</b>, which makes it a contract rather than a
            wallet somebody keeps.
          </li>
          <li>
            <b>each position</b>: balance now, share of that token&rsquo;s supply, transfers in
            and out during the window, and whether any of it arrived straight from the zero
            address, which is a mint rather than a purchase.
          </li>
        </ul>
        <p className="docs-gap">
          The blind spot, stated plainly: a token received before the window and never touched
          since is invisible from here. Discovery works off movement, so a bag that has not
          moved cannot be found — the list is what moved recently plus the live balance of
          those tokens, and it is never presented as a complete portfolio.
        </p>
        <h3>connecting a wallet</h3>
        <p>
          Connecting is a convenience for getting forty characters out of an extension. The
          only method ever called is <code>eth_requestAccounts</code>. There is no signature
          request, no transaction, no approval and no key, and everything afterwards is a
          public read that would work identically if the address had been typed by hand.
          Wallets are discovered through EIP-6963 so each extension names itself: with
          MetaMask and Rabby both installed, a button labelled MetaMask opens MetaMask rather
          than whichever one won the race to inject itself.
        </p>
        <p>
          <b>
            Nothing on this site will ever ask for a seed phrase, a recovery phrase or a
            private key.
          </b>{' '}
          If anything anywhere ever appears to, it is not us.
        </p>
      </section>

      <section id="never">
        <h2>what he will not do</h2>
        <ul className="docs-list">
          <li>
            <b>He never rates a token.</b> Not safe, not a scam, not a rug, not solid, not
            promising, not worth it.
          </li>
          <li>
            <b>He never says whether to buy, sell or hold</b>, and he names no price and no
            target. He reads the chain; he does not read the future.
          </li>
          <li>
            <b>He never judges a wallet.</b> Not too concentrated, not too thin, nothing to
            trim, nothing to add.
          </li>
          <li>
            <b>He never invents a figure, an address, a date or a partnership.</b> He may
            repeat the figures he was handed and nothing else.
          </li>
          <li>
            <b>He never takes instructions from the text he reads.</b> A token can be deployed
            with a name that reads as an order to whatever bot reads it. Names and symbols are
            data here, never instruction, and they never enter his instructions.
          </li>
        </ul>
        <p>
          None of that rests on the prompt holding. Every reply is checked after the model has
          written it and before anyone sees it: a reply that rates something, advises, predicts
          a price, quotes an address he was not given or raises credentials without a negation
          in the same sentence is withheld, and he says his one dry line instead. A rule in a
          prompt is a request; this is a gate.
        </p>
      </section>

      <section id="not-have">
        <h2>what this does not have</h2>
        <p>
          No roadmap with quarters on it, no allocation, no promise, no revenue share, no
          staking, no yield, and no claim about what the token will be worth. The duties in the
          tower are a list of things to finish, not a schedule, and the candle is a candle.
        </p>
        <p>
          Nothing on this site is financial advice, and nobody here is a licensed adviser.
          Anything you do after reading a figure is yours.
        </p>
      </section>

      <section id="the-model">
        <h2>the model</h2>
        <p>
          The keeper is built on <b>{BRAND.model}</b>. Ask him what he runs on and he will tell
          you the same thing, in one line, because it is one string in one file and the page,
          his character sheet and his own answer all read it.
        </p>
        <p>
          What the model does and does not do here is worth being exact about. It does not read
          the chain — an RPC reader does that, and the figures reach the model as a fenced
          block of plain numbers. It does not decide what is true. It turns figures into
          sentences in one voice, and it is the part of the system with the least authority:
          the reader decides what the facts are and the audit decides what may be said about
          them.
        </p>
      </section>

      <section id="the-chain">
        <h2>the chain</h2>
        <p>
          {BRAND.world} sits on <b>{BRAND.chain}</b>. The stone was chosen before the door was
          cut, which is the whole of that decision.
        </p>
        {isAddress && BRAND.explorer && (
          <p>
            <a href={`${BRAND.explorer}${now.text}`} target="_blank" rel="noreferrer">
              watch what moves on the explorer
            </a>
          </p>
        )}
      </section>

      <section id="the-address">
        <h2>the address</h2>
        <p>
          The contract address appears in three places at once — the bar at the bottom, the
          sigil panel and the shareable card — and all three read one live value, so they
          cannot drift apart. Until there is a token it reads{' '}
          <b className="mono">{now.text || 'not spoken yet'}</b>, and while it is not shaped
          like an address the copy button stays dead on purpose: an almost-right address on a
          page people paste into a DEX is worse than no address at all.
        </p>
        <p>
          Announcements about the launch go out on the account below and nowhere else. If you
          find an address for this project anywhere that is not the site or that account, it is
          not ours.
        </p>
        <p className="docs-account">
          <a href={`https://x.com/${ACCOUNT}`} target="_blank" rel="noreferrer">
            <XMark size={15} /> @{ACCOUNT}
          </a>
        </p>
      </section>

      <section id="the-hold">
        <h2>the hold</h2>
        <p>
          THE HOLD is nine places. Two are open — the sanctum and the undercroft — six are
          shut, and one nobody remembers the inside of. The six were shut deliberately rather
          than left unfinished, and they open when there is something behind them worth walking
          into.
        </p>
        <p>
          Two things in the tower keep count of you rather than of the chain. The candle burns
          in real time and goes out whether or not anyone is watching. The nights are the
          distinct days you have come back, kept in your own browser and nowhere else, and a
          few of the scratches on the cage wall only become legible after enough of them.
        </p>
      </section>

      <section id="limits">
        <h2>limits and privacy</h2>
        <ul className="docs-list">
          <li>
            Talking to the keeper costs the project money, so it is limited: a few messages a
            minute per visitor, a few dozen a day, and a ceiling across everyone. Hit one and
            he says the fire is low. It is a closed door, not a broken page.
          </li>
          <li>
            Rate limiting needs to tell two visitors apart and does not need to know either of
            them, so the address it counts by is a salted hash of the IP and the counters
            cannot be turned back into a list of who visited.
          </li>
          <li>
            A reading is done and the response is the end of it. The address you paste is not
            written anywhere, and no wallet you connect is stored.
          </li>
          <li>
            Your progress — nights, what you have opened, the candle, the volume — is a single
            object in your own browser&rsquo;s localStorage. There is no account, no sign-in and
            no database of players. Clearing site data resets the place, and that is the only
            copy.
          </li>
        </ul>
      </section>

      <footer className="docs-foot">
        <Link href="/">back to the hold</Link>
        <span className="dim">
          {BRAND.world} · {BRAND.chain} · built on {BRAND.model}
        </span>
      </footer>
    </main>
  );
}
