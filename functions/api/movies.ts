type StreamingService = 'netflix' | 'prime'

interface Env {
  TMDB_API_KEY: string
  OMDB_API_KEY: string
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
// 1 (providers) + up to 8 (discover pages across 2 services) leaves room for
// this many candidates, each needing 2 lookups (imdb id + rating).
const MAX_RATING_LOOKUPS = 18

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

async function getImdbId(env: Env, movieId: number): Promise<string | null> {
  const data = await tmdbJson(`https://api.themoviedb.org/3/movie/${movieId}/external_ids?api_key=${encodeURIComponent(env.TMDB_API_KEY)}`)
  return typeof data.imdb_id === 'string' ? data.imdb_id : null
}

async function getImdbRating(env: Env, imdbId: string): Promise<number | null> {
  const response = await fetch(`https://www.omdbapi.com/?apikey=${encodeURIComponent(env.OMDB_API_KEY)}&i=${encodeURIComponent(imdbId)}`)
  if (!response.ok) throw new Error('omdb-failed')
  const data = await response.json() as { Response?: string; Error?: string; imdbRating?: string }
  if (data.Response === 'False') {
    if (/limit reached|invalid api key/i.test(data.Error ?? '')) throw new Error('omdb-limit')
    return null
  }
  const rating = Number.parseFloat(data.imdbRating ?? '')
  return Number.isNaN(rating) ? null : rating
}

export const onRequestGet = async (context: Context): Promise<Response> => {
  const url = new URL(context.request.url)
  const region = url.searchParams.get('region')
  const minScore = Number.parseFloat(url.searchParams.get('minScore') ?? '')
  const requestedDepth = Number.parseInt(url.searchParams.get('scanDepth') ?? '', 10)
  const genreId = Number.parseInt(url.searchParams.get('genreId') ?? '', 10)
  const services = validServices(url.searchParams.get('services'))

  if (!region || !/^[A-Z]{2}$/.test(region) || !services || !Number.isFinite(minScore) || minScore < 0 || minScore > 10) {
    return json({ error: 'invalid-request' }, 400)
  }
  const scanDepth = [40, 80].includes(requestedDepth) ? requestedDepth : 80
  const cacheKey = new Request(url.toString())
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

    const seenIds = new Set<number>()
    const toCheck = candidates
      .filter((movie) => (seenIds.has(movie.id) ? false : (seenIds.add(movie.id), true)))
      .sort((a, b) => (b.popularity ?? 0) - (a.popularity ?? 0))
      .slice(0, MAX_RATING_LOOKUPS)

    const movies = (await pool(toCheck, async (movie): Promise<ReelScoreMovie | null> => {
      const imdbId = await getImdbId(context.env, movie.id)
      if (!imdbId) return null
      const rating = await getImdbRating(context.env, imdbId)
      if (rating === null || rating < minScore) return null
      return {
        title: movie.title,
        year: movie.release_date?.slice(0, 4) ?? '',
        poster: movie.poster_path ? `https://image.tmdb.org/t/p/w342${movie.poster_path}` : null,
        imdbId,
        rating,
        service: movie.service,
      }
    }, 5)).filter((movie): movie is ReelScoreMovie => movie !== null)

    const seen = new Set<string>()
    const body = {
      movies: movies.filter((movie) => !seen.has(movie.imdbId) && Boolean(seen.add(movie.imdbId))).sort((a, b) => b.rating - a.rating),
      scannedCount: toCheck.length,
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
