import { afterEach, describe, expect, it, vi } from 'vitest'
import { NominatimClient } from '../src/clients/nominatim.js'

const noopSignal = new AbortController().signal

function mockFetchOnce(body: unknown, ok = true, status = 200) {
  const fn = vi.fn().mockResolvedValue({
    ok,
    status,
    json: async () => body,
  } as unknown as Response)
  vi.stubGlobal('fetch', fn)
  return fn
}

afterEach(() => {
  vi.unstubAllGlobals()
})

const client = new NominatimClient({ timeoutMs: 5000, userAgent: 'dsh-map-tools-test/0.1.0' })

describe('NominatimClient.geocode', () => {
  it('parses a search result', async () => {
    const fetchFn = mockFetchOnce([
      {
        display_name: 'Beijing Tiananmen, Donghuamen, Dongcheng District, Beijing, China',
        lat: '39.9087',
        lon: '116.3975',
        address: { city: 'Beijing', district: 'Dongcheng' },
      },
    ])

    const result = await client.geocode('Tiananmen', noopSignal)

    expect(fetchFn).toHaveBeenCalledTimes(1)
    const url = String(fetchFn.mock.calls[0][0])
    expect(url).toContain('/search')
    expect(url).toContain('format=jsonv2')
    expect(result.location).toEqual([116.3975, 39.9087])
    expect(result.city).toBe('Beijing')
  })

  it('throws when no result found', async () => {
    mockFetchOnce([])
    await expect(client.geocode('nowhere', noopSignal)).rejects.toThrow(/could not geocode/)
  })

  it('wraps network failures with the Amap guidance hint (CN-network case)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('fetch failed')))
    await expect(client.geocode('北京西站', noopSignal)).rejects.toThrow(/Nominatim|高德|amapKey/)
  })
})

describe('NominatimClient.reverseGeocode', () => {
  it('parses a reverse result', async () => {
    mockFetchOnce({
      display_name: 'Tiananmen, Donghuamen, Dongcheng District, Beijing, China',
      lat: '39.9087',
      lon: '116.3975',
      address: { city: 'Beijing' },
    })

    const result = await client.reverseGeocode([116.3975, 39.9087], noopSignal)

    expect(result.formatted).toContain('Tiananmen')
    expect(result.location).toEqual([116.3975, 39.9087])
  })
})
