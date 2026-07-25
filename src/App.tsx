import { useMemo, useState } from 'react'
import { MovieGrid } from './components/MovieGrid'
import { SetupPanel } from './components/SetupPanel'
import { TonightsPick } from './components/TonightsPick'
import { WatchedSection } from './components/WatchedSection'
import { useReelScoreConfig } from './hooks/useReelScoreConfig'
import { useWatchedMovies } from './hooks/useWatchedMovies'
import { runReelScoreSearch } from './lib/reelScoreSearch'
import type { ReelScoreMovie } from './types/reelScore'
import './App.css'

function App() {
  const { config, patchConfig, panelOpen, setPanelOpen } = useReelScoreConfig()
  const { watched, markWatched, unmarkWatched, filterUnwatched } =
    useWatchedMovies()
  const [status, setStatus] = useState('')
  const [statusError, setStatusError] = useState(false)
  const [searching, setSearching] = useState(false)
  const [results, setResults] = useState<ReelScoreMovie[] | null>(null)
  const [watchedOpen, setWatchedOpen] = useState(true)
  const [pickedMovie, setPickedMovie] = useState<ReelScoreMovie | null>(null)
  const [picking, setPicking] = useState(false)

  const visibleResults = useMemo(
    () => (results ? filterUnwatched(results) : []),
    [results, filterUnwatched],
  )

  const hiddenWatchedCount = useMemo(() => {
    if (!results) return 0
    return results.length - visibleResults.length
  }, [results, visibleResults.length])

  function setStatusMessage(msg: string, isError = false) {
    setStatus(msg)
    setStatusError(isError)
  }

  function pickForUs() {
    if (visibleResults.length === 0 || picking) return
    setPicking(true)
    window.setTimeout(() => {
      const index = Math.floor(Math.random() * visibleResults.length)
      setPickedMovie(visibleResults[index])
      setPicking(false)
    }, 700)
  }

  async function handleSearch() {
    const minScore = parseFloat(config.minScore)
    const scanDepth = parseInt(config.scanDepth, 10)
    const genreId = config.genreId ? parseInt(config.genreId, 10) : undefined

    if (config.services.length === 0) {
      setStatusMessage('Pick at least one platform.', true)
      return
    }

    try {
      localStorage.setItem('reel-score-config', JSON.stringify(config))
    } catch {
      /* ignore */
    }

    setSearching(true)
    setResults(null)
    setPickedMovie(null)
    setStatusMessage("Looking up what's streaming…")

    try {
      const { movies, scannedCount } = await runReelScoreSearch({
        region: config.region,
        minScore,
        genreId,
        services: config.services,
        scanDepth,
        onStatus: (msg) => setStatusMessage(msg, false),
      })

      const unwatched = filterUnwatched(movies)
      const hidden = movies.length - unwatched.length
      let summary = `${unwatched.length} movie${unwatched.length === 1 ? '' : 's'} at ${minScore.toFixed(1)}+ out of ${scannedCount} scanned.`
      if (hidden > 0) {
        summary += ` (${hidden} already watched hidden.)`
      }
      setStatusMessage(summary)
      setResults(movies)
      setPickedMovie(unwatched[0] ?? null)
    } catch (e) {
      if (e instanceof Error && e.message === 'no-candidates') {
        setStatusMessage(
          'No titles found for that platform/region combination.',
          true,
        )
        setResults([])
      } else if (e instanceof Error && e.message === 'omdb-limit') {
        setStatusMessage(
          'The IMDb rating service has reached its daily limit. Please try again later.',
          true,
        )
      } else {
        console.error(e)
        setStatusMessage(
          'Something went wrong talking to TMDb or OMDb. Try again in a moment.',
          true,
        )
      }
    } finally {
      setSearching(false)
    }
  }

  return (
    <div className="wrap">
      <header className="marquee">
        <div>
          <p className="app-kicker">Movie night, minus the scrolling.</p>
          <h1>REEL SCORE</h1>
        </div>
        <button
          type="button"
          className="filter-trigger"
          onClick={() => setPanelOpen(true)}
          aria-label="Open filters"
        >
          <span aria-hidden="true">☷</span>
          Filters
        </button>
      </header>

      <div className="filter-chips" aria-label="Active filters">
        {config.services.map((service) => (
          <span className="filter-chip" key={service}>
            {service === 'netflix' ? 'Netflix' : 'Prime Video'}
          </span>
        ))}
        <span className="filter-chip">IMDb {config.minScore}+</span>
        {config.genreId ? <span className="filter-chip">Genre selected</span> : null}
      </div>

      <SetupPanel
        config={config}
        onChange={patchConfig}
        open={panelOpen}
        searching={searching}
        onClose={() => setPanelOpen(false)}
        onApply={() => {
          setPanelOpen(false)
          void handleSearch()
        }}
      />

      <button
        type="button"
        className="btn"
        disabled={searching}
        onClick={() => void handleSearch()}
      >
        Find movies
      </button>

      <div
        className={`status${statusError ? ' error' : ''}`}
        role="status"
        aria-live="polite"
      >
        {searching && !status ? (
          <>
            Working…
            <div className="filmstrip" aria-hidden="true">
              <span />
              <span />
              <span />
              <span />
            </div>
          </>
        ) : (
          status
        )}
      </div>

      {results !== null ? (
        <section className="results-section" aria-labelledby="results-heading">
          {pickedMovie ? <TonightsPick movie={pickedMovie} spinning={picking} /> : null}
          <div className="results-heading-row">
            <h2 className="section-title static" id="results-heading">
              Tonight&apos;s picks
            </h2>
            {visibleResults.length > 1 ? (
              <button
                type="button"
                className="pick-button"
                disabled={picking}
                onClick={pickForUs}
              >
                {picking ? 'Picking…' : '✦ Pick for us'}
              </button>
            ) : null}
          </div>
          <MovieGrid
            movies={visibleResults}
            emptyTitle={
              results.length > 0 && hiddenWatchedCount === results.length
                ? 'All caught up'
                : 'Nothing cleared the bar'
            }
            emptyBody={
              results.length > 0 && hiddenWatchedCount === results.length
                ? 'Every match from this scan is already in your watched list. Try another search or remove titles from Watched below.'
                : 'No titles on the selected platform(s) hit your minimum score within the scan range. Try lowering the score, scanning more titles, or checking a different region.'
            }
            actionForMovie={(m) => ({
              label: 'Mark watched',
              onClick: () => markWatched(m),
            })}
          />
        </section>
      ) : null}

      <WatchedSection
        movies={watched}
        open={watchedOpen}
        onToggle={() => setWatchedOpen((o) => !o)}
        onUnwatch={unmarkWatched}
      />

      <nav className="bottom-nav" aria-label="Main navigation">
        <button type="button" className="nav-item active" onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}>
          <span aria-hidden="true">⌂</span>
          Discover
        </button>
        <button
          type="button"
          className="nav-item"
          onClick={() => {
            setWatchedOpen(true)
            document.getElementById('watched-heading')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
          }}
        >
          <span aria-hidden="true">◉</span>
          Watched
        </button>
        <button type="button" className="nav-item" onClick={() => setPanelOpen(true)}>
          <span aria-hidden="true">⚙</span>
          Settings
        </button>
      </nav>
    </div>
  )
}

export default App
