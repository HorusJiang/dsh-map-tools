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
    // 回归护栏：不请求 show_fields，高德 v5 就不返回折线（几何退化成直线）
    // 也不返回 cost.duration（方案耗时变成 0）。这是实测出来的坑。
    expect(url).toContain('show_fields=polyline')
    expect(result.provider).toBe('amap')
    expect(result.distanceM).toBe(12700)
    expect(result.durationS).toBe(1466)
    expect(result.steps).toHaveLength(2)
  })

  it('解析 v5 的真实字段名（step_distance / cost.duration）', async () => {
    const local = new AmapClient({ key: 'test-key', timeoutMs: 5000, maxQps: 1000 })
    mockFetchOnce({
      status: '1',
      info: 'OK',
      route: {
        paths: [
          {
            distance: '67100',
            cost: { duration: '2718', tolls: '5' },
            steps: [
              { instruction: '直行', step_distance: '15', cost: { duration: '6' }, polyline: '121.5,31.5;121.51,31.51' },
              { instruction: '右转', step_distance: '1000', cost: { duration: '120' }, polyline: '121.51,31.51;121.6,31.6' },
            ],
          },
        ],
      },
    })

    const result = await local.route([121.5, 31.5], [121.6, 31.6], 'driving', {}, noopSignal)

    expect(result.distanceM).toBe(67100)
    // v5 的耗时在 cost.duration —— 旧代码读 duration，拿到的是 0。
    expect(result.durationS).toBe(2718)
    expect(result.steps[0]).toMatchObject({ distanceM: 15, durationS: 6 })
    expect(result.steps[1]).toMatchObject({ distanceM: 1000, durationS: 120 })
    expect(result.geometry).toEqual([[121.5, 31.5], [121.51, 31.51], [121.6, 31.6]])
  })

  it('从各步折线拼出真实路线几何（卡片示意图的数据源）', async () => {
    // 独立实例 + 独立坐标：共享 client 有 TTL 路线缓存，复用坐标会命中旧响应。
    const local = new AmapClient({ key: 'test-key', timeoutMs: 5000, maxQps: 1000 })
    mockFetchOnce({
      status: '1',
      info: 'OK',
      route: {
        paths: [
          {
            distance: '12700',
            duration: '1466',
            steps: [
              { instruction: '直行', distance: '5000', duration: '600', polyline: '121.1,31.1;121.2,31.2' },
              // 与上一步末尾重复的点应被去重（几何首尾即起终点）。
              { instruction: '右转', distance: '7700', duration: '866', polyline: '121.2,31.2;121.3,31.35' },
            ],
          },
        ],
      },
    })

    const result = await local.route([121.1, 31.1], [121.3, 31.35], 'driving', {}, noopSignal)

    expect(result.geometry).toEqual([
      [121.1, 31.1],
      [121.2, 31.2],
      [121.3, 31.35],
    ])
  })

  it('响应里没有折线时退化成起终点直线', async () => {
    const local = new AmapClient({ key: 'test-key', timeoutMs: 5000, maxQps: 1000 })
    mockFetchOnce({
      status: '1',
      info: 'OK',
      route: { paths: [{ distance: '100', duration: '10', steps: [{ instruction: '直行', distance: '100', duration: '10' }] }] },
    })

    const result = await local.route([121.4, 31.4], [121.5, 31.45], 'driving', {}, noopSignal)

    expect(result.geometry).toEqual([[121.4, 31.4], [121.5, 31.45]])
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

describe('AmapClient.route (transit geometry)', () => {
  it('拼接步行折线 + 公交线路折线 + 火车站点', async () => {
    // city1/city2 已提供 → 不再触发两次 geocode，整条路径只发一个请求。
    const local = new AmapClient({ key: 'test-key', timeoutMs: 5000, maxQps: 1000 })
    mockFetchOnce({
      status: '1',
      info: 'OK',
      route: {
        transits: [
          {
            distance: '30000',
            duration: '3600',
            segments: [
              {
                walking: {
                  distance: '500',
                  duration: '400',
                  steps: [{ polyline: '116.378,39.865;116.379,39.866' }],
                },
              },
              {
                bus: {
                  buslines: [
                    {
                      name: '机场专线',
                      polyline: '116.379,39.866;116.5,40.0',
                      departure_stop: { name: '南站', location: '116.379,39.866' },
                      arrival_stop: { name: 'T3', location: '116.5,40.0' },
                    },
                  ],
                },
              },
              {
                railway: {
                  departure_stop: { name: 'T3', location: '116.5,40.0' },
                  arrival_stop: { name: 'T2', location: '116.6,40.07' },
                },
              },
            ],
          },
        ],
      },
    })

    const result = await local.route([116.378, 39.865], [116.6, 40.07], 'transit', { city1: '北京市', city2: '北京市' }, noopSignal)

    // 各段碎片按顺序拼接，相邻重复点被去重。
    expect(result.geometry).toEqual([
      [116.378, 39.865],
      [116.379, 39.866],
      [116.5, 40.0],
      [116.6, 40.07],
    ])
    expect(result.steps.map((s) => s.instruction)).toEqual([
      '步行 1',
      '乘坐 机场专线（南站 → T3）',
      '换乘',
    ])
  })
})

describe('AmapClient.staticMap（真地图图片）', () => {
  const pngResponse = (): Response => ({
    ok: true,
    status: 200,
    headers: { get: (name: string) => (name.toLowerCase() === 'content-type' ? 'image/png;charset=UTF-8' : null) },
    arrayBuffer: async () => new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a]).buffer,
  }) as unknown as Response

  /** 高德出错时返回 JSON 而不是图片（这里要带上 headers，真 fetch 一定有）。 */
  const jsonError = (body: unknown): Response => ({
    ok: true,
    status: 200,
    headers: { get: () => 'application/json;charset=UTF-8' },
    arrayBuffer: async () => new TextEncoder().encode(JSON.stringify(body)).buffer,
  }) as unknown as Response

  const line: Array<[number, number]> = [[116.378, 39.865], [116.45, 39.93], [116.6, 40.07]]

  it('按官方格式请求：paths 用逗号分隔（竖线分隔会被高德拒成 20003）', async () => {
    const fetchFn = vi.fn().mockResolvedValue(pngResponse())
    vi.stubGlobal('fetch', fetchFn)
    const local = new AmapClient({ key: 'test-key', timeoutMs: 5000, maxQps: 1000 })

    const bytes = await local.staticMap(line, { width: 640, height: 260 }, noopSignal)

    expect(bytes.length).toBeGreaterThan(0)
    const url = decodeURIComponent(String(fetchFn.mock.calls[0][0]))
    expect(url).toContain('/v3/staticmap')
    expect(url).toContain('size=640*260')
    // weight,color,transparency,fillcolor,fillTransparency:坐标
    expect(url).toMatch(/paths=5,0x4F8CFF,1,,:/)
    expect(url).toContain('116.378,39.865;')
    // 起终点标注
    expect(url).toContain('mid,0x22A06B,起:116.378,39.865')
    expect(url).toContain('mid,0xE05C5C,终:116.6,40.07')
    // 取景框交给高德自动适配：**绝不能**自己传 location/zoom。
    // 高德静态地图的 zoom 与标准 Web Mercator 差一级，自己按 Mercator 公式
    // 算出的 zoom 会让路线溢出画布；而高德不报错，只是静默丢掉整条 paths，
    // 现象就是"有底图、没路线"。
    expect(url).not.toMatch(/[?&]location=/)
    expect(url).not.toMatch(/[?&]zoom=/)
  })

  it('退化路线（所有点重合）没有外包框可适配，退回定点取景且不传 paths', async () => {
    const fetchFn = vi.fn().mockResolvedValue(pngResponse())
    vi.stubGlobal('fetch', fetchFn)
    const local = new AmapClient({ key: 'test-key', timeoutMs: 5000, maxQps: 1000 })

    await local.staticMap([[116.4, 39.9], [116.4, 39.9]], { width: 640, height: 260 }, noopSignal)

    const url = decodeURIComponent(String(fetchFn.mock.calls[0][0]))
    expect(url).toMatch(/[?&]location=116\.4,39\.9/)
    expect(url).toMatch(/[?&]zoom=16/)
    expect(url).not.toMatch(/[?&]paths=/)
  })

  it('按参数缓存：同一张图只请求一次', async () => {
    const fetchFn = vi.fn().mockResolvedValue(pngResponse())
    vi.stubGlobal('fetch', fetchFn)
    const local = new AmapClient({ key: 'test-key', timeoutMs: 5000, maxQps: 1000 })

    await local.staticMap(line, { width: 640, height: 260 }, noopSignal)
    await local.staticMap(line, { width: 640, height: 260 }, noopSignal)

    expect(fetchFn).toHaveBeenCalledTimes(1)
  })

  it('服务端返回 JSON 错误体（非图片）时翻译成可读异常', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonError({ status: '0', info: 'INVALID_USER_KEY', infocode: '10003' })))
    const local = new AmapClient({ key: 'bad-key', timeoutMs: 5000, maxQps: 1000 })
    await expect(local.staticMap(line, { width: 640, height: 260 }, noopSignal)).rejects.toThrow(/amapKey|console\.amap\.com/)
  })

  it('配额超限归类为 AmapQuotaError', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonError({ status: '0', info: 'CUQPS_HAS_EXCEEDED_THE_LIMIT', infocode: '10021' })))
    const local = new AmapClient({ key: 'test-key', timeoutMs: 5000, maxQps: 1000 })
    await expect(local.staticMap(line, { width: 640, height: 260 }, noopSignal)).rejects.toBeInstanceOf(AmapQuotaError)
  })

  it('少于两个点直接拒绝（不浪费一次请求）', async () => {
    const fetchFn = vi.fn().mockResolvedValue(pngResponse())
    vi.stubGlobal('fetch', fetchFn)
    const local = new AmapClient({ key: 'test-key', timeoutMs: 5000, maxQps: 1000 })
    await expect(local.staticMap([[116.4, 39.9]], { width: 640, height: 260 }, noopSignal)).rejects.toThrow(/两个坐标点/)
    expect(fetchFn).not.toHaveBeenCalled()
  })

  it('尺寸被钳制到高德限制内（64..1024）', async () => {
    const fetchFn = vi.fn().mockResolvedValue(pngResponse())
    vi.stubGlobal('fetch', fetchFn)
    const local = new AmapClient({ key: 'test-key', timeoutMs: 5000, maxQps: 1000 })
    await local.staticMap(line, { width: 99999, height: 1 }, noopSignal)
    expect(String(fetchFn.mock.calls[0][0])).toContain('size=1024*64')
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

describe('AmapClient.reverseGeocode', () => {
  it('publishes province/district/township（卡片要把长地址裁成短地名）', async () => {
    const fetchFn = mockFetchOnce({
      status: '1',
      info: 'OK',
      regeocode: {
        formatted_address: '湖南省长沙市雨花区东山街道长沙南站',
        addressComponent: {
          province: '湖南省',
          city: '长沙市',
          district: '雨花区',
          township: '东山街道',
          adcode: '430111',
        },
      },
    })

    const result = await client.reverseGeocode([113.065, 28.147], noopSignal)

    expect(fetchFn).toHaveBeenCalledTimes(1)
    expect(String(fetchFn.mock.calls[0][0])).toContain('/v3/geocode/regeo')
    expect(result.formatted).toBe('湖南省长沙市雨花区东山街道长沙南站')
    expect(result.province).toBe('湖南省')
    expect(result.city).toBe('长沙市')
    expect(result.district).toBe('雨花区')
    expect(result.township).toBe('东山街道')
    expect(result.adcode).toBe('430111')
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
