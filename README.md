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
public/ui/
  icons/              one low-poly portrait per interactive object
  panel_stone.png     the faceted slab behind every panel
blender/              the scenes and the scripts that generate all of the above
```

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
scenes through their render cameras by `scene/export_hotzones.py`, so a hotzone
sits exactly on top of the object in the video.

The frame is always letterboxed, never cropped. A 16:9 room shown with
`object-fit: cover` on a 16:10 laptop loses its left and right edges — which is
both worse to look at and unusable, because that is where the door and the
raven live. `contain` fits the whole room into the ground colour instead, and a
vignette sinks the bars into the frame so they do not read as a bug.

Opening a widget does not drop the room back to idle: the zone that opened the
panel stays locked on screen underneath it, so the character is still mid-gesture
while you read.

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
