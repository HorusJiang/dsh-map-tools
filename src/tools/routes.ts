/** Route planning tools: driving / transit / walking / bicycling. */

import { defineTool } from '@deepseek-ai/dsh-tools'
import type { Context } from '@deepseek-ai/cordis'
import type { ToolRunContext } from '@deepseek-ai/dsh-tools'
import { AmapQuotaError, type AmapClient } from '../clients/amap.js'
import type { OsrmClient } from '../clients/osrm.js'
import type { LngLat, RouteResult } from '../types.js'
import { parseLngLat } from '../types.js'
import { simplifyGeometry, shortPlaceName } from '../geo.js'

/** Shared runtime handle handed to every tool (built by the plugin entry). */
export interface MapClients {
  amap?: AmapClient
  osrm?: OsrmClient
  /** Resolve an address (or `lng,lat`) to coordinates; throws with a helpful message. */
  resolve: (text: string, signal: AbortSignal) => Promise<LngLat>
  /** Resolve the city name for a point (transit queries need city1/city2). */
  resolveCity: (text: string, signal: AbortSignal) => Promise<string>
  defaultMode: 'driving' | 'transit' | 'walking' | 'bicycling'
}

interface RouteArgs {
  origin: string
  destination: string
  /** Optional waypoints, e.g. "116.4,39.9;116.5,39.9" (Amap driving only). */
  waypoints?: string
  /** Request alternative routes when the provider supports it. */
  alternatives?: boolean
}

/** 工具返回值里路线相关字段的签名（`render` 与 `presentationMeta` 共用）。 */
interface RouteValue {
  provider: string
  distanceM: number
  durationS: number
  polyline?: string
  /** 真实路线几何（`[lng, lat]`），仅用于派生 UI 卡片，不进入模型可见文本。 */
  geometry?: LngLat[]
  /** 起点/终点的人类可读名称（坐标入参时反查得到），同样只给卡片用。 */
  fromName?: string
  toName?: string
  steps: Array<{ instruction: string; distanceM: number; durationS: number }>
  alternatives?: Array<{ provider: string; distanceM: number; durationS: number }>
}

/**
 * 持久化给 UI 卡片的路线摘要（`output.presentationMeta` 的产物）。
 *
 * 只放"模型可见文本无法无损表达、且重放时必须还原"的事实：
 * 抽稀后的几何（首尾即起终点）、距离、耗时、分段数、备选条数，
 * 以及起终点的可读名称。具体怎么画是客户端卡片的事，这里不出现任何
 * 布局/样式字段。
 */
export type RouteCardMeta = {
  /** 元数据版本：客户端遇到不认识的版本应降级为纯文本。 */
  v: 1
  /** 卡片类型判别字段。 */
  kind: 'route'
  provider: 'amap' | 'osrm'
  distanceM: number
  durationS: number
  /** 分段数（分段指引的条数）。 */
  stepCount: number
  /** 备选路线条数。 */
  alternatives: number
  /** 抽稀后的路线几何 `[lng, lat]`，首尾即起点/终点；不足 2 点时省略。 */
  line?: LngLat[]
  /** 可读的起点名（坐标入参时由反查得到；调用方传的是地名时就是原文）。 */
  fromName?: string
  /** 可读的终点名。 */
  toName?: string
}

/**
 * 把工具返回值投影成卡片元数据（纯函数，可单测）。
 *
 * 上游数据不可信（重放的是历史日志），所以每个字段都做窄化；
 * 几何不足两个点时**省略** `line` 而不是报错——客户端会因此退回文本卡片。
 * @param value - 已通过 schema 校验的工具返回值。
 * @returns 卡片元数据。
 */
export function routeCardMeta(value: RouteValue): RouteCardMeta {
  const line = simplifyGeometry(Array.isArray(value.geometry) ? value.geometry : [])
  return {
    v: 1,
    kind: 'route',
    provider: value.provider === 'osrm' ? 'osrm' : 'amap',
    distanceM: Number.isFinite(value.distanceM) ? value.distanceM : 0,
    durationS: Number.isFinite(value.durationS) ? value.durationS : 0,
    stepCount: Array.isArray(value.steps) ? value.steps.length : 0,
    alternatives: Array.isArray(value.alternatives) ? value.alternatives.length : 0,
    ...(line.length >= 2 ? { line } : {}),
    ...(typeof value.fromName === 'string' && value.fromName !== '' ? { fromName: value.fromName } : {}),
    ...(typeof value.toName === 'string' && value.toName !== '' ? { toName: value.toName } : {}),
  }
}

/** 起终点名称（三个返回点共用）。 */
interface PlaceNames {
  fromName?: string
  toName?: string
}

