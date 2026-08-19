/** POI search tool. */

import { defineTool } from '@deepseek-ai/dsh-tools'
import type { Context } from '@deepseek-ai/cordis'
import type { ToolRunContext } from '@deepseek-ai/dsh-tools'
import type { AmapClient } from '../clients/amap.js'
import type { BaiduClient } from '../clients/baidu.js'
import { parseLngLat } from '../types.js'

export interface PoiClients {
  amap?: AmapClient
  baidu?: BaiduClient
  /** Resolve an address (or `lng,lat`) to coordinates; throws with a helpful message. */
  resolve: (text: string, signal: AbortSignal) => Promise<[number, number]>
}

export function registerPoiTool(ctx: Context, clients: PoiClients, disposers: Array<() => void> = []): void {
  disposers.push(ctx.tools.register(
    defineTool({
      name: 'map_poi_search',
      description: '搜索兴趣点（POI）：餐厅、加油站、酒店、医院等。支持按关键词搜索或按位置周边搜索。',
      parameters: {
        keywords: { type: 'string', required: true, description: '搜索关键词，如 "加油站"、"咖啡"、"北京南站"。' },
        location: {
          type: 'string',
          description: '中心点："lng,lat" 坐标或地址文本。提供后按周边搜索（默认半径 1000 米）。',
        },
        radiusM: { type: 'number', description: '周边搜索半径（米），默认 1000，最大 50000。' },
        region: { type: 'string', description: '限定城市（文本搜索时），如 "北京"。' },
        types: { type: 'string', description: 'POI 类型编码，如 "060000"（餐饮）。' },
      },
      output: {
        schema: {
          type: 'object',
          additionalProperties: false,
          properties: {
            count: { type: 'number' },
            results: {
              type: 'array',
              items: {
                type: 'object',
                additionalProperties: false,
                properties: {
                  name: { type: 'string' },
                  location: {
                    type: 'array',
                    items: { type: 'number' },
                  },
                  type: { type: 'string' },
                  address: { type: 'string' },
                  tel: { type: 'string' },
                  distanceM: { type: 'number' },
                },
              },
            },
          },
        },
        render: (_args, value) => {
          const v = value as {
            count: number
            results: Array<{ name: string; location: number[]; type?: string; address?: string; tel?: string; distanceM?: number }>
          }
          const lines = [`找到 ${v.count} 个结果：`]
          for (const r of v.results.slice(0, 10)) {
            const d = r.distanceM !== undefined ? `（距中心 ${Math.round(r.distanceM)} 米）` : ''
            const tel = r.tel ? ` 电话：${r.tel}` : ''
            lines.push(`- ${r.name}${d}${r.type ? ` [${r.type}]` : ''}${r.address ? ` ${r.address}` : ''}${tel}`)
          }
          if (v.results.length > 10) lines.push(`- …（还有 ${v.results.length - 10} 个）`)
          return [{ type: 'text', text: lines.join('\n') }]
        },
      },
      async execute(args: { keywords: string; location?: string; radiusM?: number; region?: string; types?: string }, exec: ToolRunContext) {
        if (clients.amap) {
          let results
          if (args.location) {
            const center = parseLngLat(args.location) ?? (await clients.resolve(args.location, exec.signal))
            results = await clients.amap.poiAround(center, args.keywords, {
              radiusM: args.radiusM ?? 1000,
              types: args.types,
            }, exec.signal)
          } else {
            results = await clients.amap.poiSearch(args.keywords, { region: args.region, cityLimit: !!args.region }, exec.signal)
          }
          return {
            count: results.length,
            results: results.map((r) => ({
              name: r.name,
              location: r.location,
              type: r.type,
              address: r.address,
              tel: r.tel,
              distanceM: r.distanceM,
            })),
          }
        }
        if (clients.baidu) {
          let results
          if (args.location) {
            const center = parseLngLat(args.location) ?? (await clients.resolve(args.location, exec.signal))
            results = await clients.baidu.poiSearch(args.keywords, { location: center, radiusM: args.radiusM ?? 1000 }, exec.signal)
          } else {
            results = await clients.baidu.poiSearch(args.keywords, { region: args.region }, exec.signal)
          }
          return {
            count: results.length,
            results: results.map((r) => ({
              name: r.name,
              location: r.location,
              address: r.address,
              tel: r.tel,
              distanceM: r.distanceM,
            })),
          }
        }
        throw new Error('POI 搜索需要配置高德 amapKey 或百度 baiduAk。高德申请：https://console.amap.com/dev/key/app；百度申请：https://lbsyun.baidu.com/apiconsole/key')
      },
    }),
  ))
}
