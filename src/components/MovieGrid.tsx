import { useRef } from 'react'
import type { ReelScoreMovie } from '../types/reelScore'

function openInAppUrl(movie: ReelScoreMovie): string {
  if (movie.service === 'netflix') {
    return `https://www.netflix.com/search?q=${encodeURIComponent(movie.title)}`
  }
  return `https://www.amazon.com/s?k=${encodeURIComponent(movie.title)}&i=instant-video`
}

interface MovieCardProps {
  movie: ReelScoreMovie
  action?: {
    label: string
    onClick: () => void
  }
}

export function MovieCard({ movie, action }: MovieCardProps) {
  function tiltCard(event: React.MouseEvent<HTMLElement>) {
    const card = event.currentTarget
    const bounds = card.getBoundingClientRect()
    const x = (event.clientX - bounds.left) / bounds.width - 0.5
    const y = (event.clientY - bounds.top) / bounds.height - 0.5
    card.style.setProperty('--rotate-x', `${-y * 5}deg`)
    card.style.setProperty('--rotate-y', `${x * 5}deg`)
  }

  function resetTilt(event: React.MouseEvent<HTMLElement>) {
    event.currentTarget.style.removeProperty('--rotate-x')
    event.currentTarget.style.removeProperty('--rotate-y')
  }

  return (
    <article className="card" onMouseMove={tiltCard} onMouseLeave={resetTilt}>
      <div className="poster-wrap">
        {movie.poster ? (
          <img src={movie.poster} alt={`${movie.title} poster`} loading="lazy" />
        ) : null}
        <div className="rating-bulb">{movie.rating.toFixed(1)}</div>
        <div className={`platform-tag ${movie.service}`}>
          {movie.service === 'netflix' ? 'Netflix' : 'Prime'}
        </div>
      </div>
      <div className="card-body">
        <h3>{movie.title}</h3>
        <div className="year">{movie.year}</div>
        <div className="card-links">
          <a
            href={`https://www.imdb.com/title/${movie.imdbId}/`}
            target="_blank"
            rel="noopener noreferrer"
          >
            IMDb
          </a>
          <a
            href={openInAppUrl(movie)}
            target="_blank"
            rel="noopener noreferrer"
          >
            Open in app
          </a>
        </div>
        {action ? (
          <button type="button" className="card-action" onClick={action.onClick}>
            {action.label}
          </button>
        ) : null}
      </div>
    </article>
  )
}

interface MovieGridProps {
  movies: ReelScoreMovie[]
  emptyTitle: string
  emptyBody: string
  actionForMovie?: (movie: ReelScoreMovie) => MovieCardProps['action']
}

export function MovieGrid({
  movies,
  emptyTitle,
  emptyBody,
  actionForMovie,
}: MovieGridProps) {
  const trackRef = useRef<HTMLDivElement>(null)

  if (movies.length === 0) {
    return (
      <div className="empty">
        <h3>{emptyTitle}</h3>
        <p>{emptyBody}</p>
      </div>
    )
  }

  function scroll(direction: -1 | 1) {
    const track = trackRef.current
    if (!track) return
    track.scrollBy({ left: direction * track.clientWidth * 0.8, behavior: 'smooth' })
  }

  return (
    <div className="carousel">
      <button
        type="button"
        className="carousel-button carousel-button-prev"
        onClick={() => scroll(-1)}
        aria-label="Show previous movies"
      >
        ‹
      </button>
      <div className="carousel-track" ref={trackRef} aria-label="Movie results">
        {movies.map((m) => (
          <MovieCard
            key={m.imdbId}
            movie={m}
            action={actionForMovie?.(m)}
          />
        ))}
      </div>
      <button
        type="button"
        className="carousel-button carousel-button-next"
        onClick={() => scroll(1)}
        aria-label="Show next movies"
      >
        ›
      </button>
    </div>
  )
}
