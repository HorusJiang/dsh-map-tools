import { afterEach, describe, expect, it, vi } from 'vitest'
import { AmapClient, AmapQuotaError } from '../src/clients/amap.js'

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

// High maxQps so the shared instance never slows the existing one-request tests.
const client = new AmapClient({ key: 'test-key', timeoutMs: 5000, maxQps: 1000 })

describe('AmapClient.route (driving)', () => {
  it('parses a driving route response', async () => {
    const fetchFn = mockFetchOnce({
      status: '1',
      info: 'OK',
      route: {
        paths: [
          {
            distance: '12700',
            duration: '1466',
            steps: [
              { instruction: '直行进入建国路', distance: '5000', duration: '600' },
              { instruction: '右转进入东三环', distance: '7700', duration: '866' },
            ],
          },
        ],
      },
    })

    const result = await client.route([116.397428, 39.90923], [116.403874, 39.915099], 'driving', {}, noopSignal)

    expect(fetchFn).toHaveBeenCalledTimes(1)
    const url = String(fetchFn.mock.calls[0][0])
    expect(url).toContain('/v5/direction/driving')
    expect(url).toContain('key=test-key')
    expect(result.provider).toBe('amap')
    expect(result.distanceM).toBe(12700)
    expect(result.durationS).toBe(1466)
    expect(result.steps).toHaveLength(2)
  })

  it('throws on Amap API error', async () => {
    mockFetchOnce({ status: '0', info: 'INVALID_USER_KEY', infocode: '10001' })
    await expect(client.route([0, 0], [1, 1], 'driving', {}, noopSignal)).rejects.toThrow(/10001/)
  })

  it('throws a helpful error when the key is invalid', async () => {
    mockFetchOnce({ status: '0', info: 'INVALID_USER_KEY', infocode: '10001' })
    await expect(client.route([0, 0], [1, 1], 'driving', {}, noopSignal)).rejects.toThrow(/amapKey|console\.amap\.com/)
  })
})

describe('AmapClient.geocode', () => {
  it('parses a geocode response', async () => {
    const fetchFn = mockFetchOnce({
      status: '1',
      info: 'OK',
      geocodes: [
        {
          formatted_address: '北京市朝阳区建国路88号',
          location: '116.460929,39.909673',
          city: '北京市',
          district: '朝阳区',
          adcode: '110105',
        },
      ],
    })

    const result = await client.geocode('建国路88号', noopSignal)

    expect(fetchFn).toHaveBeenCalledTimes(1)
    expect(String(fetchFn.mock.calls[0][0])).toContain('/v3/geocode/geo')
    expect(result.location).toEqual([116.460929, 39.909673])
    expect(result.city).toBe('北京市')
    expect(result.district).toBe('朝阳区')
  })

  it('throws when no geocode result', async () => {
    mockFetchOnce({ status: '1', info: 'OK', geocodes: [] })
    await expect(client.geocode('不存在的地址', noopSignal)).rejects.toThrow(/could not geocode/)
  })
})

describe('AmapClient.poiSearch', () => {
  it('parses POI text search results', async () => {
    const fetchFn = mockFetchOnce({
      status: '1',
      info: 'OK',
      pois: [
        { name: '中石化加油站', location: '116.47,39.91', type: '汽车服务', address: '建国路1号', tel: '010-1234' },
        { name: '中石油加油站', location: '116.48,39.92', type: '汽车服务', address: '建国路2号', tel: '010-5678' },
      ],
    })

    const results = await client.poiSearch('加油站', { region: '北京' }, noopSignal)

    expect(fetchFn).toHaveBeenCalledTimes(1)
    expect(String(fetchFn.mock.calls[0][0])).toContain('/v5/place/text')
    expect(results).toHaveLength(2)
    expect(results[0].name).toBe('中石化加油站')
    expect(results[0].location).toEqual([116.47, 39.91])
    expect(results[0].tel).toBe('010-1234')
  })
})

