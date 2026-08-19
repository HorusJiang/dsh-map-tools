/** Plugin configuration schema. */

import Schema from '@deepseek-ai/schemastery'

export interface Config {
  /**
   * Provider selection:
   * - 'amap': 高德地图（Web 服务 API key，免费申请，推荐）
   * - 'osm': 免费 OSM/OSRM 兜底（无 key，能力有限）
   */
  provider: 'amap' | 'osm'
  /** Amap (高德) Web Service API key. */
  amapKey?: string
  /** Per-request timeout in milliseconds. */
  timeoutMs: number
  /** Default route mode when a generic route is requested. */
  defaultMode: 'driving' | 'transit' | 'walking' | 'bicycling'
  /** Language hint for providers that support it. */
  language: 'zh' | 'en'
}

/** Amap apply URL (shown as a clickable link in the settings card). */
export const AMAP_APPLY_URL = 'https://console.amap.com/dev/key/app'

export const Config: Schema<Config> = Schema.object({
  provider: Schema.union(['amap', 'osm'])
    .default('amap')
    .description('数据源：amap=高德地图（推荐，国内数据最全）；osm=免费 OSM 兜底（无需 key，能力有限）'),
  amapKey: Schema.string()
    .role('secret')
    .description(`高德 Web 服务 key。申请：${AMAP_APPLY_URL}（创建应用后选择"Web 服务"类型）`),
  timeoutMs: Schema.number().default(15000).description('单次请求超时（毫秒）'),
  defaultMode: Schema.union(['driving', 'transit', 'walking', 'bicycling']).default('driving').description('默认路线模式'),
  language: Schema.union(['zh', 'en']).default('zh').description('返回语言'),
})
