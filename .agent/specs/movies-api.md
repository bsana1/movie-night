# `/api/movies` contract

Implemented in [`functions/api/movies.ts`](../../functions/api/movies.ts).
Consumed only by [`src/lib/reelScoreSearch.ts`](../../src/lib/reelScoreSearch.ts)
— if you change one, check the other.

## Request

`GET /api/movies`

| Param | Required | Format | Notes |
|---|---|---|---|
| `region` | yes | 2-letter uppercase (`^[A-Z]{2}$`) | TMDB watch-region code, e.g. `US` |
| `services` | yes | comma-separated, no duplicates | Only `netflix` and `prime` are valid |
| `minScore` | yes | number, `0`–`10` | Minimum IMDb rating to keep |
| `scanDepth` | no | `40`, `80`, or `150` | Anything else silently falls back to `80` |
| `genreId` | no | TMDB genre ID (integer) | Omit for "any genre" |
| `offset` | no | non-negative integer | Which slice of the ranked candidate pool to rate — see [pagination](#pagination) below |

Any missing/malformed required param → `400 { "error": "invalid-request" }`
before any external call is made.

## Response

**Success — `200`:**

```json
{
  "movies": [
    {
      "title": "Schindler's List",
      "year": "1993",
      "poster": "https://image.tmdb.org/t/p/w342/...jpg",
      "imdbId": "tt0108052",
      "rating": 9.0,
      "service": "netflix"
    }
  ],
  "scannedCount": 36,
  "hasMore": true,
  "totalCandidates": 157
}
```

- `movies` is deduped by `imdbId` and sorted by `rating` descending — but
  only *within this page*. A multi-page caller (see below) must dedupe and
  re-sort across pages itself.
- `scannedCount` is how many candidates actually got a rating lookup on
  *this call* — **not** the same as the requested `scanDepth`, and not even
  monotonic with it (a deeper scan can rate *fewer* candidates per page).
  See [architecture.md](architecture.md#subrequest-budget) for why.
- `totalCandidates` is the full size of the deduped, popularity-ranked
  candidate pool for this `region`/`services`/`genreId`/`scanDepth`
  combination — constant across all pages of the same search.
- `hasMore` is `offset + scannedCount < totalCandidates`. `false` means
  every discovered candidate has now been rated across however many pages
  were fetched.
- Successful responses are cached at the edge for 4 hours, keyed on the full
  request URL including `offset` (so each page caches independently; the
  same page of the same search reuses the cache).

## Pagination

One request can only rate ~30-40 candidates (the 50-subrequest cap — see
[architecture.md](architecture.md#subrequest-budget)). To search more than
that, the caller pages through the same ranked candidate pool by
incrementing `offset` by the previous page's `scannedCount`, until `hasMore`
is `false`. `src/lib/reelScoreSearch.ts` does exactly this
(`MAX_PAGES = 5`), so from the UI's perspective a single "Find movies"
click already is a multi-request search — this endpoint's single-page
response is not, by itself, "the search."

**Errors:**

| Status | Body | Meaning |
|---|---|---|
| `400` | `{ "error": "invalid-request" }` | Bad/missing query params |
| `404` | `{ "error": "no-candidates" }` | TMDB found nothing for that provider/region/genre combo |
| `429` | `{ "error": "omdb-limit" }` | OMDb's own daily quota was hit — not our subrequest limit |
| `502` | `{ "error": "search-failed" }` | Any other failure (TMDB down, subrequest budget exceeded, etc.) |

The frontend (`src/App.tsx`) matches on these exact `error` strings to pick
a user-facing message — if you add a new failure mode, give it its own
string rather than reusing `search-failed`, or the UI will show a generic
message for a specific, actionable problem.
