type StreamingService = 'netflix' | 'prime'

interface Env {
  TMDB_API_KEY: string
  OMDB_API_KEY: string
  // Auto-populated by Cloudflare Pages with the deployed commit SHA.
  CF_PAGES_COMMIT_SHA?: string
}

interface Context {
  request: Request
  env: Env
}

interface CandidateMovie {
  id: number
  title: string
  release_date?: string
  poster_path?: string | null
  popularity?: number
  service: StreamingService
}

// Cloudflare Workers on the free plan cap each invocation at 50 subrequests.
// Reserve a safety margin below that, then split what's left between TMDB
// discovery calls and OMDb rating lookups (1 subrequest each, per candidate).
const SUBREQUEST_BUDGET = 45

interface ReelScoreMovie {
  title: string
  year: string
  poster: string | null
  imdbId: string
  rating: number
  service: StreamingService
}

const PROVIDER_MATCHES: Record<StreamingService, (name: string) => boolean> = {
  netflix: (name) => /netflix/i.test(name) && !/kids/i.test(name),
  prime: (name) => /amazon prime video|^prime video$/i.test(name),
}

function json(body: unknown, status = 200, cacheable = false): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': cacheable ? 'public, s-maxage=14400, max-age=300' : 'no-store',
    },
  })
}

function validServices(value: string | null): StreamingService[] | null {
  if (!value) return null
  const services = value.split(',').filter(
    (service): service is StreamingService => service === 'netflix' || service === 'prime',
  )
  return services.length > 0 && services.length === new Set(services).size ? services : null
}

async function pool<T, R>(items: T[], worker: (item: T) => Promise<R>, limit: number): Promise<R[]> {
  const results = new Array<R>(items.length)
  let next = 0
  async function run() {
    while (next < items.length) {
      const index = next++
      results[index] = await worker(items[index])
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, run))
  return results
}

async function tmdbJson(url: string): Promise<Record<string, unknown>> {
  const response = await fetch(url)
  if (!response.ok) throw new Error('tmdb-failed')
  return response.json() as Promise<Record<string, unknown>>
}

async function getProviderIds(env: Env, services: StreamingService[]): Promise<Partial<Record<StreamingService, number>>> {
  const url = `https://api.themoviedb.org/3/watch/providers/movie?api_key=${encodeURIComponent(env.TMDB_API_KEY)}`
  const data = await tmdbJson(url)
  const providers = Array.isArray(data.results) ? data.results : []
  const ids: Partial<Record<StreamingService, number>> = {}
  for (const service of services) {
    const provider = providers.find((value) => {
      if (!value || typeof value !== 'object') return false
      const name = (value as { provider_name?: unknown }).provider_name
      return typeof name === 'string' && PROVIDER_MATCHES[service](name)
    }) as { provider_id?: unknown } | undefined
    if (typeof provider?.provider_id === 'number') ids[service] = provider.provider_id
  }
  return ids
}

async function discover(env: Env, region: string, providerId: number, scanDepth: number, genreId?: number): Promise<Omit<CandidateMovie, 'service'>[]> {
  const pages = Math.ceil(scanDepth / 20)
  const batches = await Promise.all(
    Array.from({ length: pages }, async (_, index) => {
      const url = new URL('https://api.themoviedb.org/3/discover/movie')
      url.search = new URLSearchParams({
        api_key: env.TMDB_API_KEY,
        watch_region: region,
        with_watch_providers: String(providerId),
        with_watch_monetization_types: 'flatrate',
        sort_by: 'popularity.desc',
        page: String(index + 1),
        ...(genreId ? { with_genres: String(genreId) } : {}),
      }).toString()
      const data = await tmdbJson(url.toString())
      return Array.isArray(data.results) ? data.results : []
    }),
  )
  return batches.flat().filter((movie): movie is Omit<CandidateMovie, 'service'> =>
    Boolean(movie && typeof movie === 'object' && typeof (movie as { id?: unknown }).id === 'number' && typeof (movie as { title?: unknown }).title === 'string'),
  ).slice(0, scanDepth)
}

interface OmdbMatch {
  imdbId: string
  rating: number
}

