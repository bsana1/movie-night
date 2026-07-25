export type StreamingService = 'netflix' | 'prime'

export interface ReelScoreMovie {
  title: string
  year: string
  poster: string | null
  imdbId: string
  rating: number
  service: StreamingService
}

export interface ReelScoreConfig {
  region: string
  minScore: string
  genreId: string
  services: StreamingService[]
  scanDepth: string
}

export const CONFIG_STORAGE_KEY = 'reel-score-config'

export const DEFAULT_CONFIG: ReelScoreConfig = {
  region: 'US',
  minScore: '7.0',
  genreId: '',
  services: ['netflix', 'prime'],
  scanDepth: '80',
}
