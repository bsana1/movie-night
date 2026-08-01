---
name: debug-edge-function-failure
description: Diagnose a /api/movies failure that only happens in production, not in local wrangler pages dev
---

# Debugging a production-only Function failure

`functions/api/movies.ts` catches every internal error and returns a generic
`{ "error": "search-failed" }` (see [specs/movies-api.md](../specs/movies-api.md)).
That's correct for end users but useless for debugging — the real error
(TMDB down, OMDb quota, subrequest limit, a bad response shape) is thrown
away. `wrangler pages dev` also doesn't reproduce every constraint of the
real edge runtime (notably the 50-subrequest cap — see
[specs/architecture.md](../specs/architecture.md#subrequest-budget)), so a
bug can pass local testing and only appear once deployed.

## Steps

1. **Confirm it's actually server-side.** Hit the deployed endpoint directly
   with `curl`, bypassing the UI:

   ```bash
   curl -s "https://movie-night-btn.pages.dev/api/movies?region=US&services=netflix&minScore=7&scanDepth=40"
   ```

   A `5xx` with `{"error":"search-failed"}` confirms the Function itself is
   throwing, not a frontend bug.

2. **Temporarily surface the real error.** In the `catch` block at the
   bottom of `onRequestGet`, add the caught error's message to the response:

   ```ts
   return json({ error: 'search-failed', debug: error instanceof Error ? error.message : String(error) }, 502)
   ```

3. **Commit, push, and poll for the new deploy** (auto-deploy on `main`
   means there's no manual deploy step — just wait for it):

   ```bash
   until curl -s "https://movie-night-btn.pages.dev/api/movies?region=US&services=netflix&minScore=7&scanDepth=40" | grep -qv "debug.*Too many subrequests\|<old error text you're replacing>"; do sleep 5; done
   ```

   Simpler in practice: poll in a loop and eyeball the output once it
   changes from whatever the stale error was.

4. **Read the `debug` field** — it's the actual thrown error message. Past
   causes found this way:
   - `"Too many subrequests by single Worker invocation"` → the 50-subrequest
     cap, see the architecture doc above.
   - `omdb-limit` surfaces correctly already (handled explicitly in the
     `catch` block) — if you see this, it's OMDb's daily quota, not a bug.

5. **Fix the real cause, then remove the `debug` field** before committing
   the fix — it's a diagnostic aid, not something that belongs in the
   permanent API contract (see [specs/movies-api.md](../specs/movies-api.md)
   for the documented error shape).

## Why not `wrangler pages deployment tail` for live logs

Worth trying first if you have Cloudflare CLI access from the same machine
you're deploying from — `wrangler login` then `wrangler pages deployment
tail` gives real-time logs without needing to redeploy at all. It wasn't
usable in the original debugging session because the browser used to
complete the OAuth login couldn't reach the deploying machine's
`localhost` callback (sandboxed browser, separate network namespace). If
your environment doesn't have that split, prefer log tailing over the
redeploy-and-poll approach above — it's faster and doesn't require shipping
a temporary debug commit.
