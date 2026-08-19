/** Amap (高德) Web Service API client. */

import type { GeocodeResult, LngLat, PoiResult, RouteResult, RouteStep } from '../types.js'
import { formatLngLat } from '../types.js'

const REST = 'https://restapi.amap.com'

/** Shared fetch helper: GET with key + params, JSON response, abortable, timeout-bounded. */
async function get<T>(
  path: string,
  key: string,
  params: Record<string, string>,
  signal: AbortSignal,
  timeoutMs: number,
): Promise<T> {
  const url = new URL(`${REST}${path}`)
  url.searchParams.set('key', key)
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== '') url.searchParams.set(k, v)
  }
  // Combine the caller's abort signal with a per-request timeout.
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(new Error(`Amap request timed out after ${timeoutMs}ms`)), timeoutMs)
  const onAbort = () => controller.abort(signal.reason)
  if (signal.aborted) controller.abort(signal.reason)
  else signal.addEventListener('abort', onAbort, { once: true })
  let res: Response
  try {
    res = await fetch(url, { signal: controller.signal, headers: { Accept: 'application/json' } })
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err)
    throw new Error(`高德地图服务请求失败（${reason}）。请检查 amapKey 是否有效：https://console.amap.com/dev/key/app`)
  } finally {
    clearTimeout(timer)
    signal.removeEventListener('abort', onAbort)
  }
  if (!res.ok) throw new Error(`Amap HTTP ${res.status}: ${res.statusText}`)
  const body = (await res.json()) as { status?: string; info?: string; infocode?: string; [k: string]: unknown }
  if (body.status === '1') return body as T
  throw new Error(`Amap API error ${body.infocode ?? '?'}: ${body.info ?? 'unknown'}`)
}

/** Amap v5 driving/walking/bicycling direction response shape (subset). */
interface DirectionV5Response {
  route: {
    paths: Array<{
      distance: string
      duration: string
      steps: Array<{
        instruction: string
        distance: string
        duration: string
        polyline?: string
      }>
    }>
  }
}

/** Amap v5 transit integrated response shape (subset). */
interface TransitV5Response {
  route: {
    transits: Array<{
      distance: string
      duration: string
      segments: Array<{
        walking?: { distance: string; duration: string }
        bus?: { buslines?: Array<{ name: string; departure_stop?: { name: string }; arrival_stop?: { name: string } }> }
      }>
    }>
  }
}

export interface AmapClientOptions {
  key: string
  timeoutMs: number
}

export class AmapClient {
  constructor(private readonly opts: AmapClientOptions) {}

  /**
   * Plan a route. `mode` maps to the Amap endpoint.
   * Transit requires city1/city2 (origin/destination city names).
   */
  async route(
    origin: LngLat,
    destination: LngLat,
    mode: 'driving' | 'transit' | 'walking' | 'bicycling',
    opts: { city1?: string; city2?: string } = {},
    signal: AbortSignal,
  ): Promise<RouteResult> {
    if (mode === 'transit') {
      return this.transitRoute(origin, destination, opts, signal)
    }
    const path = `v5/direction/${mode}`
    const body = await get<DirectionV5Response>(
      path,
      this.opts.key,
      { origin: formatLngLat(origin), destination: formatLngLat(destination) },
      signal,
      this.opts.timeoutMs,
    )
    const path0 = body.route.paths[0]
    if (!path0) throw new Error('Amap returned no route path')
    const steps: RouteStep[] = (path0.steps ?? []).map((s) => ({
      instruction: s.instruction ?? '',
      distanceM: Number(s.distance ?? 0),
      durationS: Number(s.duration ?? 0),
    }))
    return {
      provider: 'amap',
      distanceM: Number(path0.distance ?? 0),
      durationS: Number(path0.duration ?? 0),
      polyline: steps.map((s) => s.instruction).join(' → '),
      points: [origin, destination],
      steps,
    }
  }

