# HOLLOWMERE

*the curse never checked out.*

A memecoin site built as a place rather than a landing page. Two rooms rendered
in Blender play as seamless video loops; every object you can touch is outlined
in the world's teal, swaps to its own clip on hover, and opens a panel on click.
All of the usual content — contract, roadmap, press kit, socials — lives inside
that fiction.

Chain: **Robinhood Chain**.

## Stack

- Next.js (App Router) + React 19, TypeScript, one route.
- No CSS framework: hand-written tokens in `app/globals.css`.
- No database and no state on the server. Player progress is a single object in
  `localStorage` under `hollowmere.save`.
- Deploys to Vercel with zero configuration.

## Running it

```bash
npm install
npm run dev
```

Then open http://localhost:3000.

## Environment

| Variable | What it is | Default when unset |
| --- | --- | --- |
| `NEXT_PUBLIC_CONTRACT` | token contract address | address is shown as "not spoken yet" and copy is disabled |
| `NEXT_PUBLIC_CHAIN` | chain name shown on the sigil card | `Robinhood Chain` |
| `NEXT_PUBLIC_EXPLORER` | token page prefix; the address is appended | Blockscout on Robinhood Chain |
| `NEXT_PUBLIC_TICKER` | ticker | `HOLLOW` |
| `NEXT_PUBLIC_SITE_URL` | canonical origin for OG tags | Vercel's production URL |
| `ADMIN_PASSWORD` | the password for the address desk at `/admin` | the desk refuses everything |
| `CHAIN_RPC_URL` | JSON-RPC endpoint; without it no token or wallet can be read | the keeper says the stone is quiet |

Set them in Vercel under *Project → Settings → Environment Variables*. Nothing
else needs to change: the address appears in three places at once — the bottom
bar, the sigil panel and the shareable card — and all three read the same value.

The address itself no longer needs a redeploy to change: the desk at `/admin`
writes it and `/api/config` serves it. See **The address desk** below.

## Deploying

Import `exade09/hollowmere` in Vercel. The repository root is the Next app, so
the framework preset, build command and output directory are all detected — no
configuration to fill in.

Then set the variables. Either paste them in *Project → Settings → Environment
Variables*, or run them from a clone:

```bash
vercel login
vercel link                       # pick the hollowmere project
printf 'Robinhood Chain' | vercel env add NEXT_PUBLIC_CHAIN production
printf 'https://robinhoodchain.blockscout.com/token/' | vercel env add NEXT_PUBLIC_EXPLORER production
printf 'HOLLOW' | vercel env add NEXT_PUBLIC_TICKER production
printf '0x...' | vercel env add NEXT_PUBLIC_CONTRACT production
vercel --prod                     # or just push to main
```

Repeat with `preview` in place of `production` if preview deployments should
show the same values.

Those three chain values are also compiled in as defaults in `lib/content.ts`,
so the site is correct without them; setting them explicitly is worth doing
anyway, because it puts the values somewhere a person can change without
touching code.

`NEXT_PUBLIC_CONTRACT` is deliberately left blank until the token is real. An
address that is almost right is worse than none on a page people copy from, so
while it is empty the bottom bar reads "address not spoken yet" and the copy
button stays disabled.

## The address desk

`/admin` changes the text after **CA:** without a deploy. One field, and it
takes any text: an address, or a word like TBA or SOON, because those are
states this project passes through rather than a separate feature. A value
shaped like an address gets a working copy button and an explorer link; a word
gets neither, which is the only validation worth having here.

The value lands in the store and the site picks it up in the bar, the sigil
panel and the share card at once — all three read `/api/config` through
`lib/useAddress.ts`, which re-reads on tab focus and polls every twenty
seconds. `NEXT_PUBLIC_CONTRACT` stays the fallback, so a deployment that never
opens the desk behaves exactly as it did before the desk existed.

Two things have to be set in Vercel for it to work in production:

```bash
printf '<the password>' | vercel env add ADMIN_PASSWORD production
```

