/**
 * 路线卡片的纯函数测试。
 *
 * 直接加载随包发布的 `client/client.js`（浏览器加载的就是同一份字节）：
 * 该文件只调用 `window.__ModuleLoader__.load({ id, factory })`，这里用一个
 * 假 window 捕获 factory，再手工执行它拿到 exports。
 */

import { beforeAll, describe, expect, it } from 'vitest'

/** factory 里 require 到的模块（渲染时才用，本测试只测纯函数）。 */
const requireStub = (spec: string): unknown => {
  throw new Error(`unexpected require: ${spec}`)
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
  routeTurnDefinition: () => {
    kind: string
    match: (event: unknown) => { id: string; role: string } | null
    start: (context: unknown, match: unknown) => unknown
    update: (context: unknown, match: unknown) => unknown
    buildLocationData: (context: unknown, scope: string, previous: unknown) => unknown
  }
  selectTurnRoutes: (owner: unknown) => { routes: unknown[]; produced?: number } | null
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

  it('注册回合尾部时用更低的 priority 先试（否则产出文件行永远抢在前面）', () => {
    const registered: Array<{ options: Record<string, unknown>; component: unknown }> = []
    const injected: string[] = []
    const slots = {
      inject: (name: string, cb: () => unknown) => {
        injected.push(name)
        cb()
      },
      register: (options: Record<string, unknown>, component: unknown) => {
        registered.push({ options, component })
        return () => {}
      },
    }
    const ctx = {
      inject: (deps: string[], cb: (scope: unknown) => void) => cb({
        uiConversation: { events: { register: () => {} } },
        slots,
      }),
    }
    route.registerTurnRouteCard(ctx)

    expect(injected).toEqual(['conversation.chat.turnTail'])
    expect(registered).toHaveLength(1)
    expect(registered[0]!.options.name).toBe('conversation.chat.turnTail')
    // 链式槽位是单选：第一个非空 select 当选，同优先级按注册顺序。ui-deliverables
    // 在 web 组合里先注册，所以**必须**用更低的 priority 才能让地图卡有机会出现。
    expect(registered[0]!.options.priority).toBeLessThan(0)
    expect(typeof registered[0]!.options.select).toBe('function')
    expect(registered[0]!.component).toBeTruthy()
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