  private async transitRoute(
    origin: LngLat,
    destination: LngLat,
    opts: { city1?: string; city2?: string },
    signal: AbortSignal,
  ): Promise<RouteResult> {
    const body = await get<TransitV5Response>(
      'v5/direction/transit/integrated',
      this.opts.key,
      {
        origin: formatLngLat(origin),
        destination: formatLngLat(destination),
        city1: opts.city1 ?? '',
        city2: opts.city2 ?? '',
      },
      signal,
      this.opts.timeoutMs,
    )
    const transit0 = body.route.transits[0]
    if (!transit0) throw new Error('Amap returned no transit plan')
    const steps: RouteStep[] = (transit0.segments ?? []).map((seg, i) => {
      if (seg.bus?.buslines?.length) {
        const line = seg.bus.buslines[0]
        const from = line.departure_stop?.name ?? ''
        const to = line.arrival_stop?.name ?? ''
        return {
          instruction: `乘坐 ${line.name ?? '公交'}（${from} → ${to}）`,
          distanceM: 0,
          durationS: 0,
        }
      }
      if (seg.walking) {
        return {
          instruction: `步行 ${i + 1}`,
          distanceM: Number(seg.walking.distance ?? 0),
          durationS: Number(seg.walking.duration ?? 0),
        }
      }
      return { instruction: '换乘', distanceM: 0, durationS: 0 }
    })
    return {
      provider: 'amap',
      distanceM: Number(transit0.distance ?? 0),
      durationS: Number(transit0.duration ?? 0),
      polyline: steps.map((s) => s.instruction).join(' → '),
      points: [origin, destination],
      steps,
    }
  }

  /** Forward geocode: address → coordinates. */
  async geocode(address: string, signal: AbortSignal): Promise<GeocodeResult> {
    const body = await get<{ geocodes: Array<{ formatted_address: string; location: string; city?: string; district?: string; adcode?: string }> }>(
      'v3/geocode/geo',
      this.opts.key,
      { address },
      signal,
      this.opts.timeoutMs,
    )
    const first = body.geocodes?.[0]
    if (!first) throw new Error(`Amap could not geocode address: ${address}`)
    const [lng, lat] = first.location.split(',').map(Number)
    if (!Number.isFinite(lng) || !Number.isFinite(lat)) throw new Error('Amap geocode returned invalid location')
    return {
      provider: 'amap',
      formatted: first.formatted_address ?? address,
      location: [lng, lat],
      city: first.city,
      district: first.district,
      adcode: first.adcode,
    }
  }

  /** Reverse geocode: coordinates → address. */
  async reverseGeocode(location: LngLat, signal: AbortSignal): Promise<GeocodeResult> {
    const body = await get<{ regeocode: { formatted_address: string; addressComponent?: { city?: string; district?: string; adcode?: string } } }>(
      'v3/geocode/regeo',
      this.opts.key,
      { location: formatLngLat(location) },
      signal,
      this.opts.timeoutMs,
    )
    const re = body.regeocode
    if (!re) throw new Error('Amap reverse geocode returned no result')
    return {
      provider: 'amap',
      formatted: re.formatted_address ?? formatLngLat(location),
      location,
      city: re.addressComponent?.city,
      district: re.addressComponent?.district,
      adcode: re.addressComponent?.adcode,
    }
  }

  /** POI text search. */
  async poiSearch(keywords: string, opts: { region?: string; cityLimit?: boolean }, signal: AbortSignal): Promise<PoiResult[]> {
    const body = await get<{ pois: Array<{ name: string; location: string; type?: string; address?: string; tel?: string }> }>(
      'v5/place/text',
      this.opts.key,
      { keywords, region: opts.region ?? '', city_limit: opts.cityLimit ? 'true' : 'false' },
      signal,
      this.opts.timeoutMs,
    )
    return (body.pois ?? []).map((p) => {
      const [lng, lat] = p.location.split(',').map(Number)
      return {
        name: p.name,
        location: [lng, lat],
        type: p.type,
        address: p.address,
        tel: p.tel,
      }
    })
  }

  /** POI around search (nearest first by default). */
  async poiAround(location: LngLat, keywords: string, opts: { radiusM?: number; types?: string }, signal: AbortSignal): Promise<PoiResult[]> {
    const body = await get<{ pois: Array<{ name: string; location: string; type?: string; address?: string; tel?: string; distance?: string }> }>(
      'v5/place/around',
      this.opts.key,
      {
        location: formatLngLat(location),
        keywords,
        radius: opts.radiusM ? String(opts.radiusM) : '',
        types: opts.types ?? '',
      },
      signal,
      this.opts.timeoutMs,
    )
    return (body.pois ?? []).map((p) => {
      const [lng, lat] = p.location.split(',').map(Number)
      return {
        name: p.name,
        location: [lng, lat],
        type: p.type,
        address: p.address,
        tel: p.tel,
        distanceM: p.distance ? Number(p.distance) : undefined,
      }
    })
  }
}