and KV, because a serverless filesystem is read-only: with
`KV_REST_API_URL` and `KV_REST_API_TOKEN` unset the desk writes to
`.agent/settings.json` and the value vanishes on the next cold start. The desk
says so on screen when that is the case rather than letting it be discovered
later. Vercel's KV integration injects both variables; Upstash's own dashboard
calls them `UPSTASH_REDIS_REST_*` and either pair works.

With `ADMIN_PASSWORD` unset the route refuses everything. Default deny is the
only sane behaviour for something that changes which address a page tells
people to buy — and for the same reason the password is server-side only,
compared as two hashes so the comparison leaks neither its length nor the
position of the first wrong character, and rate limited per address.

## Layout

```
app/
  page.tsx            scene switching, panel routing, session bookkeeping
  layout.tsx          fonts, metadata, OG card
  globals.css         design tokens and every component style
  docs/page.tsx       the manual: what he reads and what he will not say
  admin/page.tsx      the address desk
  agent/page.tsx      the review desk, where drafts are approved
  api/config/route.ts the live address, chain and ticker
  api/token/route.ts  reading a token, figures only
  api/wallet/route.ts reading a wallet, positions only
  api/wick/route.ts   speaking to him, the one endpoint that costs money
  api/admin/address/  the desk's gate and its one field
components/
  Stage.tsx           idle video + hover clip + transparent SVG hotzones
  AudioBed.tsx        one looping audio element, fades between tracks
  Chrome.tsx          permanent bottom bar
  Panel.tsx           modal shell with focus handling and escape
  WickChat.tsx        the conversation
  WalletRead.tsx      pasting or connecting a wallet, and the positions table
  AddressDesk.tsx     the admin field
  icons.tsx           the two drawn marks: the account, and the manual
  panels/index.tsx    the eleven widgets
lib/
  scenes.ts           scenes and hotzone rectangles
  content.ts          every readable string in one file
  settings.ts         the one string that changes without a deploy
  useAddress.ts       that string, live, wherever it is shown
  save.ts             localStorage shape and the two derived timers
  agent/token.ts      reading a contract over plain rpc
  agent/wallet.ts     reading a wallet: index first, log discovery second
  agent/chat.ts       who he is, and what he will not say
  agent/sanitize.ts   untrusted text in, and the audit on the way out
public/clips/
  sanctum/ sanctum-21x9/           nine clips each, {1080p,720p,poster}
  undercroft/ undercroft-21x9/     four clips each
public/ui/
  icons/              one low-poly portrait per interactive object
  wick.png            the character, for the mirror and the share card
  panel_stone.png     the faceted slab behind every panel
public/audio/         the four tracks the spheres play
blender/              the scenes and the scripts that generate all of the above
```

## Reading a wallet

`lib/agent/wallet.ts`, behind `/api/wallet`. Two readers, tried in order:

- **the index.** An explorer keeps a row per holder per token, so it can answer
  "everything this address holds" in one request. This is the complete answer.
  Blockscout's v2 shape is what the code speaks; on Robinhood Chain that host
  currently answers a browser and returns 403 to a server, so it is tried,
  cached as shut for ten minutes when it refuses, and never relied on.
- **the logs.** A plain node has no such index. So positions are *discovered*:
  two `eth_getLogs` queries over a window of recent blocks find every Transfer
  with the address as sender or recipient, each log names the token contract it
  came from, and the live balance of each contract found is then read directly.
  Real balances — but only for tokens that moved inside the window.

Which reader answered is on the report and in the sentences the keeper is
given, because the difference between them is the difference between a
portfolio and a sample, and a bag received long ago and never touched since is
invisible to the second one.

Three details worth keeping if this file is ever rewritten, each of them found
by running it against a real address rather than by thinking about it:

- **a share of supply over 100% is not printed.** Spam tokens report a supply
  that does not match the balances they mint; one airdrop came back at five
  thousand trillion percent of its own supply. An impossible number is dropped
  rather than shown.
- **a share that rounds to zero is not zero.** A holder owns more than none, so
  it reads "under 0.01%".
