import { MovieGrid } from './MovieGrid'
import type { WatchedMovie } from '../types/watched'

interface WatchedSectionProps {
  movies: WatchedMovie[]
  open: boolean
  onToggle: () => void
  onUnwatch: (imdbId: string) => void
}

export function WatchedSection({
  movies,
  open,
  onToggle,
  onUnwatch,
}: WatchedSectionProps) {
  return (
    <section className="watched-section" aria-labelledby="watched-heading">
      <button
        type="button"
        className="section-toggle"
        onClick={onToggle}
        aria-expanded={open}
        id="watched-heading"
      >
        <h2 className="section-title">
          Watched
          <span className="section-count">{movies.length}</span>
        </h2>
        <span className="chev" aria-hidden="true">
          ▾
        </span>
      </button>

      {open ? (
        <div className="section-body">
          <MovieGrid
            movies={movies}
            emptyTitle="Nothing marked yet"
            emptyBody="When you finish a title from your search results, mark it watched to keep it out of future lists."
            actionForMovie={(m) => ({
              label: 'Remove from watched',
              onClick: () => onUnwatch(m.imdbId),
            })}
          />
        </div>
      ) : null}
    </section>
  )
}
