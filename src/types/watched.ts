import type { ReelScoreMovie } from '../types/reelScore'

export interface WatchedMovie extends ReelScoreMovie {
  watchedAt: string
}

export const WATCHED_STORAGE_KEY = 'reel-score-watched'
