# Deployment

## Where it's hosted

- **Platform:** Cloudflare Pages, free tier.
- **Live URL:** https://movie-night-btn.pages.dev
- **Cloudflare project name:** `movie-night`
- **Git source:** GitHub repo `bsana1/movie-night`, production branch `main`.
- **Trigger:** automatic — any push to `main` builds and redeploys. There is
  no manual deploy step and no staging environment.

## Build config (set in the Cloudflare dashboard, not in this repo)

| Setting | Value |
|---|---|
| Build command | `npm run build` |
| Build output directory | `dist` |
| Root directory | (repo root) |

`npm run build` runs `tsc -b && tsc -p tsconfig.functions.json && vite build`
— it type-checks both the app and the Functions before Vite bundles the
static site. `functions/` is picked up separately by Cloudflare's Pages
build system based on its file path; it isn't part of the Vite build.

## Secrets

`TMDB_API_KEY` and `OMDB_API_KEY` are set as environment variables in the
Cloudflare Pages project settings (**Settings → Environment Variables**),
not in this repo. `functions/api/movies.ts` reads them from `env` at
request time. Locally, the same two variables come from a git-ignored
`.dev.vars` file (see `.dev.vars.example` for the format).

There is currently one shared value for both Production and Preview
environments — if a Preview-only key is ever needed, Cloudflare supports
setting environment-scoped values separately.

## Accounts

Both the GitHub (`bsana1`) and Cloudflare accounts used for this project
were newly created during initial deployment, tied to
`bernardo_sana@hotmail.com`. Cloudflare login was done via "Continue with
GitHub" OAuth, so the two accounts are linked — there's no separate
Cloudflare password to manage.

## Known constraint

Free-plan Cloudflare Workers cap each Function invocation at 50 outbound
subrequests. `functions/api/movies.ts` is written to stay under that; see
[architecture.md](architecture.md#subrequest-budget) before changing how
many external calls it makes per request. This only shows up in production
— `wrangler pages dev` does not enforce it locally.

## If something needs to change here

- **Rotating an API key:** update it in the Cloudflare dashboard env vars;
  no code or deploy change needed, takes effect on the next request.
- **Custom domain:** add it under the Pages project's **Custom domains**
  tab; DNS is likely already on Cloudflare if the domain was registered
  there, otherwise it needs a CNAME.
- **Rolling back a bad deploy:** the Cloudflare dashboard's **Deployments**
  tab lists every past deploy with a "Rollback to this deployment" action —
  faster than a git revert when the app is actively broken.
