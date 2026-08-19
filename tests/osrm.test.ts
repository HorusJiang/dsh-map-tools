import { afterEach, describe, expect, it, vi } from 'vitest'
import { OsrmClient } from '../src/clients/osrm.js'

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

describe('OsrmClient.route', () => {
  it('parses a successful route response', async () => {
    mockFetchOnce({
      code: 'Ok',
      routes: [
        {
          distance: 1270.7,
          duration: 146.6,
          geometry: { coordinates: [[116.3974, 39.9092], [116.4001, 39.9121], [116.4039, 39.9151]] },
          legs: [
            {
              steps: [
                { name: '南池子大街', distance: 300, duration: 40, maneuver: { instruction: '右转', modifier: 'right' } },
                { name: '东华门大街', distance: 970, duration: 106, maneuver: { instruction: '直行', modifier: 'straight' } },
              ],
            },
          ],
        },
      ],
    })

    const client = new OsrmClient({ timeoutMs: 5000 })
    const result = await client.route([116.397428, 39.90923], [116.403874, 39.915099], 'driving', noopSignal)

    expect(result.provider).toBe('osrm')
    expect(result.distanceM).toBe(1270.7)
    expect(result.durationS).toBe(146.6)
    expect(result.steps).toHaveLength(2)
    expect(result.steps[0].instruction).toContain('南池子大街')
    expect(result.points).toHaveLength(3)
    expect(result.polyline).toBeTruthy()
  })

  it('throws a helpful error when the route code is not Ok', async () => {
    mockFetchOnce({ code: 'NoRoute', routes: [] })
    const client = new OsrmClient({ timeoutMs: 5000 })
    await expect(client.route([0, 0], [1, 1], 'driving', noopSignal)).rejects.toThrow(/NoRoute/)
  })

  it('throws a helpful error on network failure', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('fetch failed')))
    const client = new OsrmClient({ timeoutMs: 5000 })
    await expect(client.route([0, 0], [1, 1], 'driving', noopSignal)).rejects.toThrow(/OSRM|amapKey|Nominatim/)
  })

  it('throws on HTTP error status', async () => {
    mockFetchOnce({}, false, 503)
    const client = new OsrmClient({ timeoutMs: 5000 })
    await expect(client.route([0, 0], [1, 1], 'driving', noopSignal)).rejects.toThrow(/503/)
  })
})
