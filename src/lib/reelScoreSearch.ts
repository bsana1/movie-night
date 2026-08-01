import type { ReelScoreMovie, StreamingService } from '../types/reelScore'

export interface SearchParams {
  region: string
  minScore: number
  genreId?: number
  services: StreamingService[]
  scanDepth: number
  onStatus?: (message: string) => void
}

export interface SearchResult {
  movies: ReelScoreMovie[]
  scannedCount: number
}

interface ApiPage {
  movies: ReelScoreMovie[]
  scannedCount: number
  hasMore: boolean
  totalCandidates: number
}

// Each request is its own Cloudflare Worker invocation with its own fresh
// subrequest budget, so paging across a few of them is how a single search
// covers far more candidates than the ~30-40 one request can rate on its
// own. Capped so a search can't run away — see .agent/specs/architecture.md.
const MAX_PAGES = 5

async function fetchPage(
  params: Omit<SearchParams, 'onStatus'>,
  offset: number,
): Promise<ApiPage> {
  const { region, minScore, genreId, services, scanDepth } = params
  const query = new URLSearchParams({
    region,
    minScore: String(minScore),
    services: services.join(','),
    scanDepth: String(scanDepth),
    offset: String(offset),
  })
  if (genreId) query.set('genreId', String(genreId))

  const response = await fetch(`/api/movies?${query.toString()}`)
  const payload = (await response.json()) as ApiPage | { error?: string }

  if (!response.ok) {
    throw new Error('error' in payload ? payload.error : 'search-failed')
  }
  if (!('movies' in payload && 'scannedCount' in payload)) {
    throw new Error('search-failed')
  }
  return payload
}

export async function runReelScoreSearch(
  params: SearchParams,
): Promise<SearchResult> {
  const { onStatus, ...pageParams } = params

  const movies: ReelScoreMovie[] = []
  let offset = 0
  let scannedCount = 0
  let totalCandidates = 0

  for (let page = 0; page < MAX_PAGES; page++) {
    onStatus?.(
      page === 0
        ? "Looking up what's streaming…"
        : `Checked ${scannedCount} of ~${totalCandidates} titles, still looking…`,
    )

    let result: ApiPage
    try {
      result = await fetchPage(pageParams, offset)
    } catch (error) {
      if (page === 0) throw error
      break // later page failed (e.g. omdb-limit) — keep what we already found
    }

    movies.push(...result.movies)
    scannedCount += result.scannedCount
    totalCandidates = result.totalCandidates
    offset += result.scannedCount

    if (!result.hasMore || result.scannedCount === 0) break
  }

  const seen = new Set<string>()
  const deduped = movies
    .filter((movie) => !seen.has(movie.imdbId) && Boolean(seen.add(movie.imdbId)))
    .sort((a, b) => b.rating - a.rating)

  return { movies: deduped, scannedCount }
}
