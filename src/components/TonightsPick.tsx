import type { ReelScoreMovie } from '../types/reelScore'

function serviceUrl(movie: ReelScoreMovie): string {
  if (movie.service === 'netflix') {
    return `https://www.netflix.com/search?q=${encodeURIComponent(movie.title)}`
  }
  return `https://www.amazon.com/s?k=${encodeURIComponent(movie.title)}&i=instant-video`
}

interface TonightsPickProps {
  movie: ReelScoreMovie
  spinning: boolean
}

export function TonightsPick({ movie, spinning }: TonightsPickProps) {
  return (
    <article className={`tonights-pick${spinning ? ' spinning' : ''}`}>
      {movie.poster ? (
        <img className="tonights-poster" src={movie.poster} alt="" />
      ) : null}
      <div className="tonights-copy">
        <p className="eyebrow">Tonight&apos;s pick</p>
        <h2>{movie.title}</h2>
        <p className="tonights-meta">
          {movie.year || 'Year unavailable'} <span>•</span> IMDb {movie.rating.toFixed(1)}
        </p>
        <a
          className="watch-button"
          href={serviceUrl(movie)}
          target="_blank"
          rel="noopener noreferrer"
        >
          Watch on {movie.service === 'netflix' ? 'Netflix' : 'Prime Video'}
        </a>
      </div>
      <div className="tonights-score" aria-label={`IMDb score ${movie.rating.toFixed(1)}`}>
        {movie.rating.toFixed(1)}
      </div>
    </article>
  )
}
