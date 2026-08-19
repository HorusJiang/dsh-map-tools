/** Nominatim (OpenStreetMap) geocoding client — free fallback, 1 QPS policy. */

import type { GeocodeResult, LngLat } from '../types.js'

const PUBLIC_NOMINATIM = 'https://nominatim.openstreetmap.org'

/** Nominatim search response shape (subset). */
interface NominatimSearchItem {
  display_name?: string
  lat?: string
  lon?: string
  address?: { city?: string; town?: string; village?: string; district?: string; state?: string }
}

export interface NominatimClientOptions {
  timeoutMs: number
  baseUrl?: string
  /** User-Agent identifying the client (required by Nominatim usage policy). */
  userAgent: string
}

export class NominatimClient {
  constructor(private readonly opts: NominatimClientOptions) {}

  private async get(path: string, params: Record<string, string>, signal: AbortSignal): Promise<unknown> {
    const url = new URL(`${this.opts.baseUrl ?? PUBLIC_NOMINATIM}${path}`)
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v)
    let res: Response
    try {
      res = await fetch(url, {
        signal,
        headers: { Accept: 'application/json', 'User-Agent': this.opts.userAgent },
      })
    } catch (err) {
      // Network-layer failure (DNS, timeout, blocked host). On CN networks
      // nominatim.openstreetmap.org is often unreachable — guide the user to
      // the Amap key instead of surfacing a bare `fetch failed`.
      const reason = err instanceof Error ? err.message : String(err)
      throw new Error(
        `无法访问 Nominatim 免费地理编码服务（${reason}）。部分网络环境下该服务不可达，建议在插件配置中设置高德 amapKey（https://console.amap.com/dev/key/app）以获得稳定的地理编码。`,
      )
    }
    if (!res.ok) throw new Error(`Nominatim HTTP ${res.status}: ${res.statusText}`)
    return res.json()
  }

  /** Forward geocode. */
  async geocode(query: string, signal: AbortSignal): Promise<GeocodeResult> {
    const body = (await this.get(
      '/search',
      { format: 'jsonv2', q: query, limit: '1' },
      signal,
    )) as NominatimSearchItem[]
    const first = body?.[0]
    if (!first) throw new Error(`Nominatim could not geocode: ${query}`)
    const lat = Number(first.lat)
    const lng = Number(first.lon)
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) throw new Error('Nominatim returned invalid coordinates')
    const city = first.address?.city ?? first.address?.town ?? first.address?.village
    return {
      provider: 'nominatim',
      formatted: first.display_name ?? query,
      location: [lng, lat],
      city,
      district: first.address?.district,
    }
  }

  /** Reverse geocode. */
  async reverseGeocode(location: LngLat, signal: AbortSignal): Promise<GeocodeResult> {
    const body = (await this.get(
      '/reverse',
      { format: 'jsonv2', lat: String(location[1]), lon: String(location[0]) },
      signal,
    )) as NominatimSearchItem
    if (!body?.display_name) throw new Error('Nominatim reverse geocode returned no result')
    const city = body.address?.city ?? body.address?.town ?? body.address?.village
    return {
      provider: 'nominatim',
      formatted: body.display_name,
      location,
      city,
      district: body.address?.district,
    }
  }
}
