# Architecture

## Shape of the system

Two deployables, one Cloudflare Pages project, no database:

```
src/                React SPA (Vite build → static files)
functions/api/      Cloudflare Pages Function (serverless, edge)
```

Both are built and deployed together by Cloudflare Pages on every push to
`main`. There is no separate backend host, no origin server, and no
persistence layer beyond the browser's `localStorage` (search config and
watched-movie list — see `src/hooks/`).

## Request flow

```
Browser (React app, static)
   │  GET /api/movies?region=US&services=netflix,prime&minScore=7&scanDepth=80
   ▼
functions/api/movies.ts   (runs server-side, per-request, at the edge)
   │
   ├─▶ TMDB  GET /watch/providers/movie          — resolve provider IDs for the requested services
   ├─▶ TMDB  GET /discover/movie (paged)         — candidate movies per provider
   └─▶ OMDb  GET /?t={title}&y={year}            — IMDb id + rating, per candidate, in one call
   │
   ▼
JSON { movies, scannedCount }, cached at the edge (`s-maxage=14400`, 4h)
```

The frontend never talks to TMDB or OMDb directly — both API keys are
Cloudflare Pages secrets, injected into `env` at request time, and never
shipped to the browser. See [deployment.md](deployment.md) for where those
secrets actually live.

## Subrequest budget

Cloudflare Workers on the free plan cap each invocation at **50 outbound
subrequests**. This is the single sharpest constraint on this codebase and
has already caused a production outage once (every request 502'd — see git
history around the "Cap IMDb rating lookups" commit).

The cost per search request:

| Call | Count |
|---|---|
| `getProviderIds` | 1, regardless of how many services are requested |
| `discover` (per service) | `ceil(scanDepth / 20)` pages |
| `getOmdbMatch` | 1 per candidate actually rated (title+year lookup, returns both the IMDb id and rating) |

`scanDepth` (40, 80, or 150, chosen in the UI) controls how many titles TMDB
*discovers*, not how many get rated. `functions/api/movies.ts` dedupes the
discovered candidates, sorts by TMDB popularity, and spends whatever's left
of `SUBREQUEST_BUDGET` (45, leaving a margin below the real 50 cap) after
the discovery calls on rating lookups for the top of that list:

```
maxRatingLookups = SUBREQUEST_BUDGET - 1 (providers) - discoverCalls
```

This is a real trade-off, not just a formality: a deeper `scanDepth` spends
more of the budget on *discovery* (casting a wider net over less-popular
titles) and leaves *fewer* slots for rating checks, so "150 — thorough" can
return fewer results than "80 — balanced" despite exploring more of the
catalog. Both settings are dominated by page-1-most-popular candidates
either way, since popularity sort means the top of the merged candidate
list barely changes across scan depths. If this trade-off ever needs to
favor result count over catalog breadth, the fix is decoupling "how much to
discover" from "how much to rate" rather than tying both to `scanDepth`.

Switching the OMDb lookup from `i={imdbId}` (requiring a separate TMDB
`external_ids` call first) to `t={title}&y={year}` cut the per-candidate
cost from 2 subrequests to 1, roughly doubling `maxRatingLookups` for the
same budget. Trade-off: title+year matching can occasionally miss a real
match that ID-based lookup wouldn't (e.g. a release-year discrepancy
between TMDB and OMDb) — treated the same as any other unmatched candidate
(silently excluded, not an error).

**Important:** this limit is invisible locally. `wrangler pages dev` does
not enforce it, so a change that blows the budget will pass local testing
and only fail once deployed. If you touch the fetch count in this file,
test against the deployed URL, not just `pages:dev`, before calling it done.

## Why Cloudflare Pages specifically

The app needs a place to run server-side code (to keep API keys off the
client) alongside static hosting, for free. Cloudflare Pages Functions
match that need directly — GitHub Pages was considered and rejected because
it's static-only and can't run `functions/api/movies.ts` at all.
