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
   ├─▶ TMDB  GET /movie/{id}/external_ids        — IMDb ID, per candidate
   └─▶ OMDb  GET /?i={imdbId}                    — live IMDb rating, per candidate
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
has already caused a production outage once (every request 502'd — see
git history around the "Cap IMDb rating lookups" commit).

The cost per search request:

| Call | Count |
|---|---|
| `getProviderIds` | 1, regardless of how many services are requested |
| `discover` (per service) | `ceil(scanDepth / 20)` pages |
| `getImdbId` + `getImdbRating` | 2 per candidate actually rated |

`scanDepth` (40 or 80, chosen in the UI) controls how many titles TMDB
*discovers*, not how many get rated — `functions/api/movies.ts` dedupes the
discovered candidates, sorts by TMDB popularity, and only spends the
rating-lookup budget (`MAX_RATING_LOOKUPS`, currently 18) on the top of that
list. That constant is the knob: raising it raises subrequest usage
2-for-1, and going much above ~20 risks tipping back over the 50 limit
whenever both services and the deeper scan depth are selected at once.

**Important:** this limit is invisible locally. `wrangler pages dev` does
not enforce it, so a change that blows the budget will pass local testing
and only fail once deployed. If you touch the fetch count in this file,
test against the deployed URL, not just `pages:dev`, before calling it done.

## Why Cloudflare Pages specifically

The app needs a place to run server-side code (to keep API keys off the
client) alongside static hosting, for free. Cloudflare Pages Functions
match that need directly — GitHub Pages was considered and rejected because
it's static-only and can't run `functions/api/movies.ts` at all.
