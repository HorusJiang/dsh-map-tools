import { afterEach, describe, expect, it, vi } from 'vitest'
import { BaiduClient } from '../src/clients/baidu.js'

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

const client = new BaiduClient({ ak: 'test-ak', timeoutMs: 5000 })

describe('BaiduClient.route (driving)', () => {
  it('parses a driving route response', async () => {
    const fetchFn = mockFetchOnce({
      status: 0,
      message: 'ok',
      result: {
        routes: [
          {
            distance: 12700,
            duration: 1466,
            steps: [
              { instruction: '沿建国路直行', distance: 5000, duration: 600 },
              { instruction: '右转进入东三环', distance: 7700, duration: 866 },
            ],
          },
        ],
      },
    })

    const result = await client.route([116.397428, 39.90923], [116.403874, 39.915099], 'driving', {}, noopSignal)

    expect(fetchFn).toHaveBeenCalledTimes(1)
    const url = String(fetchFn.mock.calls[0][0])
    expect(url).toContain('/directionlite/v1/driving')
    expect(url).toContain('ak=test-ak')
    expect(result.provider).toBe('baidu')
    expect(result.distanceM).toBe(12700)
    expect(result.durationS).toBe(1466)
    expect(result.steps).toHaveLength(2)
  })

  it('maps bicycling mode to the riding endpoint', async () => {
    const fetchFn = mockFetchOnce({ status: 0, message: 'ok', result: { routes: [{ distance: 100, duration: 50, steps: [] }] } })
    await client.route([0, 0], [1, 1], 'bicycling', {}, noopSignal)
    expect(String(fetchFn.mock.calls[0][0])).toContain('/directionlite/v1/riding')
  })

  it('throws an actionable error on invalid ak', async () => {
    mockFetchOnce({ status: 302, message: 'Invalid ak' })
    await expect(client.route([0, 0], [1, 1], 'driving', {}, noopSignal)).rejects.toThrow(/baiduAk|lbsyun\.baidu\.com/)
  })
})

describe('BaiduClient.geocode', () => {
  it('parses a geocode response', async () => {
    const fetchFn = mockFetchOnce({
      status: 0,
      message: 'ok',
      result: { location: { lng: 116.315, lat: 39.894 } },
    })

    const result = await client.geocode('北京西站', noopSignal)

    expect(fetchFn).toHaveBeenCalledTimes(1)
    expect(String(fetchFn.mock.calls[0][0])).toContain('/geocoding/v3/')
    expect(result.provider).toBe('baidu')
    expect(result.location).toEqual([116.315, 39.894])
  })

  it('throws when no location returned', async () => {
    mockFetchOnce({ status: 0, message: 'ok', result: {} })
    await expect(client.geocode('不存在的地址', noopSignal)).rejects.toThrow(/未能解析/)
  })
})

describe('BaiduClient.poiSearch', () => {
  it('parses POI results with region', async () => {
    const fetchFn = mockFetchOnce({
      status: 0,
      message: 'ok',
      results: [
        { name: '中石化加油站', location: { lng: 116.47, lat: 39.91 }, address: '建国路1号', telephone: '010-1234', detail_info: { distance: 150 } },
      ],
    })

    const results = await client.poiSearch('加油站', { region: '北京' }, noopSignal)

    expect(fetchFn).toHaveBeenCalledTimes(1)
    expect(String(fetchFn.mock.calls[0][0])).toContain('/place/v2/search')
    expect(results[0].name).toBe('中石化加油站')
    expect(results[0].location).toEqual([116.47, 39.91])
    expect(results[0].tel).toBe('010-1234')
    expect(results[0].distanceM).toBe(150)
  })

  it('passes location/radius for around-search', async () => {
    const fetchFn = mockFetchOnce({ status: 0, message: 'ok', results: [] })
    await client.poiSearch('便利店', { location: [116.47, 39.91], radiusM: 500 }, noopSignal)
    const url = String(fetchFn.mock.calls[0][0])
    expect(url).toContain('location=39.91%2C116.47')
    expect(url).toContain('radius=500')
  })
})
