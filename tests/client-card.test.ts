/**
 * 路线卡片的纯函数测试。
 *
 * 直接加载随包发布的 `client/client.js`（浏览器加载的就是同一份字节）：
 * 该文件只调用 `window.__ModuleLoader__.load({ id, factory })`，这里用一个
 * 假 window 捕获 factory，再手工执行它拿到 exports。
 */

import { beforeAll, describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'

/** factory 里 require 到的模块：卡片挂载会 require React，其余一律不许出现。 */
const fakeReact = {
  createElement: (type: unknown, props: unknown, ...children: unknown[]) => ({ type, props, children }),
  useState: (initial: unknown) => [initial, () => {}] as const,
  useCallback: (fn: unknown) => fn,
  useEffect: () => {},
}

const requireStub = (spec: string): unknown => {
  if (spec === 'react') return fakeReact
  throw new Error(`unexpected require: ${spec}`)
}

/** 配置卡片的纯函数与注册入口（客户端槽位契约）。 */
interface CardInternals {
  ConfigCard: (react: unknown) => (props: unknown) => { type: string; children: unknown[] }
  registerCard: (ctx: unknown) => void
  registerOne: (scope: unknown, card: unknown, seat: { seat: string; options: Record<string, unknown> }) => void
  BUNDLE_SEAT: string
  LEGACY_SEAT: string
  BUNDLE: string
  CONFIG_URL: string
  DEFAULT_TIMEOUT_MS: number
  TIMEOUT_MIN_MS: number
  TIMEOUT_MAX_MS: number
  parseTimeout: (text: unknown) => number | null
  effectiveConfig: (summary: unknown) => {
    provider: string
    hasAmapKey: boolean
    timeoutMs: number
    configPath: string
  }
  draftFrom: (summary: unknown) => { provider: string; amapKey: string; timeoutMs: string }
  draftValid: (draft: unknown) => boolean
  configPatch: (draft: unknown, summary: unknown) => Record<string, unknown>
  isDirty: (draft: unknown, summary: unknown) => boolean
  statusLine: (summary: unknown) => string
}

interface RouteInternals {
  ROUTE_TOOLS: Record<string, { mode: string; label: string }>
  parseArgs: (block: unknown) => Record<string, unknown> | null
  callSummary: (block: unknown) => string
  flattenContent: (block: unknown) => string
  routeMeta: (meta: unknown) => {
    provider: string
    distanceM: number
    durationS: number
    stepCount: number
    alternatives: number
    fromName: string
    toName: string
    line: Array<[number, number]>
  } | null
  projectLine: (
    line: Array<[number, number]>,
  ) => {
    viewBox: string
    width: number
    height: number
    aspect: number
    points: string
    start: [number, number]
    end: [number, number]
  } | null
  mapFrame: (routeAspect: number) => { cssAspect: number; requestW: number; requestH: number }
  labelPlacement: (
    point: [number, number],
    width: number,
    height: number,
    fontSize: number,
  ) => { x: number; y: number; anchor: string }
  decimateLine: (line: Array<[number, number]>, maxPoints: number) => Array<[number, number]>
  staticMapUrl: (
    line: Array<[number, number]>,
    frame: { aspect: number; requestW: number; requestH: number },
  ) => string
  turnRouteModel: (entry: unknown) => Record<string, unknown> | null
  turnRouteCardModel: (props: unknown) => {
    models: Array<Record<string, unknown>>
    total: number
    produced: number
    displaced: boolean
  } | null
  routeTurnDefinition: () => {
    kind: string
    match: (event: unknown) => { id: string; role: string } | null
    start: (context: unknown, match: unknown) => unknown
    update: (context: unknown, match: unknown) => unknown
    buildLocationData: (context: unknown, scope: string, previous: unknown) => unknown
  }
  selectTurnRoutes: (owner: unknown) => { routes: unknown[]; produced?: number } | null
  slotKind: (scope: unknown, name: string) => string | undefined
  registerTurnTail: (scope: unknown) => unknown
  registerTurnTailAsList: (scope: unknown) => unknown
  registerTurnTailAsChain: (scope: unknown) => unknown
  TURN_TAIL_SLOT: string
  TURN_TAIL_ID: string
  registerTurnRouteCard: (ctx: unknown) => void
  producedFileCount: (owner: unknown, seq: number) => number
  MAX_TURN_ROUTES: number
  formatDistance: (meters: number) => string
  formatDuration: (seconds: number) => string
  amapUri: (mode: string, line: Array<[number, number]>, from: string, to: string) => string | null
  routeCardModel: (block: unknown, toolName: string) => Record<string, unknown>
  registerRouteCards: (scope: unknown) => void
}

let route: RouteInternals
let card: CardInternals

beforeAll(async () => {
  const loaded: Array<{ id: string; factory: (require: (spec: string) => unknown) => Record<string, unknown> }> = []
  ;(globalThis as unknown as { window: unknown }).window = {
    __ModuleLoader__: {
      load: (definition: { id: string; factory: (require: (spec: string) => unknown) => Record<string, unknown> }) => {
        loaded.push(definition)
      },
    },
  }
  await import('../client/client.js')
  expect(loaded).toHaveLength(1)
  expect(loaded[0]!.id).toBe('dsh-map-tools')
  const exportsObj = loaded[0]!.factory(requireStub)
  route = (exportsObj as { __route: RouteInternals }).__route
  expect(route).toBeTruthy()
  card = (exportsObj as { __card: CardInternals }).__card
  expect(card).toBeTruthy()
})

describe('routeMeta（窄化持久化元数据）', () => {
  it('接受合法元数据：映射 provider 名并带上地名', () => {
    const meta = route.routeMeta({
      v: 1,
      kind: 'route',
      provider: 'osrm',
      distanceM: 1000,
      durationS: 60,
      stepCount: 3,
      alternatives: 1,
      fromName: '北京南站',
      toName: '首都机场',
      line: [[116.4, 39.9], [116.5, 39.95]],
    })
    expect(meta).toEqual({
      provider: 'OSRM',
      distanceM: 1000,
      durationS: 60,
      stepCount: 3,
      alternatives: 1,
      fromName: '北京南站',
      toName: '首都机场',
      line: [[116.4, 39.9], [116.5, 39.95]],
    })
  })

  it('没有地名时给空串（调用方据此回退到参数原文）', () => {
    const meta = route.routeMeta({ v: 1, kind: 'route', provider: 'amap' })!
    expect(meta.fromName).toBe('')
    expect(meta.toName).toBe('')
  })

  it('版本/类型不符时返回 null（旧客户端降级为纯文本）', () => {
    expect(route.routeMeta(null)).toBeNull()
    expect(route.routeMeta('nope')).toBeNull()
    expect(route.routeMeta([])).toBeNull()
    expect(route.routeMeta({ kind: 'other', v: 1 })).toBeNull()
    expect(route.routeMeta({ kind: 'route', v: 2 })).toBeNull()
  })

  it('过滤掉非法坐标点，非法数值退成 0', () => {
    const meta = route.routeMeta({
      v: 1,
      kind: 'route',
      provider: 'amap',
      distanceM: 'x',
      durationS: Number.NaN,
      stepCount: undefined,
      alternatives: 3,
      line: [[116.4, 39.9], [1], ['a', 'b'], [116.5, 39.95]],
    })!
    expect(meta.line).toEqual([[116.4, 39.9], [116.5, 39.95]])
    expect(meta.distanceM).toBe(0)
    expect(meta.durationS).toBe(0)
    expect(meta.stepCount).toBe(0)
    expect(meta.provider).toBe('高德')
  })
})

describe('projectLine（等比缩放，画布贴合路线形状）', () => {
  it('空数组返回 null', () => {
    expect(route.projectLine([])).toBeNull()
  })

  it('所有点都在画布内且点数不变', () => {
    const line: Array<[number, number]> = [[116.4, 39.9], [116.5, 39.95], [116.45, 39.88]]
    const projected = route.projectLine(line)!
    expect(projected.points.split(' ')).toHaveLength(3)
    expect(projected.viewBox).toBe('0 0 ' + projected.width + ' ' + projected.height)
    for (const pair of projected.points.split(' ')) {
      const [x, y] = pair.split(',').map(Number)
      expect(x).toBeGreaterThanOrEqual(0)
      expect(x).toBeLessThanOrEqual(projected.width)
      expect(y).toBeGreaterThanOrEqual(0)
      expect(y).toBeLessThanOrEqual(projected.height)
    }
  })

  it('画布高度随路线长宽比变化（扁路线不再占满一整块空白）', () => {
    const flat = route.projectLine([[116.4, 39.9], [116.5, 39.9]])!
    const tall = route.projectLine([[116.4, 39.9], [116.4, 40.0]])!
    expect(flat.height).toBeLessThan(tall.height)
    // 东西向直线：很扁（被 MAP_H_MIN 兜住）；南北向直线：比例接近 1。
    expect(flat.aspect).toBeLessThan(0.1)
    expect(tall.aspect).toBeGreaterThan(0.9)
  })

  it('东西向直线保持水平（等比缩放而非拉伸）', () => {
    const projected = route.projectLine([[116.4, 39.9], [116.5, 39.9]])!
    expect(projected.start[1]).toBe(projected.end[1])
    // 画布宽度扣掉左右内边距后，几乎铺满。
    expect(Math.abs(projected.start[0] - projected.end[0])).toBeGreaterThan(projected.width * 0.7)
  })

  it('南北向直线保持垂直', () => {
    const projected = route.projectLine([[116.4, 39.9], [116.4, 40.0]])!
    expect(projected.start[0]).toBe(projected.end[0])
    expect(Math.abs(projected.start[1] - projected.end[1])).toBeGreaterThan(projected.height * 0.7)
  })

  it('所有点重合时落在画布中心（不除零）', () => {
    const projected = route.projectLine([[116.4, 39.9], [116.4, 39.9]])!
    expect(projected.start).toEqual([projected.width / 2, projected.height / 2])
    expect(Number.isFinite(projected.start[0])).toBe(true)
  })

  it('单点也不会崩', () => {
    const projected = route.projectLine([[116.4, 39.9]])!
    expect(projected.start).toEqual([projected.width / 2, projected.height / 2])
  })
})

describe('mapFrame（真地图画框比例）', () => {
  it('路线比例被钳到 [0.42, 0.68]（高/宽），画框始终是横向的', () => {
    // 很扁的路线 → 取下限：画框不再是一条窄条，但仍是横向的。
    const flat = route.mapFrame(0.1)
    expect(flat.requestH).toBe(430)
    expect(flat.requestW).toBe(1024)
    // 竖长的路线 → 取上限：画框高一些，但仍是横向（w/h ≈ 1.47）。
    const tall = route.mapFrame(1.5)
    expect(tall.requestH).toBe(696)
    expect(tall.requestW).toBe(1024)
    expect(tall.cssAspect).toBeCloseTo(1024 / 696, 6)
    expect(tall.cssAspect).toBeGreaterThan(1)
    // cssAspect 与请求尺寸自洽（CSS 用它推高度，图片比例必须一致）。
    expect(flat.cssAspect).toBeCloseTo(flat.requestW / flat.requestH, 6)
  })

  it('退化输入不会产出非法尺寸', () => {
    for (const aspect of [0, -5, Number.NaN, undefined, 1e9]) {
      const frame = route.mapFrame(aspect as number)
      expect(frame.requestW).toBeGreaterThanOrEqual(64)
      expect(frame.requestH).toBeGreaterThanOrEqual(64)
      expect(frame.requestH).toBeLessThanOrEqual(1024)
      expect(Number.isFinite(frame.cssAspect)).toBe(true)
      expect(frame.cssAspect).toBeGreaterThan(0)
    }
  })

  it('路线越"方"，画框给得越高（单调不减）', () => {
    expect(route.mapFrame(0.45).requestH).toBeLessThan(route.mapFrame(0.6).requestH)
  })
})

describe('labelPlacement（端点标签不被裁掉）', () => {
  it('靠右的端点：标签放到左侧并右对齐', () => {
    const place = route.labelPlacement([95, 40], 100, 120, 7)
    expect(place.anchor).toBe('end')
    expect(place.x).toBeLessThan(95)
  })

  it('靠下的端点：标签放到上方', () => {
    const place = route.labelPlacement([20, 118], 100, 120, 7)
    expect(place.y).toBeLessThan(118)
    expect(place.anchor).toBe('start')
  })

  it('常规位置：标签在右下方，左对齐', () => {
    const place = route.labelPlacement([20, 30], 100, 120, 7)
    expect(place.anchor).toBe('start')
    expect(place.x).toBeGreaterThan(20)
    expect(place.y).toBeGreaterThan(30)
  })
})

describe('文案与深链', () => {
  it('距离：公里/米两种量级', () => {
    expect(route.formatDistance(42300)).toBe('42.3 公里')
    expect(route.formatDistance(800)).toBe('800 米')
    expect(route.formatDistance(0)).toBe('')
  })

  it('耗时：分钟与小时，0 表示未知（高德公交不返回）', () => {
    expect(route.formatDuration(2700)).toBe('约 45 分钟')
    expect(route.formatDuration(5400)).toBe('约 1 小时 30 分钟')
    expect(route.formatDuration(0)).toBe('')
  })

  it('深链带起终点坐标、模式与名称；几何不足两点时为 null', () => {
    expect(route.amapUri('car', [[116.4, 39.9]], 'A', 'B')).toBeNull()
    const uri = route.amapUri('walk', [[116.4, 39.9], [116.5, 39.95]], '北京南站', '首都机场')!
    expect(uri.startsWith('https://uri.amap.com/navigation?')).toBe(true)
    expect(uri).toContain('from=116.4,39.9,' + encodeURIComponent('北京南站'))
    expect(uri).toContain('to=116.5,39.95,' + encodeURIComponent('首都机场'))
    expect(uri).toContain('mode=walk')
    expect(uri).toContain('coordinate=gaode')
  })
})

describe('routeCardModel（四种形态都要兜住）', () => {
  const okBlock = {
    kind: 'result',
    isError: false,
    call: { argsRaw: JSON.stringify({ origin: '北京南站', destination: '首都机场' }) },
    content: [{ type: 'text', text: '高德 路线：42.3 公里' }],
    meta: {
      v: 1,
      kind: 'route',
      provider: 'amap',
      distanceM: 42300,
      durationS: 2700,
      stepCount: 18,
      alternatives: 0,
      line: [[116.37, 39.86], [116.6, 40.07]],
    },
  }

  it('运行中：只认 argsRaw，没有几何', () => {
    const model = route.routeCardModel(
      { argsRaw: JSON.stringify({ origin: 'A', destination: 'B' }) },
      'map_driving_route',
    )
    expect(model.running).toBe(true)
    expect(model.line).toBeNull()
    expect(model.summary).toBe('A → B')
    expect(model.label).toBe('驾车')
  })

  it('成功且带几何：给出 line 与摘要', () => {
    const model = route.routeCardModel(okBlock, 'map_driving_route')
    expect(model.running).toBe(false)
    expect(model.failed).toBe(false)
    expect(model.line).toHaveLength(2)
    expect(model.fromText).toBe('北京南站')
    expect(model.toText).toBe('首都机场')
    // 画了图也照样保留模型可见文本（卡片不藏信息）。
    expect(model.resultText).toBe('高德 路线：42.3 公里')
  })

  it('成功但没有几何（老日志）：退回文本', () => {
    const block = { ...okBlock, meta: { v: 1, kind: 'route', provider: 'amap', distanceM: 100, durationS: 10 } }
    const model = route.routeCardModel(block, 'map_walking_route')
    expect(model.line).toBeNull()
    expect(model.meta).toBeTruthy()
    expect(model.resultText).toBe('高德 路线：42.3 公里')
  })

  it('失败：给出错误文本，不画图', () => {
    const model = route.routeCardModel(
      { kind: 'result', isError: true, call: { argsRaw: '{}' }, content: [{ type: 'text', text: '地址解析失败' }] },
      'map_driving_route',
    )
    expect(model.failed).toBe(true)
    expect(model.errorText).toBe('地址解析失败')
    expect(model.line).toBeNull()
  })

  it('未知工具名退回通用标签', () => {
    const model = route.routeCardModel(okBlock, 'map_mystery_route')
    expect(model.label).toBe('路线')
    expect(model.mode).toBe('car')
  })

  it('参数不是合法 JSON 时不抛错', () => {
    const model = route.routeCardModel({ argsRaw: '{半截' }, 'map_driving_route')
    expect(model.summary).toBe('')
    expect(model.running).toBe(true)
  })
})

describe('registerRouteCards（keyed 槽位注册）', () => {
  it('为四个路线工具各注册一个 key', () => {
    const registered: Array<{ name: string; key: string }> = []
    const scope = {
      slots: {
        inject: (name: string, callback: () => Iterable<() => void>) => {
          expect(name).toBe('tool.call.toolview')
          for (const dispose of callback()) expect(typeof dispose).toBe('function')
        },
        register: (options: { name: string; key: string }) => {
          registered.push(options)
          return () => {}
        },
      },
    }
    route.registerRouteCards(scope)
    expect(registered.map((entry) => entry.key).sort()).toEqual([
      'map_bicycling_route',
      'map_driving_route',
      'map_transit_route',
      'map_walking_route',
    ])
    for (const entry of registered) expect(entry.name).toBe('tool.call.toolview')
  })

  it('没有 slots 服务时静默跳过（不让插件整体失败）', () => {
    expect(() => route.registerRouteCards({})).not.toThrow()
    expect(() => route.registerRouteCards(null)).not.toThrow()
  })
})

describe('静态地图 URL 与降级', () => {
  it('decimateLine 等间隔抽稀且保留首尾', () => {
    const line: Array<[number, number]> = []
    for (let i = 0; i < 500; i += 1) line.push([116 + i * 0.001, 39])
    const thin = route.decimateLine(line, 50)
    expect(thin).toHaveLength(50)
    expect(thin[0]).toEqual(line[0])
    expect(thin[thin.length - 1]).toEqual(line[line.length - 1])
    // 已经够短就原样返回。
    expect(route.decimateLine([[1, 2]], 50)).toEqual([[1, 2]])
  })

  it('staticMapUrl 指向宿主回环路由，尺寸来自 mapFrame', () => {
    const frame = route.mapFrame(1.2)
    const url = route.staticMapUrl([[116.378, 39.865], [116.45, 39.93]], frame)
    expect(url.startsWith('/dsh-map-tools/staticmap?')).toBe(true)
    expect(url).toContain('w=' + frame.requestW)
    expect(url).toContain('h=' + frame.requestH)
    expect(url).toContain('line=' + encodeURIComponent('116.378,39.865;116.45,39.93'))
  })
})

describe('回合尾部（最终结果处）的路线卡片', () => {
  const routeMeta = {
    v: 1,
    kind: 'route',
    provider: 'amap',
    distanceM: 36841,
    durationS: 2662,
    stepCount: 14,
    alternatives: 0,
    line: [[116.378, 39.865], [116.5, 39.99], [116.6, 40.07]],
  }

  /** 用折叠定义跑一遍：turn/start → tool/call → tool/result。 */
  function foldTurn(events: unknown[]): { state: unknown; build: (scope: string, previous: unknown) => unknown } {
    const def = route.routeTurnDefinition()
    let state: unknown
    const updates: unknown[] = []
    for (const event of events) {
      const match = def.match(event)
      if (match === null) continue
      if (match.role === 'start') state = def.start({}, { event })
      else updates.push({ event })
    }
    for (const update of updates) state = def.update({ state }, update)
    return { state, build: (scope, previous) => def.buildLocationData({ state }, scope, previous) }
  }

  const callEvent = (callId: string, name: string, args: unknown): unknown => ({
    type: 'tool/call',
    data: { turn: 7, callId, name, arguments: JSON.stringify(args) },
  })
  const resultEvent = (callId: string, meta: unknown, isError = false): unknown => ({
    type: 'tool/result',
    seq: 42,
    data: { turn: 7, message: { isError, source: { callId }, content: [] }, meta },
  })

  it('折叠出本轮成功的路线结果，并发布为 Turn 数据', () => {
    const { build } = foldTurn([
      { type: 'turn/start', data: { turn: 7 } },
      callEvent('c1', 'map_driving_route', { origin: '北京南站', destination: '首都机场' }),
      resultEvent('c1', routeMeta),
    ])
    const published = build('turn', null) as { kind: string; key: string; value: { routes: Array<{ toolName: string }> } }
    expect(published.kind).toBe('turn')
    expect(published.key).toBe('map-routes')
    expect(published.value.routes).toHaveLength(1)
    expect(published.value.routes[0]!.toolName).toBe('map_driving_route')
    // step 阶段不发布。
    expect(build('step', null)).toBeNull()
  })

  it('不折叠：失败结果、非路线工具、无 meta 的结果', () => {
    const { build } = foldTurn([
      { type: 'turn/start', data: { turn: 7 } },
      callEvent('c1', 'map_driving_route', {}),
      resultEvent('c1', routeMeta, true),
      callEvent('c2', 'map_geocode', {}),
      resultEvent('c2', routeMeta),
      callEvent('c3', 'map_driving_route', {}),
      resultEvent('c3', { kind: 'other', v: 1 }),
      callEvent('c4', 'map_driving_route', {}),
      resultEvent('c4', undefined),
    ])
    const published = build('turn', null) as { value: { routes: unknown[] } }
    expect(published.value.routes).toHaveLength(0)
  })

  it('选择器：没有路线时不认领槽位；seq 晚于收尾正文的路线被排除', () => {
    const owner = (routes: unknown[], seq = 100): unknown => ({
      turn: { data: { get: (key: string) => (key === 'map-routes' ? { routes } : undefined) } },
      seq,
    })
    expect(route.selectTurnRoutes(owner([]))).toBeNull()
    expect(route.selectTurnRoutes({ turn: { data: { get: () => undefined } }, seq: 1 })).toBeNull()
    const matched = route.selectTurnRoutes(owner([{ seq: 10 }, { seq: 200 }], 100))
    expect(matched!.routes).toHaveLength(1)
    expect(matched!.routes[0]).toEqual({ seq: 10 })
    // 没有 seq 的条目视为有效（老日志）。
    expect(route.selectTurnRoutes(owner([{}], 100))!.routes).toHaveLength(1)
  })

  it('选择器把"本轮产出文件数"带给卡片（我们挤掉了官方的产出文件行）', () => {
    const owner = (deliverables: unknown): unknown => ({
      turn: {
        data: {
          get: (key: string) => (key === 'map-routes'
            ? { routes: [{ seq: 10 }] }
            : key === 'deliverables' ? deliverables : undefined),
        },
      },
      seq: 100,
    })
    // 收尾正文之前产出的 2 个文件 → 计数 2；seq 在正文之后的那个不算。
    const withFiles = route.selectTurnRoutes(owner({ produced: [{ seq: 5 }, { seq: 9 }, { seq: 200 }] }))!
    expect(withFiles.produced).toBe(2)
    expect(route.producedFileCount(owner({ produced: [{ seq: 5 }] }), 100)).toBe(1)
    // 别的插件数据形状不对 / 读不到时一律当 0，绝不影响地图卡。
    expect(route.producedFileCount(owner({ produced: 'nope' }), 100)).toBe(0)
    expect(route.producedFileCount({ turn: { data: { get: () => { throw new Error('boom') } } } }, 100)).toBe(0)
    expect(route.selectTurnRoutes(owner(undefined))!.produced).toBe(0)
  })

  it('一轮多条路线：**全部保留**（不挑最后一条），按时间顺序交给卡片逐条渲染', () => {
    // 实测踩坑：用户问 南艳湖→蜀山，模型在同一轮里先算主路线、又算了一条
    // "望江西路欣塘家园→蜀山"的核对探测；卡片原先只画最后一条，于是正文讲
    // 主路线、地图却画了探测。现在选择器不挑，全部按 seq 升序返回。
    const delivered = {
      routes: [
        { seq: 191, callId: 'a', toolName: 'map_driving_route' },
        { seq: 203, callId: 'b', toolName: 'map_driving_route' },
      ],
    }
    const owner = {
      turn: { data: { get: (key: string) => (key === 'map-routes' ? delivered : undefined) } },
      seq: 300,
    }
    const matched = route.selectTurnRoutes(owner)!
    expect(matched.routes).toHaveLength(2)
    // 顺序 = 时间顺序（第一条是模型最先算的，通常是用户问的那条）
    expect((matched.routes[0] as { seq: number }).seq).toBe(191)
    expect((matched.routes[1] as { seq: number }).seq).toBe(203)
    // 上限只影响渲染条数，不影响选择器返回的内容
    expect(route.MAX_TURN_ROUTES).toBeGreaterThanOrEqual(2)
  })

  /**
   * 复刻 ui-slots 注册校验的最小假 slots：按宿主真实语义复现必填字段检查
   * （list 缺 id 抛、chain 缺 select 抛），且抛错发生在写入账本之前。
   *
   * @param specKind 宿主 `spec()` 报出的槽位类型；`null` 表示宿主没有 `spec()`。
   * @param hostKind 宿主注册时的**真实**校验语义（可与 specKind 不一致，用于模拟
   *                 更老的、读不到声明的宿主）。
   */
  function fakeSlots(
    specKind: string | null,
    hostKind: string,
    log: Array<{ options: Record<string, unknown>; component: unknown }>,
    injected: string[],
  ) {
    const slots: Record<string, unknown> = {
      inject: (name: string, cb: () => unknown) => {
        injected.push(name)
        cb()
      },
      register: (options: Record<string, unknown>, component: unknown) => {
        if (hostKind === 'list' && options.id === undefined) {
          throw new Error('list slot "conversation.chat.turnTail" requires options.id')
        }
        if (hostKind === 'chain' && options.select === undefined) {
          throw new Error('chain slot "conversation.chat.turnTail" requires options.select')
        }
        log.push({ options, component })
        return () => {}
      },
    }
    if (specKind !== null) slots.spec = () => ({ kind: specKind, scope: 'session' })
    return slots
  }

  /** 用假 slots 走一遍真实注册入口（ctx.inject 的回调里就是插件拿到的 scope）。 */
  function registerInto(slots: unknown): void {
    route.registerTurnRouteCard({
      inject: (_deps: string[], cb: (scope: unknown) => void) => {
        cb({ uiConversation: { events: { register: () => {} } }, slots })
      },
    })
  }

  it('list 宿主（≥ 0.1.6-alpha.2）：注册带 id、不带 select（否则控制台报错且卡片不渲染）', () => {
    const registered: Array<{ options: Record<string, unknown>; component: unknown }> = []
    const injected: string[] = []
    registerInto(fakeSlots('list', 'list', registered, injected))

    expect(injected).toEqual(['conversation.chat.turnTail'])
    expect(registered).toHaveLength(1)
    expect(registered[0]!.options.name).toBe('conversation.chat.turnTail')
    expect(registered[0]!.options.id).toBe(route.TURN_TAIL_ID)
    expect(registered[0]!.options.select).toBeUndefined()
    // 列表式按 priority 升序渲染：仍要排在官方"本轮文件改动"卡（默认 0）前面。
    expect(registered[0]!.options.priority).toBeLessThan(0)
    expect(registered[0]!.component).toBeTruthy()
  })

  it('chain 宿主（≤ 0.1.6-alpha.1）：注册带 select、不带 id，priority 同样更低', () => {
    const registered: Array<{ options: Record<string, unknown>; component: unknown }> = []
    registerInto(fakeSlots('chain', 'chain', registered, []))

    expect(registered).toHaveLength(1)
    // 链式槽位是单选：第一个非空 select 当选，同优先级按注册顺序。ui-deliverables
    // 在 web 组合里先注册，所以**必须**用更低的 priority 才能让地图卡有机会出现。
    expect(typeof registered[0]!.options.select).toBe('function')
    expect(registered[0]!.options.id).toBeUndefined()
    expect(registered[0]!.options.priority).toBeLessThan(0)
  })

  it('宿主读不到槽位类型时先试 list；宿主其实是 chain 时自动回退到 select 形状', () => {
    const listHost: Array<{ options: Record<string, unknown>; component: unknown }> = []
    registerInto(fakeSlots(null, 'list', listHost, []))
    expect(listHost).toHaveLength(1)
    expect(listHost[0]!.options.id).toBe(route.TURN_TAIL_ID)

    const chainHost: Array<{ options: Record<string, unknown>; component: unknown }> = []
    registerInto(fakeSlots(null, 'chain', chainHost, []))
    expect(chainHost).toHaveLength(1)
    expect(typeof chainHost[0]!.options.select).toBe('function')
    expect(chainHost[0]!.options.id).toBeUndefined()
  })

  it('两种形状都注册不上时只记日志，不把异常抛回宿主（工厂在 inject 之外执行）', () => {
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      const registered: Array<{ options: Record<string, unknown>; component: unknown }> = []
      const slots = fakeSlots(null, 'list', registered, [])
      ;(slots as { register: unknown }).register = () => { throw new Error('boom') }
      expect(() => registerInto(slots)).not.toThrow()
      expect(registered).toHaveLength(0)
      expect(errors).toHaveBeenCalled()
      // 回退不能把第一次（list）的真实错误吞掉。
      expect(String(errors.mock.calls[0]![0])).toContain('boom')
    } finally {
      errors.mockRestore()
    }
  })

  it('turnRouteCardModel：链式槽位用 props.matched，并标记"挤掉了产出文件行"', () => {
    const model = route.turnRouteCardModel({
      matched: {
        routes: [{ toolName: 'map_driving_route', argsRaw: JSON.stringify({ origin: '北京南站', destination: '首都机场' }), meta: routeMeta }],
        produced: 2,
      },
    })!
    expect(model.models).toHaveLength(1)
    expect(model.total).toBe(1)
    expect(model.produced).toBe(2)
    // 单选举席：我们当选就挤掉了官方那行，才需要自己交代产出文件数。
    expect(model.displaced).toBe(true)
  })

  it('turnRouteCardModel：列表式槽位没有 matched，从 ownerProps 自己推导', () => {
    const owner = {
      turn: {
        data: {
          get: (key: string) => (key === 'map-routes'
            ? {
              routes: [{
                toolName: 'map_driving_route',
                argsRaw: JSON.stringify({ origin: '北京南站', destination: '首都机场' }),
                meta: routeMeta,
                seq: 10,
              }],
            }
            : key === 'deliverables' ? { produced: [{ seq: 5 }] } : undefined),
        },
      },
      seq: 100,
    }
    const model = route.turnRouteCardModel(owner)!
    expect(model.models).toHaveLength(1)
    expect(model.produced).toBe(1)
    // 列表式槽位下官方产出文件卡与我们同时渲染，不存在"挤掉"。
    expect(model.displaced).toBe(false)
  })

  it('turnRouteCardModel：没有可画路线（无 matched 且推导为空）时返回 null', () => {
    expect(route.turnRouteCardModel(null)).toBeNull()
    expect(route.turnRouteCardModel({ turn: { data: { get: () => undefined } }, seq: 1 })).toBeNull()
    // matched 存在但里面没有合法路线 → 不发卡片，也不留空白占位。
    expect(route.turnRouteCardModel({ matched: { routes: [{ toolName: 'map_geocode' }], produced: 0 } })).toBeNull()
  })

  it('slotKind 读不到声明（无 spec / spec 抛错）时返回 undefined，交给注册兜底', () => {
    expect(route.slotKind(undefined, route.TURN_TAIL_SLOT)).toBeUndefined()
    expect(route.slotKind({ slots: {} }, route.TURN_TAIL_SLOT)).toBeUndefined()
    expect(route.slotKind({ slots: { spec: () => undefined } }, route.TURN_TAIL_SLOT)).toBeUndefined()
    expect(route.slotKind({ slots: { spec: () => { throw new Error('nope') } } }, route.TURN_TAIL_SLOT)).toBeUndefined()
    expect(route.slotKind({ slots: { spec: () => ({ kind: 'list' }) } }, route.TURN_TAIL_SLOT)).toBe('list')
  })

  it('turnRouteModel 复用同一套卡片模型；meta 不合法时返回 null', () => {
    const model = route.turnRouteModel({
      toolName: 'map_driving_route',
      argsRaw: JSON.stringify({ origin: '北京南站', destination: '首都机场' }),
      meta: routeMeta,
    })!
    expect(model.label).toBe('驾车')
    expect(model.line).toHaveLength(3)
    expect(model.summary).toBe('北京南站 → 首都机场')
    expect(model.failed).toBe(false)
    expect(route.turnRouteModel({ toolName: 'map_driving_route', meta: { kind: 'other' } })).toBeNull()
    expect(route.turnRouteModel(null)).toBeNull()
  })

  it('折叠定义对无关事件返回 null（不会污染其它 Location）', () => {
    const def = route.routeTurnDefinition()
    expect(def.match({ type: 'assistant/message', data: {} })).toBeNull()
    expect(def.match(null)).toBeNull()
    expect(def.match({ type: 'turn/start', data: { turn: 7 } })).toEqual({ id: '7', role: 'start' })
  })
})

