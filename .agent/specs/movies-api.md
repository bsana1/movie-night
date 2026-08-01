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
  "scannedCount": 18
}
```

- `movies` is deduped by `imdbId` and sorted by `rating` descending.
- `scannedCount` is how many candidates actually got a rating lookup —
  **not** the same as the requested `scanDepth`, and not even monotonic
  with it (a deeper scan can rate *fewer* candidates). See
  [architecture.md](architecture.md#subrequest-budget) for why.
- Successful responses are cached at the edge for 4 hours, keyed on the full
  request URL (so identical filters reuse the cache; any different filter
  combination is a fresh request).

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