describe('AmapClient.poiAround', () => {
  it('parses around-search results with distance', async () => {
    const fetchFn = mockFetchOnce({
      status: '1',
      info: 'OK',
      pois: [
        { name: '便利店', location: '116.470001,39.910001', type: '购物', distance: '150' },
      ],
    })

    const results = await client.poiAround([116.47, 39.91], '便利店', { radiusM: 500 }, noopSignal)

    expect(fetchFn).toHaveBeenCalledTimes(1)
    expect(String(fetchFn.mock.calls[0][0])).toContain('/v5/place/around')
    expect(String(fetchFn.mock.calls[0][0])).toContain('radius=500')
    expect(results[0].distanceM).toBe(150)
  })
})

describe('AmapClient quota protection', () => {
  const okRoute = (distance: string, duration: string) => ({
    status: '1',
    info: 'OK',
    route: { paths: [{ distance, duration, steps: [{ instruction: '直行', distance: '100', duration: '10' }] }] },
  })

  it('classifies QPS-exceeded (10021) as a retryable quota error', async () => {
    mockFetchOnce({ status: '0', info: 'CUQPS_HAS_EXCEEDED_THE_LIMIT', infocode: '10021' })
    await expect(client.route([0, 0], [1, 1], 'driving', {}, noopSignal)).rejects.toBeInstanceOf(AmapQuotaError)
    await expect(client.route([0, 0], [1, 1], 'driving', {}, noopSignal)).rejects.toMatchObject({ retryable: true })
  })

  it('retries a retryable quota error before giving up', async () => {
    const fn = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ status: '0', info: 'CUQPS_HAS_EXCEEDED_THE_LIMIT', infocode: '10021' }),
      } as unknown as Response)
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => okRoute('12700', '1466'),
      } as unknown as Response)
    vi.stubGlobal('fetch', fn)

    const localClient = new AmapClient({ key: 'test-key', timeoutMs: 5000, maxQps: 1000 })
    const result = await localClient.route([0, 0], [1, 1], 'driving', {}, noopSignal)

    expect(fn).toHaveBeenCalledTimes(2)
    expect(result.provider).toBe('amap')
    expect(result.distanceM).toBe(12700)
  })

  it('classifies daily-quota-exceeded (10022) as non-retryable', async () => {
    mockFetchOnce({ status: '0', info: 'DAILY_QUERY_OVER_LIMIT', infocode: '10022' })
    await expect(client.route([0, 0], [1, 1], 'driving', {}, noopSignal)).rejects.toMatchObject({ retryable: false })
  })

  it('rate-limits concurrent requests to maxQps', async () => {
    const started: number[] = []
    const fn = vi.fn().mockImplementation(async () => {
      started.push(Date.now())
      return {
        ok: true,
        status: 200,
        json: async () => okRoute('1000', '100'),
      } as unknown as Response
    })
    vi.stubGlobal('fetch', fn)

    // maxQps = 20 → 50ms min interval between request starts.
    const localClient = new AmapClient({ key: 'test-key', timeoutMs: 5000, maxQps: 20 })
    await Promise.all([
      localClient.route([0, 0], [1, 1], 'driving', {}, noopSignal),
      localClient.route([2, 2], [3, 3], 'driving', {}, noopSignal),
    ])

    expect(fn).toHaveBeenCalledTimes(2)
    expect(started).toHaveLength(2)
    expect(started[1] - started[0]).toBeGreaterThanOrEqual(40)
  })

  it('serves repeat geocodes from cache without hitting the network again', async () => {
    const fn = mockFetchOnce({
      status: '1',
      info: 'OK',
      geocodes: [
        { formatted_address: '北京市朝阳区建国路88号', location: '116.460929,39.909673', city: '北京市', adcode: '110105' },
      ],
    })

    const localClient = new AmapClient({ key: 'test-key', timeoutMs: 5000, maxQps: 1000 })
    const first = await localClient.geocode('建国路88号', noopSignal)
    const second = await localClient.geocode('建国路88号', noopSignal)

    expect(fn).toHaveBeenCalledTimes(1)
    expect(second).toEqual(first)
  })
})
