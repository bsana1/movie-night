import { useCallback, useMemo, useState } from 'react'
import type { ReelScoreMovie } from '../types/reelScore'
import {
  WATCHED_STORAGE_KEY,
  type WatchedMovie,
} from '../types/watched'

function loadWatched(): WatchedMovie[] {
  try {
    const raw = localStorage.getItem(WATCHED_STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as WatchedMovie[]
    if (!Array.isArray(parsed)) return []
    return parsed.filter((m) => m?.imdbId && m?.title)
  } catch {
    return []
  }
}

function saveWatched(movies: WatchedMovie[]) {
  try {
    localStorage.setItem(WATCHED_STORAGE_KEY, JSON.stringify(movies))
  } catch {
    /* ignore */
  }
}

export function useWatchedMovies() {
  const [watched, setWatched] = useState<WatchedMovie[]>(loadWatched)

  const watchedIds = useMemo(
    () => new Set(watched.map((m) => m.imdbId)),
    [watched],
  )

  const markWatched = useCallback((movie: ReelScoreMovie) => {
    setWatched((prev) => {
      if (prev.some((m) => m.imdbId === movie.imdbId)) return prev
      const next: WatchedMovie[] = [
        { ...movie, watchedAt: new Date().toISOString() },
        ...prev,
      ]
      saveWatched(next)
      return next
    })
  }, [])

  const unmarkWatched = useCallback((imdbId: string) => {
    setWatched((prev) => {
      const next = prev.filter((m) => m.imdbId !== imdbId)
      saveWatched(next)
      return next
    })
  }, [])

  const isWatched = useCallback(
    (imdbId: string) => watchedIds.has(imdbId),
    [watchedIds],
  )

  const filterUnwatched = useCallback(
    (movies: ReelScoreMovie[]) =>
      movies.filter((m) => !watchedIds.has(m.imdbId)),
    [watchedIds],
  )

  return {
    watched,
    markWatched,
    unmarkWatched,
    isWatched,
    filterUnwatched,
    watchedIds,
  }
}