/** 统一拼装工具返回值：三个返回点（高德/降级 OSRM/纯 OSRM）共用一份。 */
function routeValue(result: RouteResult, names: PlaceNames = {}): RouteValue {
  return {
    provider: result.provider,
    distanceM: result.distanceM,
    durationS: result.durationS,
    polyline: result.polyline,
    geometry: result.geometry,
    steps: result.steps,
    ...(names.fromName !== undefined ? { fromName: names.fromName } : {}),
    ...(names.toName !== undefined ? { toName: names.toName } : {}),
  }
}

/**
 * 给一个端点算"给卡片看的名字"。
 *
 * 参数本身是地名时直接用它（不打任何请求）；参数是坐标时反查一次，
 * 把"北京市丰台区北京南站"裁成"北京南站"。反查是**尽力而为**：没有
 * 高德 key、配额超限、或任何异常都退回坐标原文，绝不让卡片因此失败。
 *
 * @param text - 用户/模型传入的原始参数。
 * @param coord - 已解析出的坐标（起终点几何的首尾）。
 * @param clients - 运行时客户端集合。
 * @param signal - 取消信号。
 * @returns 可读名称。
 */
async function placeLabel(
  text: string,
  coord: LngLat,
  clients: MapClients,
  signal: AbortSignal,
): Promise<string> {
  if (parseLngLat(text) === null) return text
  if (!clients.amap) return text
  try {
    const r = await clients.amap.reverseGeocode(coord, signal)
    // **省也要剥**：高德 `formatted_address` 是"省市区街道+具体位置"连写，
    // 第一个前缀就是"湖南省"，列表里没有它，后面几个前缀就一个也匹配不上
    // （startsWith 从整串开头比），整串会原样留下——卡片抬头就会变成
    // "湖南省长沙市雨花区东山街道长沙南站"。街道（township）同理，
    // 不剥会得到"右安门街道北京南站"这种半成品。
    const short = shortPlaceName(r.formatted, [r.province, r.city, r.district, r.township])
    return short === '' ? text : short
  } catch {
    return text
  }
}

