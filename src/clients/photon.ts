/**
 * Photon (photon.komoot.io) geocoding client — free, keyless, reachable on CN
 * networks (unlike nominatim.openstreetmap.org). Backed by OpenStreetMap data.
 *
 * Usage policy: free public service; be reasonable with request rate. Add a
 * `lang` parameter (default zh) for localized results.
 */
import type { GeocodeResult, LngLat } from '../types.js'

const PUBLIC_PHOTON = 'https://photon.komoot.io'

/** Photon /api search response shape (subset). */
interface PhotonResponse {
  features?: Array<{
    properties?: {
      name?: string
      city?: string
      state?: string
      country?: string
    }
    geometry?: {
      coordinates?: [number, number]
    }
  }>
}

export interface PhotonClientOptions {
  timeoutMs: number
  baseUrl?: string
  lang?: 'zh' | 'en'
}

export class PhotonClient {
  constructor(private readonly opts: PhotonClientOptions) {}

  private async get(path: string, params: Record<string, string>, signal: AbortSignal): Promise<unknown> {
    const url = new URL(`${this.opts.baseUrl ?? PUBLIC_PHOTON}${path}`)
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v)
    let res: Response
    try {
      res = await fetch(url, { signal, headers: { Accept: 'application/json' } })
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err)
      throw new Error(
        `无法访问 Photon 免费地理编码服务（${reason}）。部分网络环境下该服务不可达，建议在插件配置中设置高德 amapKey（https://console.amap.com/dev/key/app）以获得稳定的地理编码。`,
      )
    }
    if (!res.ok) throw new Error(`Photon HTTP ${res.status}: ${res.statusText}`)
    return res.json()
  }

  /** Forward geocode. */
  async geocode(query: string, signal: AbortSignal): Promise<GeocodeResult> {
    const body = (await this.get(
      '/api/',
      { q: query, limit: '1', lang: this.opts.lang ?? 'zh' },
      signal,
    )) as PhotonResponse
    const first = body.features?.[0]
    if (!first?.geometry?.coordinates) {
      throw new Error(`免费地理编码未找到该地址：${query}。请尝试提供 "lng,lat" 坐标，或配置高德 amapKey 获得更全的地址库。`)
    }
    const [lng, lat] = first.geometry.coordinates
    const props = first.properties ?? {}
    return {
      provider: 'photon',
      formatted: props.name ?? query,
      location: [lng, lat],
      city: props.city,
      district: props.state,
    }
  }

  /** Reverse geocode. */
  async reverseGeocode(location: LngLat, signal: AbortSignal): Promise<GeocodeResult> {
    const body = (await this.get(
      '/reverse',
      { lon: String(location[0]), lat: String(location[1]) },
      signal,
    )) as PhotonResponse
    const first = body.features?.[0]
    if (!first) throw new Error('Photon reverse geocode returned no result')
    const props = first.properties ?? {}
    return {
      provider: 'photon',
      formatted: [props.name, props.city, props.state].filter(Boolean).join('，') || `${location[0]},${location[1]}`,
      location,
      city: props.city,
      district: props.state,
    }
  }
}
