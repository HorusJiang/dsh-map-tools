/** Geocoding tools: address → coordinates, and reverse. */

import { defineTool } from '@deepseek-ai/dsh-tools'
import type { Context } from '@deepseek-ai/cordis'
import type { ToolRunContext } from '@deepseek-ai/dsh-tools'
import type { AmapClient } from '../clients/amap.js'
import type { NominatimClient } from '../clients/nominatim.js'
import { parseLngLat } from '../types.js'

export interface GeocodeClients {
  amap?: AmapClient
  nominatim?: NominatimClient
}

export function registerGeocodeTools(ctx: Context, clients: GeocodeClients, disposers: Array<() => void> = []): void {
  disposers.push(ctx.tools.register(
    defineTool({
      name: 'map_geocode',
      description: '把地址文本转换为经纬度坐标。支持中文地址、模糊地址。',
      parameters: {
        address: { type: 'string', required: true, description: '地址文本，如 "北京市朝阳区建国路88号"。' },
      },
      output: {
        schema: {
          type: 'object',
          additionalProperties: false,
          properties: {
            provider: { type: 'string' },
            formatted: { type: 'string' },
            location: {
              type: 'array',
              items: { type: 'number' },
            },
            city: { type: 'string' },
            district: { type: 'string' },
          },
        },
        render: (_args, value) => {
          const v = value as { provider: string; formatted: string; location: number[]; city?: string; district?: string }
          const name = v.provider === 'amap' ? '高德' : v.provider === 'nominatim' ? 'Nominatim(OSM)' : 'inline'
          const area = v.city ? `（${v.city}${v.district ? ` ${v.district}` : ''}）` : ''
          return [{
            type: 'text',
            text: `${name} 解析 "${v.formatted}" → 经纬度 ${v.location[0]}, ${v.location[1]}${area}`,
          }]
        },
      },
      async execute(args: { address: string }, exec: ToolRunContext) {
        const coord = parseLngLat(args.address)
        if (coord) {
          // Input already looks like coordinates — return as-is.
          return { provider: 'inline', formatted: args.address, location: coord }
        }
        if (clients.amap) {
          const r = await clients.amap.geocode(args.address, exec.signal)
          return { provider: r.provider, formatted: r.formatted, location: r.location, city: r.city, district: r.district }
        }
        if (clients.nominatim) {
          const r = await clients.nominatim.geocode(args.address, exec.signal)
          return { provider: r.provider, formatted: r.formatted, location: r.location, city: r.city, district: r.district }
        }
        throw new Error('未配置任何地理编码服务：请设置 amapKey，或检查网络。')
      },
    }),
  ))

  disposers.push(ctx.tools.register(
    defineTool({
      name: 'map_reverse_geocode',
      description: '把经纬度坐标转换为结构化地址（含城市、区县）。',
      parameters: {
        location: { type: 'string', required: true, description: '经纬度，格式 "lng,lat"，如 "116.397428,39.90923"。' },
      },
      output: {
        schema: {
          type: 'object',
          additionalProperties: false,
          properties: {
            provider: { type: 'string' },
            formatted: { type: 'string' },
            location: {
              type: 'array',
              items: { type: 'number' },
            },
            city: { type: 'string' },
            district: { type: 'string' },
          },
        },
        render: (_args, value) => {
          const v = value as { provider: string; formatted: string; location: number[]; city?: string; district?: string }
          const name = v.provider === 'amap' ? '高德' : v.provider === 'nominatim' ? 'Nominatim(OSM)' : '未知'
          return [{ type: 'text', text: `${name}：${v.formatted}` }]
        },
      },
      async execute(args: { location: string }, exec: ToolRunContext) {
        const coord = parseLngLat(args.location)
        if (!coord) throw new Error(`无效的经纬度格式：${args.location}（应为 "lng,lat"）`)
        if (clients.amap) {
          const r = await clients.amap.reverseGeocode(coord, exec.signal)
          return { provider: r.provider, formatted: r.formatted, location: r.location, city: r.city, district: r.district }
        }
        if (clients.nominatim) {
          const r = await clients.nominatim.reverseGeocode(coord, exec.signal)
          return { provider: r.provider, formatted: r.formatted, location: r.location, city: r.city, district: r.district }
        }
        throw new Error('未配置任何地理编码服务：请设置 amapKey，或检查网络。')
      },
    }),
  ))
}