- **code at an address does not make it a contract.** Since EIP-7702 an
  ordinary wallet can carry three bytes of designator and an implementation
  address. The first real wallet tested here was exactly that, and calling it a
  contract would have been a false statement about somebody's wallet.

A third reader sits behind both: the tokens this deployment knows by name —
the project's own contract, always, plus anything in `KNOWN_TOKENS`. It reads
their balances directly, five calls each. It exists because on a young chain
both readers above fail at once as the normal case rather than the unlucky one,
and "do i hold this one, and how much" must not depend on somebody else's index
being awake.

Connecting MetaMask or Rabby only calls `eth_requestAccounts`. Nothing is
signed, no transaction is proposed, and no key is involved: it is a way of
getting forty characters out of an extension, and everything after it is the
same public read as a pasted address. Wallets are found through EIP-6963 so
each extension names itself — with both installed, `window.ethereum` is
whichever won the race to inject, and a button labelled MetaMask would open
Rabby often enough to be a bug.

## What a reading makes possible

`lib/agent/assess.ts` turns a reading into an account of what could happen to
it, and the line it holds is the whole design:

- **it names mechanisms.** Can the supply grow. Can the code be replaced. Can a
  transfer be blocked. Is one address holding enough to end it in a single
  transaction. Each one present, absent, or unknown — with unknown said as
  unknown. That is the honest answer to *is it safe*.
- **it sets three thresholds.** Three figures standing at a known value today,
  each with a sentence about what a change in it would mean: the implementation
  behind a proxy, the owner's share of supply, how many addresses are still
  moving it, total supply. A threshold can be read again tomorrow by the same
  reader that produced it, which is the test that separates it from a forecast.
- **it does not grade.** No score, no safe, no risky, no good to hold, no
  verdict on whether to sell. Two reasons, and the second is load-bearing.
  There is no price feed, no order book and no depth here, so a score built on
  this would be a guess wearing a number's clothes — and the moment the site
  says *safe to hold*, it is answerable for everyone who read that and lost
  money. Mechanisms are durable facts; safety is a forecast.

The keeper's prompt has a section on the exit question, because it is the one
he is asked most and a flat refusal was the wrong answer to it: he gives the
three scenarios and the mechanisms, in full, and declines the number. The audit
in `sanitize.ts` then checks the reply for the three ways that answer drifts
into advice — grading the hold, advising in the first person, and naming a
price to act on — because a rule in a prompt is a request and this one is a
gate.

Two things in the reader feed it, and both were found by running it against a
real contract: the **pre-1967 proxy slot** is read as well as the standard one,
because reading only the standard slot reported USDC as having nothing in its
upgrade slot when its code is in fact replaceable; and `readToken` grew a
`contractOnly` mode, nine calls with no log window, so a dozen positions in a
wallet can each be opened up without spending a minute of somebody's node.

## The manual

`/docs` states what the keeper reads, how he reads it, where the reading is
blind, and what he will never say. It is reached from the bar, from the shelf
in the tower — where it used to be a volume with its pages torn out — and from
the account. It is server-rendered and uncached so the address on it is the
live one.

The keeper runs on **Fable 5.1**. That is `BRAND.model` in `lib/content.ts`, and
the docs page, his character sheet in the mirror, the sigil panel and his own
answer when a visitor asks all read that one string, so they cannot drift
apart.

## The library, and the wallpapers

`/public/wallpapers/full` is the whole feature. Drop an image in and it appears
on the wallpapers shelf of the archive the next time the dev server starts or
the app builds: `scripts/wallpaper-manifest.mjs` writes `lib/wallpapers.ts`
from the folder, so the list cannot disagree with what is on disk and no array
has to be edited by hand. Dimensions are read out of each file's header rather
than assumed, because the grid reserves every tile's aspect ratio before the
image loads and a wrong guess makes the whole grid jump as it fills.

Grid images come from `/public/wallpapers/thumb`, built by
`python scripts/wallpaper-thumbs.py` at 460 px — nineteen full-size renders is
three megabytes to open a panel with, and the tiles are never that wide on
screen. A wallpaper with no thumbnail still shows, using the full image as its
own, so a file added by somebody without Python is not missing, only heavier.

