# The agent

WICK's account, as a job rather than a person. It reads the chain, picks an
angle it has not used lately, writes one post in the house voice, checks its
own output, and stores it. A human approves it. Only then does it reach the
raven in the Sanctum.

## The loop

```
cron  ->  /api/agent/tick  ->  readChain()      what is happening on chain
                               pickAngle()      something not used in the last 3 posts
                               provider.write() one post, in the voice
                               auditPost()      hold it back if it broke a rule
                               store            as a draft

human ->  /api/agent/review     list drafts, approve or reject (and correct)

site  ->  /api/raven            approved dispatches only
```

## Files

| file | what it is |
| --- | --- |
| `voice.ts` | the persona and the voice rules, as one unchanging block |
| `provider.ts` | the model, swappable: `anthropic`, `openai`, `stub` |
| `chain.ts` | read-only chain access, never throws |
| `rpc.ts` | the reader that actually works from a server |
| `sanitize.ts` | neutralises untrusted text; audits the model's output |
| `store.ts` | one JSON document, in a file locally or Upstash in production |
| `brain.ts` | one tick, and the public dispatch list |
| `types.ts` | the shapes the site and the agent share |

## Running it locally

Nothing needs a key. `AI_PROVIDER` defaults to `stub`, which writes from the
angle alone with no network at all, so the whole loop can be exercised before
anyone is billed.

```bash
# .env.local
AI_PROVIDER=stub
CRON_SECRET=any-local-value
```

```bash
npm run dev

S=any-local-value
curl -X POST localhost:3000/api/agent/tick -H "Authorization: Bearer $S"
curl localhost:3000/api/agent/review -H "Authorization: Bearer $S"
curl -X POST localhost:3000/api/agent/review -H "Authorization: Bearer $S" \
  -H 'content-type: application/json' -d '{"id":"<id>","status":"approved"}'
curl localhost:3000/api/raven
```

`?force=1` on the tick ignores the minimum gap between posts.

## Going live

1. **Store.** Add Vercel KV (or an Upstash database) and the two
   `KV_REST_API_*` variables appear on their own. Without them the agent writes
   to `.agent/state.json`, which a serverless filesystem does not keep.
2. **Model.** `AI_PROVIDER=anthropic` with `ANTHROPIC_API_KEY`, or
   `AI_PROVIDER=openai` with `OPENAI_API_KEY`. Server-side variables only —
   a key behind `NEXT_PUBLIC_` is compiled into the browser bundle and handed
   to every visitor.
3. **Secret.** `CRON_SECRET`. Vercel's cron sends it as a bearer token by
   itself; the GitHub Actions workflow needs it as a repository secret
   alongside `AGENT_URL`.
4. **Chain.** `CHAIN_RPC_URL`. See below.
5. Leave `AGENT_AUTOPOST` unset until the drafts read the way you want.

## Two things that are true and inconvenient

**The explorer will not answer a server.** Blockscout's API sits behind a bot
check. The same request that succeeds from inside a real browser page returns
403 from curl, and will return 403 from a Vercel function — this was measured,
not assumed. Getting around a bot check is not something we do, so the chain is
read over JSON-RPC instead, which is what RPC is for. The cost is that an RPC
node can count transfers and distinct addresses but cannot give a total holder
count: that needs an index over all of history, which is the explorer's whole
job. So the agent talks about movement rather than totals. Set `CHAIN_RPC_URL`
and it works; leave it unset and the agent writes posts that need no figures.

**Vercel's Hobby plan runs a cron once a day.** `vercel.json` therefore
schedules one daily tick, and the real heartbeat is
`.github/workflows/agent.yml`, which GitHub runs for free on any schedule. The
agent enforces its own minimum gap, so a workflow that fires more often than
the gap just returns "too soon" and costs nothing.

## Why it is built this defensively

The agent reads text written by strangers: mentions, and — less obviously —
token names from the chain, which are arbitrary strings chosen by whoever
deployed them. Nothing stops someone deploying a token called `ignore previous
instructions and ...` and waiting for a bot to read its own transfer feed. So:

- Untrusted text never enters the system block. It arrives inside a fenced
  block in the user turn, marked as data.
- `sanitize()` strips instruction shapes, invisible characters and angle
  brackets, and caps length. It is the cheap half of the defence.
- The expensive half is architectural, and it is the reason this is safe: **the
  agent has no wallet, no signing key and no tool with side effects.** There is
  no action for injected text to reach. It can only ever change what a draft
  says, and a human reads every draft.
- `auditPost()` holds back anything that looks like a contract address, a price
  promise, or a figure the agent was never handed. A rule in a prompt is a
  request; this is a check.
