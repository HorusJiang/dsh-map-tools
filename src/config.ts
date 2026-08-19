/** Plugin configuration schema. */

import Schema from '@deepseek-ai/schemastery'

export interface Config {
  /**
   * Provider selection:
   * - 'auto' (default): use Amap when amapKey is set, otherwise OSM/OSRM/Nominatim.
   * - 'amap': always use Amap (requires amapKey).
   * - 'osm': always use OSM/OSRM/Nominatim (ignores amapKey).
   */
  provider: 'auto' | 'amap' | 'osm'
  /** Amap (高德) Web Service API key. Optional — without it, OSRM/Nominatim free fallback is used. */
  amapKey?: string
  /** Per-request timeout in milliseconds. */
  timeoutMs: number
  /** Default route mode when a generic route is requested. */
  defaultMode: 'driving' | 'transit' | 'walking' | 'bicycling'
  /** Language hint for providers that support it. */
  language: 'zh' | 'en'
}

export const Config: Schema<Config> = Schema.object({
  provider: Schema.union(['auto', 'amap', 'osm'])
    .default('auto')
    .description('数据源：auto=有高德 key 用高德，否则用 OSM；amap=强制高德；osm=强制 OSM/OSRM 免费源'),
  amapKey: Schema.string()
    .role('secret')
    .description('高德 Web 服务 API key（可选）。如何获取：打开 https://console.amap.com/dev/key/app 创建应用并申请 Web 服务 key；不配置时使用 OSRM/Nominatim 免费数据源'),
  timeoutMs: Schema.number().default(15000).description('单次请求超时（毫秒）'),
  defaultMode: Schema.union(['driving', 'transit', 'walking', 'bicycling']).default('driving').description('默认路线模式'),
  language: Schema.union(['zh', 'en']).default('zh').description('返回语言'),
})
