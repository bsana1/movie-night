import type { ReelScoreConfig, StreamingService } from '../types/reelScore'

const REGIONS = [
  ['US', 'United States'],
  ['GB', 'United Kingdom'],
  ['CA', 'Canada'],
  ['AU', 'Australia'],
  ['DE', 'Germany'],
  ['FR', 'France'],
  ['ES', 'Spain'],
  ['IT', 'Italy'],
  ['BR', 'Brazil'],
  ['MX', 'Mexico'],
  ['IN', 'India'],
] as const

const GENRES = [
  ['', 'Any genre'],
  ['28', 'Action'],
  ['12', 'Adventure'],
  ['16', 'Animation'],
  ['35', 'Comedy'],
  ['80', 'Crime'],
  ['99', 'Documentary'],
  ['18', 'Drama'],
  ['10751', 'Family'],
  ['14', 'Fantasy'],
  ['27', 'Horror'],
  ['9648', 'Mystery'],
  ['10749', 'Romance'],
  ['878', 'Science fiction'],
  ['53', 'Thriller'],
] as const

interface SetupPanelProps {
  config: ReelScoreConfig
  onChange: (patch: Partial<ReelScoreConfig>) => void
  open: boolean
  searching: boolean
  onClose: () => void
  onApply: () => void
}

export function SetupPanel({
  config,
  onChange,
  open,
  searching,
  onClose,
  onApply,
}: SetupPanelProps) {
  function toggleService(service: StreamingService) {
    const has = config.services.includes(service)
    const services = has
      ? config.services.filter((s) => s !== service)
      : [...config.services, service]
    onChange({ services })
  }

  if (!open) return null

  return (
    <div className="sheet-backdrop open" onClick={onClose}>
      <section
        className="filter-sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby="filters-title"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="sheet-handle" aria-hidden="true" />
        <div className="sheet-heading">
          <div>
            <p className="eyebrow">Make it yours</p>
            <h2 id="filters-title">Filters</h2>
          </div>
          <button type="button" className="sheet-close" onClick={onClose} aria-label="Close filters">
            ×
          </button>
        </div>
        <div className="sheet-content">
        <div className="row">
          <div className="field">
            <label htmlFor="region">Region</label>
            <select
              id="region"
              value={config.region}
              onChange={(e) => onChange({ region: e.target.value })}
            >
              {REGIONS.map(([code, label]) => (
                <option key={code} value={code}>
                  {label}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="minScore">Minimum IMDb Score</label>
            <div className="score-row">
              <input
                id="minScore"
                type="range"
                min={5}
                max={9}
                step={0.1}
                value={config.minScore}
                onChange={(e) => onChange({ minScore: e.target.value })}
              />
              <div className="score-val" aria-hidden="true">
                {parseFloat(config.minScore).toFixed(1)}
              </div>
            </div>
          </div>
          <div className="field">
            <label htmlFor="genre">Genre</label>
            <select
              id="genre"
              value={config.genreId}
              onChange={(e) => onChange({ genreId: e.target.value })}
            >
              {GENRES.map(([id, label]) => (
                <option key={id} value={id}>
                  {label}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="field">
          <label>Where to look</label>
          <div className="toggles">
            <button
              type="button"
              className={`toggle-chip${config.services.includes('netflix') ? ' active' : ''}`}
              onClick={() => toggleService('netflix')}
            >
              Netflix
            </button>
            <button
              type="button"
              className={`toggle-chip${config.services.includes('prime') ? ' active' : ''}`}
              onClick={() => toggleService('prime')}
            >
              Prime Video
            </button>
          </div>
        </div>

        <div className="field">
          <label htmlFor="scanDepth">
            How many titles to scan per platform (more = slower, more thorough)
          </label>
          <select
            id="scanDepth"
            value={config.scanDepth}
            onChange={(e) => onChange({ scanDepth: e.target.value })}
          >
            <option value="40">40 — quick</option>
            <option value="80">80 — balanced</option>
            <option value="150">150 — thorough</option>
          </select>
        </div>
        </div>
        <div className="sheet-footer">
          <button type="button" className="btn sheet-apply" disabled={searching} onClick={onApply}>
            {searching ? 'Finding movies…' : 'Show movies'}
          </button>
        </div>
      </section>
    </div>
  )
}
