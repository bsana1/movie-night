# Coding style

Conventions this repo actually follows today. When in doubt, match the
surrounding code over this doc — then fix this doc.

## General

- TypeScript everywhere, `strict` mode. No `any` — if a type is genuinely
  unknown, narrow it (see `functions/api/movies.ts`'s TMDB/OMDb response
  handling for the pattern).
- No semicolons, single quotes, 2-space indent. There's no Prettier config
  yet — match the file you're editing exactly.
- Named exports for components, hooks, and utilities. `export default` is
  reserved for `App`, since that's what Vite's entry point expects.
- No comments unless they explain a *why* that isn't obvious from the code
  (a platform constraint, a workaround, a non-obvious invariant). Don't
  narrate *what* the code does — the code already says that.
- No premature abstraction. Three similar lines beat a generic helper built
  for a fourth caller that doesn't exist yet.

## React (`src/`)

- Function components only, no classes.
- State that needs to survive a reload lives in `localStorage`, wrapped in a
  hook (`hooks/useReelScoreConfig.ts`, `hooks/useWatchedMovies.ts`) — never
  read/write `localStorage` directly from a component.
- Every `localStorage` read/write is wrapped in `try {} catch { /* ... */ }`
  — private browsing and full storage both throw, and neither should crash
  the app.
- Components are presentational: they take data and callbacks as props, and
  don't know where the data came from. `App.tsx` is the only place that
  wires hooks to components.
- Shared types live in `src/types/`, not inline in the component that
  happens to use them first — `lib/`, `hooks/`, and `components/` all need
  to agree on the same shape.
- Network calls go through `src/lib/` (currently `reelScoreSearch.ts`).
  Components and hooks call the lib function; they don't call `fetch`
  directly.

## Cloudflare Pages Function (`functions/api/`)

- One `onRequestGet` (or `onRequestPost`, etc.) per file, matching
  Cloudflare's file-based routing. Keep request parsing, validation, and the
  actual work in the same file unless it's genuinely reused elsewhere.
- Validate all query params before doing any work; return a `4xx` JSON error
  (`{ error: string }`) immediately on bad input rather than letting it fail
  downstream.
- Secrets (`env.TMDB_API_KEY`, `env.OMDB_API_KEY`) only ever exist in
  `env`, sourced from `.dev.vars` locally or Cloudflare's dashboard in
  production. Never hardcode a key, and never forward one to the client.
- Mind the subrequest budget — see
  [specs/architecture.md](specs/architecture.md#subrequest-budget) before
  adding another external call per candidate.
- Cache successful, deterministic responses at the edge
  (`caches.default`); never cache an error response.

## Linting

`npm run lint` runs `oxlint` with `react/rules-of-hooks` and
`react/only-export-components` enforced. It should stay at zero warnings —
treat a new warning as a bug to fix, not a rule to disable.
