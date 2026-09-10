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

Set them in Vercel under *Project → Settings → Environment Variables*. Nothing
else needs to change: the address appears in three places at once — the bottom
bar, the sigil panel and the shareable card — and all three read the same value.

When the address needs to change without a redeploy, wire
[Vercel Edge Config](https://vercel.com/docs/edge-config) into
`app/api/config/route.ts`. The front end already reads from that endpoint's
shape, so nothing above it has to move.

## Layout

```
app/
  page.tsx            scene switching, panel routing, session bookkeeping
  layout.tsx          fonts, metadata, OG card
  globals.css         design tokens and every component style
  api/config/route.ts contract and chain, so they can move without a rebuild
components/
  Stage.tsx           idle video + hover clip + transparent SVG hotzones
  Chrome.tsx          permanent bottom bar
  Panel.tsx           modal shell with focus handling and escape
  panels/index.tsx    the ten widgets
lib/
  scenes.ts           scenes and hotzone rectangles
  content.ts          every readable string in one file
  save.ts             localStorage shape and the two derived timers
public/clips/
  sanctum/{1080p,720p,poster}/     nine clips
  undercroft/{1080p,720p,poster}/  four clips
```

## How the rooms work

Each scene is authored on a fixed **1920×1080** canvas. The idle loop plays
underneath; hovering a zone layers that zone's clip on top, with the poster
frame shown for the few milliseconds the video needs to buffer so there is
never a black flash. Hotzones are `<rect role="button" tabindex="0">` inside one
`<svg viewBox="0 0 1920 1080">`, which gives keyboard and screen-reader support
for free and keeps the coordinates resolution-independent.

Those rectangles are **not hand-placed**. They are exported from the Blender
scenes through their render cameras by `scene/export_hotzones.py`, so a hotzone
sits exactly on top of the object in the video.

On a viewport narrower than about 4:3, `object-fit` switches from `cover` to
`contain` and the SVG's `preserveAspectRatio` follows, so a phone in portrait
sees the whole room instead of losing the door and the raven off the sides.

Clips are served at 1080p above 1280px wide and 720p below. Total media weight
is under 12 MB for thirteen clips.

## What is real and what is a placeholder

Working today: the contract card with copy and explorer link, the archive, the
hold map, the three-ring chest lock, the shareable progress card, the night
tally, the candle that burns down in real time, the rites checklist, the sealed
gate with its key, and travel between both rooms in either direction.

Waiting on content, and marked `TODO` in `lib/content.ts`:

- the founder's note that the chest lock unlocks;
- the ambient loops for the spheres;
- the real social links and the press kit;
- the third location behind the sealed gate.

Every one of those degrades in the world's voice rather than showing an empty
panel, so the site can ship before they land.
