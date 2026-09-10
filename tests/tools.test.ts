import { describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import { validateJsonSchemaValue } from '@deepseek-ai/dsh-tools'
import { registerRouteTools, routeCardMeta, type MapClients } from '../src/tools/routes.js'
import { registerGeocodeTools } from '../src/tools/geocode.js'
import { registerPoiTool } from '../src/tools/poi.js'
import { AmapQuotaError } from '../src/clients/amap.js'
import type { ToolDefinition } from '@deepseek-ai/dsh-tools'

/** Minimal tools registry stub: captures definitions, returns disposers. */
class StubTools {
  registered = new Map<string, ToolDefinition>()
  register(def: ToolDefinition) {
    this.registered.set(def.name, def)
    return () => {
      this.registered.delete(def.name)
    }
  }
}

function makeContext(): { ctx: Context; tools: StubTools } {
  const ctx = new Context()
  const tools = new StubTools()
  ;(ctx as unknown as { tools: StubTools }).tools = tools
  return { ctx, tools }
}

const noopResolve = async (text: string): Promise<[number, number]> => {
  const m = /^(-?\d+\.?\d*),(-?\d+\.?\d*)$/.exec(text)
  if (m) return [Number(m[1]), Number(m[2])]
  throw new Error('resolve: unreachable in this test')
}

const clients: MapClients = {
  osrm: { route: async () => ({ provider: 'osrm', distanceM: 1000, durationS: 60, polyline: '', points: [], steps: [] }) } as never,
  resolve: noopResolve,
  resolveCity: async () => '',
  defaultMode: 'driving',
}

describe('tool registration', () => {
  it('registers all 7 tools with the documented names', () => {
    const { ctx, tools } = makeContext()
    registerRouteTools(ctx, clients, [])
    registerGeocodeTools(ctx, {}, [])
    registerPoiTool(ctx, { resolve: noopResolve }, [])

    const names = [...tools.registered.keys()].sort()
    expect(names).toEqual([
      'map_bicycling_route',
      'map_driving_route',
      'map_geocode',
      'map_poi_search',
      'map_reverse_geocode',
      'map_transit_route',
      'map_walking_route',
    ])
  })

  it('every route tool declares the canonical output fields', () => {
    const { ctx, tools } = makeContext()
    registerRouteTools(ctx, clients, [])
    for (const name of ['map_driving_route', 'map_transit_route', 'map_walking_route', 'map_bicycling_route']) {
      const def = tools.registered.get(name)!
      expect(def.name).toBe(name)
      expect(def.description).toBeTruthy()
      // defineTool compiles the parameter DSL into JSON Schema:
      // { type: 'object', properties: { origin: {...}, destination: {...} }, ... }
      const params = def.parameters as { type?: string; properties?: Record<string, unknown>; required?: string[] }
      expect(params.type).toBe('object')
      expect(params.properties?.origin).toBeTruthy()
      expect(params.properties?.destination).toBeTruthy()
      expect(params.required).toContain('origin')
      expect(params.required).toContain('destination')
      const out = def.output.schema as { type?: string; properties?: Record<string, unknown> }
      expect(out.type).toBe('object')
      const props = out.properties ?? {}
      for (const f of ['provider', 'distanceM', 'durationS', 'steps']) {
        expect(props[f], `route tool ${name} missing output field ${f}`).toBeTruthy()
      }
    }
  })

  it('disposers unregister tools when invoked', () => {
    const { ctx, tools } = makeContext()
    const disposers: Array<() => void> = []
    registerRouteTools(ctx, clients, disposers)
    expect(tools.registered.size).toBe(4)
    for (const d of disposers) d()
    expect(tools.registered.size).toBe(0)
  })

  it('每个路线工具都声明 presentationMeta，并声明 geometry 输出字段', () => {
    const { ctx, tools } = makeContext()
    registerRouteTools(ctx, clients, [])
    for (const name of ['map_driving_route', 'map_transit_route', 'map_walking_route', 'map_bicycling_route']) {
      const def = tools.registered.get(name)!
      expect(typeof def.output.presentationMeta, `${name} 缺少 presentationMeta`).toBe('function')
      const props = (def.output.schema as { properties?: Record<string, unknown> }).properties ?? {}
      expect(props.geometry, `${name} 的 schema 缺少 geometry`).toBeTruthy()
    }
  })

  it('输出 schema 真的接受 geometry 的嵌套坐标数组（走运行时校验，不只看声明）', () => {
    const { ctx, tools } = makeContext()
    registerRouteTools(ctx, clients, [])
    const def = tools.registered.get('map_driving_route')!
    const geometry: Array<[number, number]> = []
    for (let i = 0; i < 300; i += 1) geometry.push([116 + i * 0.0001, 39 + i * 0.0001])
    const value = {
      provider: 'amap',
      distanceM: 42300,
      durationS: 2700,
      polyline: '直行 → 右转',
      steps: [{ instruction: '直行', distanceM: 100, durationS: 10 }],
      geometry,
    }
    expect(validateJsonSchemaValue(def.output.schema, value, 'value')).toEqual([])
    // 反向验证：坏几何必须被拒（证明上一条不是空转）。
    const broken = { ...value, geometry: [['a', 'b']] }
    expect(validateJsonSchemaValue(def.output.schema, broken, 'value').length).toBeGreaterThan(0)
  })
})

describe('routeCardMeta（卡片元数据投影）', () => {
  const line: Array<[number, number]> = [[116.37, 39.86], [116.6, 40.07]]

  it('投影出卡片需要的字段，首尾即起终点', () => {
    const meta = routeCardMeta({
      provider: 'amap',
      distanceM: 42300,
      durationS: 2700,
      steps: [{ instruction: 'a', distanceM: 1, durationS: 1 }],
      geometry: line,
    })
    expect(meta.v).toBe(1)
    expect(meta.kind).toBe('route')
    expect(meta.provider).toBe('amap')
    expect(meta.distanceM).toBe(42300)
    expect(meta.stepCount).toBe(1)
    expect(meta.alternatives).toBe(0)
    expect(meta.line?.[0]).toEqual([116.37, 39.86])
    expect(meta.line?.[1]).toEqual([116.6, 40.07])
  })

  it('几何不足两点时省略 line（客户端退回文本卡片）', () => {
    expect(routeCardMeta({ provider: 'amap', distanceM: 0, durationS: 0, steps: [], geometry: [] }).line).toBeUndefined()
    expect(routeCardMeta({ provider: 'amap', distanceM: 0, durationS: 0, steps: [], geometry: [[116, 39]] }).line).toBeUndefined()
    expect(routeCardMeta({ provider: 'amap', distanceM: 0, durationS: 0, steps: [] }).line).toBeUndefined()
  })

  it('未知 provider 兜底成 amap，坏数值退成 0', () => {
    const meta = routeCardMeta({
      provider: 'baidu',
      distanceM: Number.NaN,
      durationS: Number.NaN,
      steps: [{ instruction: 'a', distanceM: 0, durationS: 0 }],
      geometry: line,
    })
    expect(meta.provider).toBe('amap')
    expect(meta.distanceM).toBe(0)
    expect(meta.durationS).toBe(0)
  })

  it('长几何在投影时就被抽稀（元数据要写进会话日志）', () => {
    const long: Array<[number, number]> = []
    for (let i = 0; i < 3000; i += 1) long.push([116 + i * 0.0001, 39 + i * 0.0001])
    const meta = routeCardMeta({ provider: 'osrm', distanceM: 1, durationS: 1, steps: [], geometry: long })
    expect(meta.provider).toBe('osrm')
    expect(meta.line!.length).toBeLessThanOrEqual(200)
  })

  it('经由 defineTool 的 presentationMeta 也能跑通（真实契约）', () => {
    const { ctx, tools } = makeContext()
    registerRouteTools(ctx, clients, [])
    const def = tools.registered.get('map_driving_route')!
    const meta = def.output.presentationMeta!(
      { origin: '0,0', destination: '1,1' },
      {
        provider: 'osrm',
        distanceM: 1000,
        durationS: 60,
        steps: [{ instruction: 'a', distanceM: 1, durationS: 1 }],
        geometry: line,
      },
    )
    expect(meta).toMatchObject({ v: 1, kind: 'route', provider: 'osrm', distanceM: 1000 })
  })
})

describe('起终点可读名称（坐标入参时反查）', () => {
  const execCtx = { signal: new AbortController().signal } as never

  /** 一个路线成功的假高德客户端，附带计数用的反查。 */
  function namedClients(options: {
    reverse?: (location: [number, number]) => Promise<unknown>
    resolve?: (text: string, signal: AbortSignal) => Promise<[number, number]>
  } = {}) {
    const { ctx, tools } = makeContext()
    const clients: MapClients = {
      amap: {
        route: async () => ({
          provider: 'amap',
          distanceM: 1000,
          durationS: 600,
          polyline: '',
          points: [],
          geometry: [[116.378, 39.865], [116.6, 40.07]],
          steps: [],
        }),
        reverseGeocode: options.reverse ?? (async () => { throw new Error('reverseGeocode should not be called') }),
      } as never,
      osrm: { route: async () => ({ provider: 'osrm', distanceM: 1, durationS: 1, polyline: '', points: [], geometry: [], steps: [] }) } as never,
      resolve: options.resolve ?? noopResolve,
      resolveCity: async () => '',
      defaultMode: 'driving',
    }
    registerRouteTools(ctx, clients, [])
    return tools
  }

  it('坐标入参：反查并裁成可读地名，同时进入卡片 meta', async () => {
    const calls: Array<[number, number]> = []
    const tools = namedClients({
      reverse: async (location) => {
        calls.push(location)
        const north = location[1] > 40
        // 真实的 `formatted_address` 是"省市区街道+具体位置"连写。**必须带省**：
        // startsWith 从整串开头比，列表里少了"湖南省"，后面几个前缀就一个也
        // 匹配不上，整串会原样留下（这个 mock 原来省略了省，所以漏掉了该缺陷）。
        return {
          provider: 'amap',
          formatted: north
            ? '湖南省长沙市长沙县黄花镇长沙黄花国际机场'
            : '湖南省长沙市雨花区东山街道长沙南站',
          location,
          province: '湖南省',
          city: '长沙市',
          district: north ? '长沙县' : '雨花区',
          township: north ? '黄花镇' : '东山街道',
        }
      },
    })
    const def = tools.registered.get('map_driving_route')!
    const result = (await def.execute({ origin: '116.378,39.865', destination: '116.6,40.07' }, execCtx)) as {
      fromName?: string
      toName?: string
    }
    expect(result.fromName).toBe('长沙南站')
    expect(result.toName).toBe('长沙黄花国际机场')
    expect(calls).toHaveLength(2)

    const meta = def.output.presentationMeta!({ origin: '116.378,39.865', destination: '116.6,40.07' }, result as never)
    expect(meta).toMatchObject({ kind: 'route', fromName: '长沙南站', toName: '长沙黄花国际机场' })
  })

  it('地名入参：不打额外的反查请求（省配额）', async () => {
    // reverseGeocode 默认实现会抛错：被调到就说明多发了请求。
    const tools = namedClients({ resolve: async () => [116.378, 39.865] })
    const def = tools.registered.get('map_driving_route')!
    const result = (await def.execute({ origin: '北京南站', destination: '首都机场' }, execCtx)) as {
      fromName?: string
      toName?: string
    }
    expect(result.fromName).toBe('北京南站')
    expect(result.toName).toBe('首都机场')
  })

  it('反查失败不影响路线结果（退回坐标原文）', async () => {
    const tools = namedClients({ reverse: async () => { throw new Error('quota') } })
    const def = tools.registered.get('map_driving_route')!
    const result = (await def.execute({ origin: '0,0', destination: '1,1' }, execCtx)) as {
      fromName?: string
      toName?: string
      distanceM: number
    }
    expect(result.distanceM).toBe(1000)
    expect(result.fromName).toBe('0,0')
    expect(result.toName).toBe('1,1')
  })
})

describe('route tool OSRM fallback on Amap quota errors', () => {
  const execCtx = { signal: new AbortController().signal } as never

  function amapQuotaClients(): { clients: MapClients; tools: ReturnType<typeof makeContext>['tools'] } {
    const { ctx, tools } = makeContext()
    const clients: MapClients = {
      amap: {
        route: async () => { throw new AmapQuotaError('10021', 'CUQPS_HAS_EXCEEDED_THE_LIMIT', true) },
      } as never,
      osrm: {
        route: async () => ({ provider: 'osrm', distanceM: 5000, durationS: 300, polyline: '', points: [], steps: [{ instruction: 'OSRM step', distanceM: 5000, durationS: 300 }] }),
      } as never,
      resolve: noopResolve,
      resolveCity: async () => '',
      defaultMode: 'driving',
    }
    registerRouteTools(ctx, clients, [])
    return { clients, tools }
  }

  it('driving falls back to OSRM when Amap hits a quota error', async () => {
    const { tools } = amapQuotaClients()
    const def = tools.registered.get('map_driving_route')!
    const result = await def.execute({ origin: '0,0', destination: '1,1' }, execCtx)
    expect((result as { provider: string }).provider).toBe('osrm')
    expect((result as { steps: Array<{ instruction: string }> }).steps[0].instruction).toBe('OSRM step')
  })

  it('transit reports a friendly message instead of falling back', async () => {
    const { tools } = amapQuotaClients()
    const def = tools.registered.get('map_transit_route')!
    await expect(def.execute({ origin: '0,0', destination: '1,1' }, execCtx)).rejects.toThrow(/自动降级 OSRM/)
  })
})
