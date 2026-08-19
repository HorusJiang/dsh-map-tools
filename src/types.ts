/** Shared types for dsh-map-tools. */

/** A normalized geo point: [longitude, latitude]. */
export type LngLat = [number, number]

/** One route leg/step instruction, normalized across providers. */
export interface RouteStep {
  /** Human-readable instruction, e.g. "沿北京路向西行驶 300 米". */
  instruction: string
  /** Distance in meters. */
  distanceM: number
  /** Duration in seconds. */
  durationS: number
}

/** Normalized route result, provider-agnostic. */
export interface RouteResult {
  /** Provider that produced this result: 'amap' | 'osrm'. */
  provider: 'amap' | 'osrm'
  /** Total distance in meters. */
  distanceM: number
  /** Total duration in seconds. */
  durationS: number
  /** Compact polyline string (Amap format) or GeoJSON line, depending on provider. */
  polyline: string
  /** Waypoint coordinates [lng, lat] along the route (sampled). */
  points: LngLat[]
  /** Step-by-step instructions. */
  steps: RouteStep[]
}

/** Normalized geocode result. */
export interface GeocodeResult {
  /** Provider: 'amap' | 'nominatim' | 'photon'. */
  provider: 'amap' | 'nominatim' | 'photon'
  /** Matched display name. */
  formatted: string
  /** Normalized [lng, lat]. */
  location: LngLat
  /** Optional structured fields. */
  city?: string
  district?: string
  adcode?: string
}

/** Normalized POI search result. */
export interface PoiResult {
  name: string
  location: LngLat
  /** POI category/type label. */
  type?: string
  address?: string
  tel?: string
  /** Distance in meters from the query location (around-search only). */
  distanceM?: number
}

/** One coordinate pair from a `lng,lat` or `lat,lng` string. */
export function parseLngLat(text: string): LngLat | null {
  const m = /^\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*$/.exec(text)
  if (!m) return null
  const lng = Number(m[1])
  const lat = Number(m[2])
  if (lng < -180 || lng > 180 || lat < -90 || lat > 90) return null
  return [lng, lat]
}

/** Format a pair as `lng,lat`. */
export function formatLngLat([lng, lat]: LngLat): string {
  return `${lng},${lat}`
}
