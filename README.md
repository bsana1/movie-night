# Reel Score

**Movie night, minus the scrolling.**

Reel Score scans what's currently streaming on Netflix and Prime Video, cross-references each title's live IMDb rating, and hands you a short list worth actually watching — filterable by minimum score, genre, and region.

**Live demo:** [movie-night-btn.pages.dev](https://movie-night-btn.pages.dev)

## Features

- Scans Netflix and/or Prime Video catalogs for a given region
- Filters by minimum IMDb rating, genre, and how many titles to scan
- "Pick for us" for when the list itself is too much of a decision
- Tracks watched titles locally so they drop out of future results
- Deep-links out to IMDb and the streaming service to actually watch

## How it works

The frontend is a static React (Vite) app. It never talks to TMDB or OMDb directly — instead it calls a same-origin `/api/movies` endpoint, implemented as a [Cloudflare Pages Function](functions/api/movies.ts). That function runs server-side at the edge, holds the API keys as secrets, and does the actual work:

```
Browser (React app)
   │  GET /api/movies?region=US&services=netflix,prime&minScore=7&scanDepth=80
   ▼
Cloudflare Pages Function (functions/api/movies.ts)
   │
   ├─▶ TMDB API   — resolve streaming providers, discover candidate movies, fetch IMDb IDs
   └─▶ OMDb API   — fetch each candidate's live IMDb rating
   │
   ▼
JSON response, filtered + sorted, cached at the edge for 4 hours
```

Because the Function runs on Cloudflare's free plan, it's capped at 50 outbound requests per invocation — the code dedupes and ranks candidates by popularity before spending that budget on rating lookups, so it stays well under the limit no matter how many titles are scanned.

## Tech stack

| Layer | Choice |
|---|---|
| UI | React 19 + TypeScript, Vite |
| API | Cloudflare Pages Functions (TypeScript, edge runtime) |
| Data | [TMDB](https://www.themoviedb.org/) (catalog/providers), [OMDb](https://www.omdbapi.com/) (IMDb ratings) |
| Hosting | Cloudflare Pages (free tier, auto-deploys on push to `main`) |
| Persistence | `localStorage` only — no database |

## Project layout

```text
src/
  components/     Presentational React components
  hooks/          State + localStorage-backed hooks (config, watched list)
  lib/            API client for the /api/movies endpoint
  types/          Shared TypeScript types
functions/api/    Cloudflare Pages Function — the server-side API
.dev.vars.example Template for local secrets (copy to .dev.vars, never commit it)
```

## Running it locally

### Frontend only

```bash
npm install
npm run dev
```

This runs the UI against Vite's dev server. Movie search won't work yet — that needs the API function running too, which requires the two secrets below.

### Full stack (frontend + API)

1. Get free API keys from [TMDB](https://www.themoviedb.org/settings/api) and [OMDb](https://www.omdbapi.com/apikey.aspx).
2. Copy `.dev.vars.example` to `.dev.vars` and fill in your keys. `.dev.vars` is git-ignored — never commit real keys.
3. Build and run through Wrangler, which emulates the Cloudflare Pages runtime (including the Function):

   ```bash
   npm run pages:dev
   ```

4. Open the printed `localhost` URL.

## Deploying your own copy (free)

1. Push this repo to your own GitHub account.
2. In Cloudflare: **Workers & Pages → Create application → Pages → Connect to Git**, and select the repo.
3. Set build command to `npm run build` and build output directory to `dist`.
4. Under **Settings → Environment Variables**, add `TMDB_API_KEY` and `OMDB_API_KEY`.
5. Deploy — every future push to `main` redeploys automatically.

OMDb's free tier has its own daily request quota; the API returns a clear `omdb-limit` error if it's reached, which the UI surfaces instead of failing silently.

## License

MIT
