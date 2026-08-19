/** Baidu Maps (百度地图) Web Service API client. */

import type { GeocodeResult, LngLat, PoiResult, RouteResult, RouteStep } from '../types.js'
import { formatLngLat } from '../types.js'

const REST = 'https://api.map.baidu.com'

/** Shared fetch helper: GET with ak + params, JSON response, abortable, timeout-bounded. */
async function get<T>(
  path: string,
  ak: string,
  params: Record<string, string>,
  signal: AbortSignal,
  timeoutMs: number,
): Promise<T> {
  const url = new URL(`${REST}${path}`)
  url.searchParams.set('ak', ak)
  url.searchParams.set('output', 'json')
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== '') url.searchParams.set(k, v)
  }
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(new Error(`Baidu request timed out after ${timeoutMs}ms`)), timeoutMs)
  const onAbort = () => controller.abort(signal.reason)
  if (signal.aborted) controller.abort(signal.reason)
  else signal.addEventListener('abort', onAbort, { once: true })
  let res: Response
  try {
    res = await fetch(url, { signal: controller.signal, headers: { Accept: 'application/json' } })
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err)
    throw new Error(`百度地图服务请求失败（${reason}）。请检查 baiduAk 是否有效：https://lbsyun.baidu.com/apiconsole/key`)
  } finally {
    clearTimeout(timer)
    signal.removeEventListener('abort', onAbort)
  }
  if (!res.ok) throw new Error(`Baidu HTTP ${res.status}: ${res.statusText}`)
  const body = (await res.json()) as { status?: number; message?: string; [k: string]: unknown }
  // Baidu returns status 0 for success; 302 = invalid ak.
  if (body.status === 0) return body as T
  if (body.status === 302 || /ak|key/i.test(body.message ?? '')) {
    throw new Error(`百度 key 无效或未生效（status ${body.status}: ${body.message}）。请检查插件配置中的 baiduAk，或前往 https://lbsyun.baidu.com/apiconsole/key 重新申请。`)
  }
  throw new Error(`Baidu API error ${body.status ?? '?'}: ${body.message ?? 'unknown'}`)
}

/** Baidu directionlite response shape (subset). */
interface DirectionResponse {
  result?: {
    routes?: Array<{
      distance?: number
      duration?: number
      steps?: Array<{ instruction?: string; distance?: number; duration?: number }>
    }>
  }
}

/** Baidu geocoding response shape (subset). */
interface GeocodingResponse {
  result?: { location?: { lng?: number; lat?: number } }
}

/** Baidu reverse geocoding response shape (subset). */
interface ReverseGeocodingResponse {
  result?: {
    formatted_address?: string
    addressComponent?: { city?: string; district?: string }
  }
}

/** Baidu place search response shape (subset). */
interface PlaceResponse {
  results?: Array<{
    name?: string
    location?: { lng?: number; lat?: number }
    address?: string
    telephone?: string
    detail_info?: { distance?: number }
  }>
}

export interface BaiduClientOptions {
  ak: string
  timeoutMs: number
}

export class BaiduClient {
  constructor(private readonly opts: BaiduClientOptions) {}

  /**
   * Plan a route. `mode` maps to Baidu directionlite types:
   * driving | transit | walking | riding.
   * Baidu uses `lat,lng` order for origin/destination.
   */
  async route(
    origin: LngLat,
    destination: LngLat,
    mode: 'driving' | 'transit' | 'walking' | 'bicycling',
    opts: { city?: string } = {},
    signal: AbortSignal,
  ): Promise<RouteResult> {
    const type = mode === 'bicycling' ? 'riding' : mode
    const params: Record<string, string> = {
      origin: `${origin[1]},${origin[0]}`,
      destination: `${destination[1]},${destination[0]}`,
    }
    if (mode === 'transit') {
      params.city = opts.city ?? ''
      params.cityd = opts.city ?? ''
    }
    const body = await get<DirectionResponse>(
      `/directionlite/v1/${type}`,
      this.opts.ak,
      params,
      signal,
      this.opts.timeoutMs,
    )
    const route = body.result?.routes?.[0]
    if (!route) throw new Error('百度地图未返回可用路线')
    const steps: RouteStep[] = (route.steps ?? []).map((s) => ({
      instruction: s.instruction ?? '',
      distanceM: s.distance ?? 0,
      durationS: s.duration ?? 0,
    }))
    return {
      provider: 'baidu',
      distanceM: route.distance ?? 0,
      durationS: route.duration ?? 0,
      polyline: steps.map((s) => s.instruction).join(' → '),
      points: [origin, destination],
      steps,
    }
  }

  /** Forward geocode: address → coordinates (BD-09). */
  async geocode(address: string, signal: AbortSignal): Promise<GeocodeResult> {
    const body = await get<GeocodingResponse>(
      '/geocoding/v3/',
      this.opts.ak,
      { address },
      signal,
      this.opts.timeoutMs,
    )
    const loc = body.result?.location
    if (!loc?.lng || !loc.lat) throw new Error(`百度地图未能解析该地址：${address}`)
    return {
      provider: 'baidu',
      formatted: address,
      location: [loc.lng, loc.lat],
    }
  }

  /** Reverse geocode: coordinates → address (BD-09). */
  async reverseGeocode(location: LngLat, signal: AbortSignal): Promise<GeocodeResult> {
    const body = await get<ReverseGeocodingResponse>(
      '/reverse_geocoding/v3/',
      this.opts.ak,
      { location: `${location[1]},${location[0]}` },
      signal,
      this.opts.timeoutMs,
    )
    const re = body.result
    if (!re) throw new Error('百度地图逆地理编码未返回结果')
    return {
      provider: 'baidu',
      formatted: re.formatted_address ?? formatLngLat(location),
      location,
      city: re.addressComponent?.city,
      district: re.addressComponent?.district,
    }
  }

  /** POI search (region-scoped or around). */
  async poiSearch(keywords: string, opts: { region?: string; location?: LngLat; radiusM?: number }, signal: AbortSignal): Promise<PoiResult[]> {
    const params: Record<string, string> = { query: keywords }
    if (opts.location) {
      params.location = `${opts.location[1]},${opts.location[0]}`
      params.radius = String(opts.radiusM ?? 1000)
    } else {
      params.region = opts.region ?? ''
    }
    const body = await get<PlaceResponse>('/place/v2/search', this.opts.ak, params, signal, this.opts.timeoutMs)
    return (body.results ?? []).map((p) => ({
      name: p.name ?? '',
      location: p.location?.lng !== undefined && p.location?.lat !== undefined
        ? [p.location.lng, p.location.lat]
        : [0, 0],
      address: p.address,
      tel: p.telephone,
      distanceM: p.detail_info?.distance,
    }))
  }
}