// Looking up by title+year (instead of TMDB's external_ids + OMDb's by-id
// lookup) costs one subrequest instead of two, roughly doubling how many
// candidates fit in the budget above. OMDb's `y` filter is exact, so a
// title with a mismatched release year (rare, e.g. festival vs wide
// release) will come back as no match rather than a wrong one.
async function getOmdbMatch(env: Env, title: string, year: string): Promise<OmdbMatch | null> {
  const params = new URLSearchParams({
    apikey: env.OMDB_API_KEY,
    t: title,
    type: 'movie',
  })
  if (year) params.set('y', year)
  const response = await fetch(`https://www.omdbapi.com/?${params.toString()}`)
  if (!response.ok) throw new Error('omdb-failed')
  const data = await response.json() as { Response?: string; Error?: string; imdbID?: string; imdbRating?: string }
  if (data.Response === 'False') {
    if (/limit reached|invalid api key/i.test(data.Error ?? '')) throw new Error('omdb-limit')
    return null
  }
  const rating = Number.parseFloat(data.imdbRating ?? '')
  if (typeof data.imdbID !== 'string' || Number.isNaN(rating)) return null
  return { imdbId: data.imdbID, rating }
}

export const onRequestGet = async (context: Context): Promise<Response> => {
  const url = new URL(context.request.url)
  const region = url.searchParams.get('region')
  const minScore = Number.parseFloat(url.searchParams.get('minScore') ?? '')
  const requestedDepth = Number.parseInt(url.searchParams.get('scanDepth') ?? '', 10)
  const genreId = Number.parseInt(url.searchParams.get('genreId') ?? '', 10)
  const services = validServices(url.searchParams.get('services'))
  const requestedOffset = Number.parseInt(url.searchParams.get('offset') ?? '0', 10)

  if (!region || !/^[A-Z]{2}$/.test(region) || !services || !Number.isFinite(minScore) || minScore < 0 || minScore > 10) {
    return json({ error: 'invalid-request' }, 400)
  }
  const scanDepth = [40, 80, 150].includes(requestedDepth) ? requestedDepth : 80
  const offset = Number.isFinite(requestedOffset) && requestedOffset >= 0 ? requestedOffset : 0

  // Namespace the cache key by deploy so a code change (e.g. a change to how
  // results are computed) can never serve a stale response left over from a
  // previous deploy — s-maxage is 4h, far longer than we want a bug fix to
  // take to reach real traffic.
  const versionedUrl = new URL(url.toString())
  versionedUrl.searchParams.set('_v', context.env.CF_PAGES_COMMIT_SHA ?? 'dev')
  const cacheKey = new Request(versionedUrl.toString())
  const edgeCache = caches as CacheStorage & { default: Cache }
  const cached = await edgeCache.default.match(cacheKey)
  if (cached) return cached

  try {
    const providerIds = await getProviderIds(context.env, services)
    const candidates = (await Promise.all(services.map(async (service) => {
      const providerId = providerIds[service]
      if (!providerId) return []
      const movies = await discover(context.env, region, providerId, scanDepth, Number.isFinite(genreId) ? genreId : undefined)
      return movies.map((movie) => ({ ...movie, service }))
    }))).flat()

    if (candidates.length === 0) return json({ error: 'no-candidates' }, 404)

    // getProviderIds spent 1 subrequest; discover spent one per page above.
    const discoverCalls = services.length * Math.ceil(scanDepth / 20)
    const maxRatingLookups = Math.max(0, SUBREQUEST_BUDGET - 1 - discoverCalls)

    const seenIds = new Set<number>()
    const rankedCandidates = candidates
      .filter((movie) => (seenIds.has(movie.id) ? false : (seenIds.add(movie.id), true)))
      .sort((a, b) => (b.popularity ?? 0) - (a.popularity ?? 0))
    const toCheck = rankedCandidates.slice(offset, offset + maxRatingLookups)

    const movies = (await pool(toCheck, async (movie): Promise<ReelScoreMovie | null> => {
      const year = movie.release_date?.slice(0, 4) ?? ''
      const match = await getOmdbMatch(context.env, movie.title, year)
      if (!match || match.rating < minScore) return null
      return {
        title: movie.title,
        year,
        poster: movie.poster_path ? `https://image.tmdb.org/t/p/w342${movie.poster_path}` : null,
        imdbId: match.imdbId,
        rating: match.rating,
        service: movie.service,
      }
    }, 5)).filter((movie): movie is ReelScoreMovie => movie !== null)

    const seen = new Set<string>()
    const body = {
      movies: movies.filter((movie) => !seen.has(movie.imdbId) && Boolean(seen.add(movie.imdbId))).sort((a, b) => b.rating - a.rating),
      scannedCount: toCheck.length,
      hasMore: offset + toCheck.length < rankedCandidates.length,
      totalCandidates: rankedCandidates.length,
    }
    const response = json(body, 200, true)
    await edgeCache.default.put(cacheKey, response.clone())
    return response
  } catch (error) {
    if (error instanceof Error && error.message === 'omdb-limit') {
      return json({ error: 'omdb-limit' }, 429)
    }
    return json({ error: 'search-failed' }, 502)
  }
}