A click opens the full image; the corner of each tile saves it.

## The pastimes

Three small games, at `games` in the panel host, reached from the bar and from
the chest. They used to live inside the map, which is where somebody goes to
look at the places rather than to play something, so most visitors never found
them.

All three are classics and none is a stock classic. The watch is whack-a-mole
played on the sconces that are already in the room. The slab is a sliding
puzzle cut out of our own render of the Sanctum, shuffled by walking the gap
through legal moves so today's board is solvable by construction rather than by
hope. The marks are concentration played with the eight runes the chest is
locked with, so a few rounds teach the alphabet the lock uses — which is why it
is that game and not a snake.

Rules live in `lib/games/*.ts` with no imports, so each one is runnable and
checkable on its own; the components are shells. The third-flip rule in the
marks is the one worth knowing about: turning a card while two wrong ones are
still face up clears those two and then turns the third, so a player who does
not wait is never blocked and never loses the turn they just took. Ignoring the
click until a timer fires is the usual bug in this game and it feels broken on
a slow machine.

Every score is local. There is nowhere to send one and a leaderboard would be a
promise nobody has made.

## The widgets

The panels are cut from the same material as the rooms rather than styled to
look like them. Their plates are chamfered polygons — `clip-path` octagons,
edged by a second layer underneath because a border would be clipped away at
the corners. Their ground is a faceted stone slab rendered in Blender. Every
panel carries a portrait of its own object, rendered from the actual scene
geometry under a shared three-point rig, so the chest in the header is the chest
in the room.

## How the rooms work

Each scene is authored on a fixed **1920×1080** canvas. The idle loop plays
underneath; hovering a zone layers that zone's clip on top, with the poster
frame shown for the few milliseconds the video needs to buffer so there is
never a black flash. Hotzones are `<rect role="button" tabindex="0">` inside one
`<svg viewBox="0 0 1920 1080">`, which gives keyboard and screen-reader support
for free and keeps the coordinates resolution-independent.

Those rectangles are **not hand-placed**. They are exported from the Blender
scenes through their render cameras by `scene/export_hotzones.py`, once per
aspect, so a hotzone sits exactly on top of the object in the video. A zone
carries one label and one action and a rectangle per aspect, so the interaction
logic is identical on both — it never learns that two aspects exist.

Two aspects are authored: **1920×1080** and **2560×1080**. They are the same
picture from the same camera. The wide pass locks the Blender sensor to its
vertical dimension, which freezes the vertical field of view at the 16:9 value
and adds the extra pixels at the sides — nothing is reframed, no keyframe
differs, and the exported hotzone `y` values come out identical across the two.
A window at 2.0:1 or wider gets the wide set.

Within whichever set is chosen, the frame is letterboxed, never cropped. A 16:9
room shown with `object-fit: cover` on a 16:10 laptop loses its left and right
edges — which is both worse to look at and unusable, because that is where the
door and the raven live. `contain` fits the whole room into the ground colour
instead, and a vignette sinks the bars into the frame so they do not read as a
bug.

Opening a widget does not drop the room back to idle: the zone that opened the
panel stays locked on screen underneath it, so the character is still mid-gesture
while you read.

Clips are served at full height above 1280px wide and at 720 height below.
Twenty-six clips across both aspects come to roughly 13 MB.

## What is real and what is a placeholder

Working today: the contract card with copy and explorer link, the archive, the
hold map, the three-ring chest lock, the shareable progress card, the night
tally, the candle that burns down in real time, the rites checklist, the sealed
gate with its key, and travel between both rooms in either direction.

The spheres play four real tracks, credited by name in the panel. They are
copyrighted recordings, so before this goes anywhere public that is a rights
question to settle, not a technical one. Files live in `public/audio` and the
list is `SPHERES` in `lib/content.ts`.

Waiting on content, and marked `TODO` in `lib/content.ts`:

- the founder's note that the chest lock unlocks;
- the Telegram link and the press kit;
- the third location behind the sealed gate.

Every one of those degrades in the world's voice rather than showing an empty
panel, so the site can ship before they land.