describe('bundle 配置卡片（plugins.bundle.config）', () => {
  /**
   * 复刻宿主 slots 服务的最小假实现：`inject` 只对**已声明**的槽位触发工厂
   * （真实语义），注册失败发生在写入账本之前。
   */
  function fakeCtx(options: { declared?: string[]; failRegister?: boolean } = {}) {
    const declared = options.declared ?? ['plugins.bundle.config', 'settings.plugin.item']
    const injected: string[] = []
    const registered: Array<{ name: string; options: Record<string, unknown>; component: unknown }> = []
    const slots = {
      inject: (name: string, factory: () => unknown) => {
        if (!declared.includes(name)) return () => {}
        injected.push(name)
        factory()
        return () => {}
      },
      register: (opts: Record<string, unknown>, component: unknown) => {
        if (options.failRegister === true) throw new Error('slot exploded')
        registered.push({ name: String(opts.name), options: opts, component })
        return () => {}
      },
    }
    const ctx = {
      inject: (deps: string[], callback: (scope: unknown) => void) => {
        expect(deps).toEqual(['slots'])
        callback({ slots })
      },
    }
    return { ctx, injected, registered }
  }

  it('注册进 plugins.bundle.config：key = 包名，不掺 list 槽位的 id/order', () => {
    const host = fakeCtx()
    card.registerCard(host.ctx)
    expect(host.injected).toEqual([card.BUNDLE_SEAT, card.LEGACY_SEAT])
    const bundle = host.registered.find((entry) => entry.name === card.BUNDLE_SEAT)!
    expect(bundle.options.key).toBe('dsh-map-tools')
    // keyed 槽位只认 key：多带 id/order 会被宿主当成另一种座位的注册。
    expect(bundle.options.id).toBeUndefined()
    expect(bundle.options.order).toBeUndefined()
    expect(typeof bundle.component).toBe('function')
  })

  it('老宿主（不声明 bundle 座位）仍注册设置页列表座位：id + key + order', () => {
    const host = fakeCtx({ declared: [card.LEGACY_SEAT] })
    card.registerCard(host.ctx)
    expect(host.injected).toEqual([card.LEGACY_SEAT])
    expect(host.registered).toHaveLength(1)
    expect(host.registered[0]!.options.id).toBe('map-tools')
    expect(host.registered[0]!.options.key).toBe('dsh-map-tools')
    expect(host.registered[0]!.options.order).toBe(25)
  })

  it('注册失败只记日志：工厂由框架稍后调用，异常不能抛回宿主', () => {
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      const host = fakeCtx({ failRegister: true })
      expect(() => card.registerCard(host.ctx)).not.toThrow()
      expect(host.registered).toHaveLength(0)
      expect(errors).toHaveBeenCalled()
    } finally {
      errors.mockRestore()
    }
  })

  it('没有 slots / inject 服务时静默跳过（不让插件整体失败）', () => {
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      expect(() => card.registerCard({})).not.toThrow()
      expect(() => card.registerCard(null)).not.toThrow()
      expect(() => card.registerCard({ inject: (_deps: string[], cb: (scope: unknown) => void) => cb({}) })).not.toThrow()
      expect(() => card.registerOne({}, () => null, { seat: card.BUNDLE_SEAT, options: {} })).not.toThrow()
    } finally {
      errors.mockRestore()
    }
  })

  it('view 分派：老座位的 summary 给一行状态；页面未加载完不渲染任何输入控件', () => {
    const Card = card.ConfigCard(fakeReact)
    const summary = Card({ view: 'summary' })
    expect(summary.type).toBe('span')
    expect(String(summary.children.join(''))).toContain('读取中')
    // page：读到宿主的值之前只显示一行说明，绝不先摆出填了也存不下的输入框。
    const page = Card({ view: 'page' })
    expect(page.type).toBe('p')
    expect(String(page.children.join(''))).toContain('读取配置中')
  })

  it('parseTimeout：只接受区间内的整数毫秒，绝不把非法草稿改写成默认值', () => {
    expect(card.parseTimeout('15000')).toBe(15000)
    expect(card.parseTimeout(15000)).toBe(15000)
    expect(card.parseTimeout(' 800 ')).toBe(800)
    for (const bad of ['', 'abc', '15s', '12.5', '0', '-100', '99', '600001', null, undefined, Number.NaN]) {
      expect(card.parseTimeout(bad)).toBeNull()
    }
  })

  it('effectiveConfig：缺省补齐成 schema 默认（provider=amap、超时=15000）', () => {
    expect(card.effectiveConfig(null)).toEqual({
      provider: 'amap',
      hasAmapKey: false,
      timeoutMs: card.DEFAULT_TIMEOUT_MS,
      configPath: '',
    })
    expect(card.effectiveConfig({ provider: 'osm', hasAmapKey: true, timeoutMs: 800, configPath: 'C:/x/config.json' }))
      .toEqual({ provider: 'osm', hasAmapKey: true, timeoutMs: 800, configPath: 'C:/x/config.json' })
    // 文件里写坏的超时退成默认，而不是把 NaN 带进表单。
    expect(card.effectiveConfig({ timeoutMs: 'x' }).timeoutMs).toBe(card.DEFAULT_TIMEOUT_MS)
  })

  it('draftFrom：key 输入框每次播种都是空的（路由不回显，空着就不写）', () => {
    expect(card.draftFrom({ provider: 'amap', hasAmapKey: true, timeoutMs: 8000 }))
      .toEqual({ provider: 'amap', amapKey: '', timeoutMs: '8000' })
  })

  it('configPatch：只发改动过的字段；空 patch 让保存幂等', () => {
    const summary = { provider: 'amap', hasAmapKey: true, timeoutMs: 15000 }
    expect(card.configPatch(card.draftFrom(summary), summary)).toEqual({})
    expect(card.isDirty(card.draftFrom(summary), summary)).toBe(false)
    expect(card.configPatch({ provider: 'osm', amapKey: '', timeoutMs: '15000' }, summary)).toEqual({ provider: 'osm' })
    expect(card.configPatch({ provider: 'amap', amapKey: 'k', timeoutMs: '8000' }, summary))
      .toEqual({ amapKey: 'k', timeoutMs: 8000 })
    // 非法超时不进 patch：保存被阻止，而不是把垃圾写下去。
    expect(card.configPatch({ provider: 'amap', amapKey: '', timeoutMs: 'abc' }, summary)).toEqual({})
    expect(card.draftValid({ provider: 'amap', amapKey: '', timeoutMs: 'abc' })).toBe(false)
    expect(card.draftValid({ provider: 'amap', amapKey: '', timeoutMs: '15000' })).toBe(true)
    expect(card.draftValid({ provider: 'baidu', amapKey: '', timeoutMs: '15000' })).toBe(false)
    expect(card.draftValid(null)).toBe(false)
  })

  it('statusLine：页面的状态行与老座位的一行简介共用同一句', () => {
    expect(card.statusLine(null)).toBe('读取中…')
    expect(card.statusLine({ provider: 'amap', hasAmapKey: true })).toContain('已配置 key')
    expect(card.statusLine({ provider: 'amap', hasAmapKey: false })).toContain('未配置 key')
    expect(card.statusLine({ provider: 'osm' })).toContain('免费 OSM')
  })

  /**
   * 极简 React 替身：state 落在可复用的单元格里、effect 由调用方显式跑。
   * 这样组件的**整条渲染路径**（不只是纯函数）都能被断言，免得 ready 分支里
   * 的引用错误只能等浏览器报错。
   */
  function harness() {
    type Node = { type: unknown; props: Record<string, unknown>; children: Node[] }
    const cells: unknown[] = []
    const effects: Array<() => void> = []
    let cursor = 0
    const react = {
      createElement: (type: unknown, props: unknown, ...children: Node[]) => ({ type, props: (props ?? {}) as Record<string, unknown>, children }),
      useState: (initial: unknown) => {
        const at = cursor
        cursor += 1
        if (at >= cells.length) cells.push(initial)
        return [cells[at], (next: unknown) => {
          cells[at] = typeof next === 'function' ? (next as (previous: unknown) => unknown)(cells[at]) : next
        }]
      },
      useCallback: (fn: unknown) => fn,
      useEffect: (fn: () => void) => { effects.push(fn) },
    }
    const Card = card.ConfigCard(react)
    /** 每次渲染重置 hook 游标（单元格留着，所以状态跨渲染保留）。 */
    const render = (props: unknown): Node => {
      cursor = 0
      return Card(props) as Node
    }
    const runEffects = (): void => {
      for (const fn of effects.splice(0)) fn()
    }
    return { render, runEffects }
  }

  /** 按文字找按钮。 */
  function findButton(node: unknown, label: string): { props: Record<string, unknown> } | undefined {
    if (node === null || typeof node !== 'object') return undefined
    const element = node as { type?: unknown; props?: Record<string, unknown>; children?: unknown[] }
    if (element.type === 'button') {
      const text = (element.children ?? []).filter((child) => typeof child === 'string').join('')
      if (text === label) return { props: element.props ?? {} }
    }
    for (const child of element.children ?? []) {
      const found = findButton(child, label)
      if (found !== undefined) return found
    }
    return undefined
  }

  it('page：加载完成后渲染三段表单，未改动时保存按钮禁用（点它不该写盘）', async () => {
    const summary = { provider: 'amap', hasAmapKey: true, timeoutMs: 8000, configPath: 'C:/x/config.json' }
    const fetchStub = vi.fn(() => Promise.resolve({
      ok: true,
      status: 200,
      json: () => Promise.resolve(summary),
    }))
    vi.stubGlobal('fetch', fetchStub)
    try {
      const view = harness()
      const loading = view.render({ view: 'page' })
      expect(loading.type).toBe('p')
      view.runEffects()
      await new Promise((resolve) => setTimeout(resolve, 0))
      const page = view.render({ view: 'page' })

      expect(fetchStub).toHaveBeenCalledWith(card.CONFIG_URL, expect.anything())
      const text = JSON.stringify(page)
      expect(text).toContain('高德 · 已配置 key')
      expect(text).toContain('数据源')
      expect(text).toContain('高德 key（Web 服务）')
      expect(text).toContain('超时（毫秒）')
      expect(text).toContain('打开配置文件')
      expect(text).toContain('C:/x/config.json')
      // 没有改动 → 保存不可点（保存是显式动作，不是随打字落盘）。
      expect(findButton(page, '保存')?.props.disabled).toBe(true)
      expect(findButton(page, '保存中…')).toBeUndefined()
      // key 输入框每次加载都是空的：路由不回显，空着就不写。
      const keyInput = JSON.stringify(page)
      expect(keyInput).toContain('"value":""')
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it('page：宿主路由不可用时把控件换成说明，而不是一排存不下的输入框', async () => {
    const fetchStub = vi.fn(() => Promise.resolve({ ok: false, status: 404, json: () => Promise.resolve({}) }))
    vi.stubGlobal('fetch', fetchStub)
    try {
      const view = harness()
      view.render({ view: 'page' })
      view.runEffects()
      await new Promise((resolve) => setTimeout(resolve, 0))
      const page = view.render({ view: 'page' })
      const text = JSON.stringify(page)
      expect(text).toContain('不可用')
      expect(text).not.toContain('数据源')
      expect(findButton(page, '保存')).toBeUndefined()
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it('配置卡片只引用运行中真实存在的主题 token', () => {
    // 手写变量名是本项目踩过的坑：名字不存在时 fallback 会静默生效，深浅色就不跟随了。
    // 想在本区间引入新 token，先在这里登记（这一组按 ui-theme 的 design-platform.css 核对过）。
    const verified = [
      '--dsw-alias-bg-layer-3',
      '--dsw-alias-border-l2',
      '--dsw-alias-border-l4',
      '--dsw-alias-brand-primary',
      '--dsw-alias-button-primary-fill',
      '--dsw-alias-label-primary',
      '--dsw-alias-label-primary-foreground',
      '--dsw-alias-label-secondary',
      '--dsw-alias-label-tertiary',
      '--dsw-alias-state-error-primary',
      '--dsw-alias-state-success-primary',
    ]
    const source = readFileSync(new URL('../client/client.js', import.meta.url), 'utf8')
    const start = source.indexOf('function ConfigCard(')
    const end = source.indexOf('// ---- 路线卡片')
    expect(start).toBeGreaterThan(-1)
    expect(end).toBeGreaterThan(start)
    const used = [...source.slice(start, end).matchAll(/var\((--dsw-[a-z0-9-]+)/g)].map((match) => match[1]!)
    expect([...new Set(used)].sort()).toEqual(verified)
  })
})
