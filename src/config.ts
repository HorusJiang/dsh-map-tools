/** Plugin configuration schema. */

import Schema from '@deepseek-ai/schemastery'

export interface Config {
  /**
   * Provider selection:
   * - 'amap': 高德地图（Web 服务 API key，免费申请）
   * - 'baidu': 百度地图（Web 服务 API ak，免费申请）
   * - 'osm': 免费 OSM/OSRM 兜底（无 key，能力有限）
   */
  provider: 'amap' | 'baidu' | 'osm'
  /** Amap (高德) Web Service API key. */
  amapKey?: string
  /** Baidu Maps (百度地图) Web Service API ak. */
  baiduAk?: string
  /** Per-request timeout in milliseconds. */
  timeoutMs: number
  /** Default route mode when a generic route is requested. */
  defaultMode: 'driving' | 'transit' | 'walking' | 'bicycling'
  /** Language hint for providers that support it. */
  language: 'zh' | 'en'
}

/**
 * Amap key reference for the credentials domain (client card reads/writes it).
 * Kept in sync with the settings card's credential controls.
 */
export const AMAP_KEY_REF = 'AMAP_API_KEY'

/** Baidu ak reference for the credentials domain. */
export const BAIDU_AK_REF = 'BAIDU_MAP_AK'

/** Amap apply URL (shown as a clickable link in the settings card). */
export const AMAP_APPLY_URL = 'https://console.amap.com/dev/key/app'

/** Baidu apply URL (shown as a clickable link in the settings card). */
export const BAIDU_APPLY_URL = 'https://lbsyun.baidu.com/apiconsole/key'

export const Config: Schema<Config> = Schema.object({
  provider: Schema.union(['amap', 'baidu', 'osm'])
    .default('amap')
    .description('数据源：amap=高德地图（推荐，国内数据最全）；baidu=百度地图；osm=免费 OSM 兜底（无需 key，能力有限）'),
  amapKey: Schema.string()
    .role('secret')
    .description(`高德 Web 服务 key。申请：${AMAP_APPLY_URL}（创建应用后选择"Web 服务"类型）`),
  baiduAk: Schema.string()
    .role('secret')
    .description(`百度地图 Web 服务 ak。申请：${BAIDU_APPLY_URL}（创建应用后选择"服务端"类型）`),
  timeoutMs: Schema.number().default(15000).description('单次请求超时（毫秒）'),
  defaultMode: Schema.union(['driving', 'transit', 'walking', 'bicycling']).default('driving').description('默认路线模式'),
  language: Schema.union(['zh', 'en']).default('zh').description('返回语言'),
})
