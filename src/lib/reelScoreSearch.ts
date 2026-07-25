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

export async function runReelScoreSearch(
  params: SearchParams,
): Promise<SearchResult> {
  const { region, minScore, genreId, services, scanDepth, onStatus } = params

  onStatus?.("Looking up what's streaming…")
  onStatus?.('Checking ratings and finding the best matches…')

  const query = new URLSearchParams({
    region,
    minScore: String(minScore),
    services: services.join(','),
    scanDepth: String(scanDepth),
  })
  if (genreId) query.set('genreId', String(genreId))

  const response = await fetch(`/api/movies?${query.toString()}`)
  const payload = (await response.json()) as
    | SearchResult
    | { error?: string }

  if (!response.ok) {
    throw new Error('error' in payload ? payload.error : 'search-failed')
  }
  if (!('movies' in payload && 'scannedCount' in payload)) {
    throw new Error('search-failed')
  }
  return payload
}