function routeTool(
  name: string,
  description: string,
  mode: 'driving' | 'transit' | 'walking' | 'bicycling',
  clients: MapClients,
) {
  const osrmProfile = mode === 'walking' ? 'walking' : mode === 'bicycling' ? 'cycling' : 'driving'
  return defineTool({
    name,
    description,
    parameters: {
      origin: { type: 'string', required: true, description: 'Start point: an address, or "lng,lat" coordinates.' },
      destination: { type: 'string', required: true, description: 'End point: an address, or "lng,lat" coordinates.' },
      waypoints: { type: 'string', description: 'Optional waypoints as "lng,lat;lng,lat" (Amap driving only).' },
      alternatives: { type: 'boolean', description: 'Request alternative routes (default false).' },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          provider: { type: 'string' },
          distanceM: { type: 'number' },
          durationS: { type: 'number' },
          polyline: { type: 'string' },
          geometry: {
            type: 'array',
            items: { type: 'array', items: { type: 'number' } },
          },
          fromName: { type: 'string' },
          toName: { type: 'string' },
          steps: {
            type: 'array',
            items: {
              type: 'object',
              additionalProperties: false,
              properties: {
                instruction: { type: 'string' },
                distanceM: { type: 'number' },
                durationS: { type: 'number' },
              },
            },
          },
          alternatives: {
            type: 'array',
            items: {
              type: 'object',
              additionalProperties: false,
              properties: {
                provider: { type: 'string' },
                distanceM: { type: 'number' },
                durationS: { type: 'number' },
                steps: {
                  type: 'array',
                  items: {
                    type: 'object',
                    additionalProperties: false,
                    properties: {
                      instruction: { type: 'string' },
                      distanceM: { type: 'number' },
                      durationS: { type: 'number' },
                    },
                  },
                },
              },
            },
          },
        },
      },
      render: (_args, value) => {
        const v = value as RouteValue
        const mins = (s: number) => Math.round(s / 60)
        const providerName = v.provider === 'amap' ? '高德' : 'OSRM'
        const distanceText = v.distanceM >= 1000 ? `${(v.distanceM / 1000).toFixed(1)} 公里` : `${v.distanceM} 米`
        // Amap v5 transit returns no duration field — report it as unknown.
        const durationText = v.durationS > 0 ? `，约 ${mins(v.durationS)} 分钟` : ''
        const lines = [
          `${providerName} 路线：${distanceText}${durationText}`,
        ]
        for (const s of v.steps.slice(0, 12)) {
          lines.push(`- ${s.instruction}`)
        }
        if (v.steps.length > 12) lines.push(`- …（共 ${v.steps.length} 步）`)
        if (v.alternatives?.length) {
          lines.push(`另有 ${v.alternatives.length} 条备选路线：`)
          for (const a of v.alternatives) {
            const aName = a.provider === 'amap' ? '高德' : 'OSRM'
            lines.push(`  - ${aName}：${(a.distanceM / 1000).toFixed(1)} 公里 / ${mins(a.durationS)} 分钟`)
          }
        }
        return [{ type: 'text', text: lines.join('\n') }]
      },
      // 卡片数据：抽稀后的几何 + 距离/耗时/分段数，随会话日志持久化，
      // 由客户端 client/client.js 注册的同名 toolview 读取（内置 Web 客户端
      // 不消费 presentCall/presentResult，UI 走 tool.call.toolview 槽位）。
      presentationMeta: (_args, value) => routeCardMeta(value as RouteValue),
    },
    async execute(args: RouteArgs, exec: ToolRunContext) {
      let origin: LngLat
      let destination: LngLat
      try {
        origin = parseLngLat(args.origin) ?? (await clients.resolve(args.origin, exec.signal))
        destination = parseLngLat(args.destination) ?? (await clients.resolve(args.destination, exec.signal))
      } catch (err) {
        // 地址解析阶段的高德配额超限：没有坐标就无法降级，转成可操作提示。
        if (err instanceof AmapQuotaError) {
          throw new Error(`地址解析暂时不可用（${err.message}）。请稍后重试，或直接提供 "lng,lat" 坐标。`)
        }
        throw err
      }

      // 起终点名称：模型常常先用 map_geocode 把地名换成坐标再调路线工具，
      // 那样参数里就只剩坐标。坐标入参时反查一次，卡片才显示得出地名。
      // （地名入参不打任何额外请求；反查失败退回原文。）
      const [fromName, toName] = await Promise.all([
        placeLabel(args.origin, origin, clients, exec.signal),
        placeLabel(args.destination, destination, clients, exec.signal),
      ])
      const names: PlaceNames = { fromName, toName }

      // Provider priority: Amap → OSRM free fallback.
      if (clients.amap) {
        try {
          let city1: string | undefined
          let city2: string | undefined
          try {
            city1 = mode === 'transit' ? await clients.resolveCity(args.origin, exec.signal) : undefined
            city2 = mode === 'transit' ? await clients.resolveCity(args.destination, exec.signal) : undefined
          } catch (err) {
            // 城市解析也受高德配额影响；公交没有 city 无法请求，但非公交不受影响。
            if (err instanceof AmapQuotaError && mode === 'transit') {
              throw new Error(`公交路线需要城市解析，但高德暂不可用（${err.message}）。请稍后重试，或改用驾车/步行/骑行路线（自动降级 OSRM 免费源）。`)
            }
            throw err
          }
          const result = await clients.amap.route(origin, destination, mode, { city1, city2 }, exec.signal)
          const out: RouteValue & { waypoints?: string } = routeValue(result, names)
          if (args.waypoints && mode === 'driving') {
            out.waypoints = args.waypoints.split(';').map((w) => w.trim()).filter(Boolean).join(';')
          }
          return out
        } catch (err) {
          // 高德配额超限（QPS/日配额）：非公交模式自动降级 OSRM 兜底，
          // 公交无免费兜底源，给用户可操作的提示。
          if (err instanceof AmapQuotaError) {
            if (mode === 'transit') {
              throw new Error(`高德公交路线暂不可用（${err.message}）。请稍后重试，或改用驾车/步行/骑行路线（自动降级 OSRM 免费源）。`)
            }
            const result = await clients.osrm!.route(origin, destination, osrmProfile, exec.signal)
            return routeValue(result, names)
          }
          throw err
        }
      }

      // Fallback: OSRM (driving/walking/cycling only; no transit).
      if (mode === 'transit') {
        throw new Error('公交路线需要高德 key。请在插件配置中设置 amapKey（https://console.amap.com/dev/key/app）。')
      }
      const result = await clients.osrm!.route(origin, destination, osrmProfile, exec.signal)
      return routeValue(result, names)
    },
  })
}

export function registerRouteTools(ctx: Context, clients: MapClients, disposers: Array<() => void> = []): void {
  disposers.push(ctx.tools.register(
    routeTool(
      'map_driving_route',
      '规划驾车路线，返回距离、预计耗时和分段指引。起点/终点支持地址或 "lng,lat" 坐标。',
      'driving',
      clients,
    ),
  ))
  disposers.push(ctx.tools.register(
    routeTool(
      'map_transit_route',
      '规划公交/地铁换乘路线（需配置高德 amapKey），返回距离、耗时和多段换乘指引。',
      'transit',
      clients,
    ),
  ))
  disposers.push(ctx.tools.register(
    routeTool(
      'map_walking_route',
      '规划步行路线，返回距离、预计耗时和分段指引。',
      'walking',
      clients,
    ),
  ))
  disposers.push(ctx.tools.register(
    routeTool(
      'map_bicycling_route',
      '规划骑行路线，返回距离、预计耗时和分段指引。',
      'bicycling',
      clients,
    ),
  ))
}
