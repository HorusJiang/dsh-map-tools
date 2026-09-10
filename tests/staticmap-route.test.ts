import { describe, expect, it } from 'vitest'
import type { Context } from '@deepseek-ai/cordis'
import { installStaticMapRoute, parseLineParam, parseSizeParam } from '../src/staticmap-route.js'
import { compactLine } from '../src/geo.js'

describe('parseLineParam（静态地图路由的 line 参数）', () => {
  it('解析分号分隔的坐标串', () => {
    expect(parseLineParam('116.4,39.9;116.5,39.95')).toEqual([
      [116.4, 39.9],
      [116.5, 39.95],
    ])
  })

  it('跳过非法片段；空值返回空数组', () => {
    expect(parseLineParam('116.4,39.9;bad;200,39;116.5,39.95')).toEqual([
      [116.4, 39.9],
      [116.5, 39.95],
    ])
    expect(parseLineParam(null)).toEqual([])
    expect(parseLineParam('')).toEqual([])
  })

  it('超过上限时等间隔截断（URL 不能被撑爆）', () => {
    const parts: string[] = []
    for (let i = 0; i < 1000; i += 1) parts.push(`${116 + i * 0.0001},39`)
    const points = parseLineParam(parts.join(';'))
    expect(points.length).toBeLessThanOrEqual(160)
    // 首尾保留，方向不变。
    expect(points[0]).toEqual([116, 39])
    expect(points[points.length - 1]![0]).toBeCloseTo(116.0999, 6)
  })
})

describe('parseSizeParam（尺寸钳制）', () => {
  it('缺省 → 640×260', () => {
    expect(parseSizeParam(null, null)).toEqual({ width: 640, height: 260 })
  })

  it('钳制到 [64, 1024]，非法值退默认', () => {
    expect(parseSizeParam('10', '99999')).toEqual({ width: 64, height: 1024 })
    expect(parseSizeParam('abc', '0')).toEqual({ width: 640, height: 260 })
    expect(parseSizeParam('800.6', '400')).toEqual({ width: 801, height: 400 })
  })
})

describe('compactLine', () => {
  it('抽稀并编码成紧凑串', () => {
    expect(compactLine([[116.4, 39.9], [116.5, 39.95]])).toBe('116.4,39.9;116.5,39.95')
    const long: Array<[number, number]> = []
    for (let i = 0; i < 500; i += 1) long.push([116 + i * 0.0001, 39 + i * 0.0001])
    expect(compactLine(long, 64).split(';').length).toBeLessThanOrEqual(64)
  })
})

describe('静态地图路由的注册与卸载', () => {
  it('卸载时撤销路由，重新安装不会撞 "duplicate route"（HMR 重载安全）', () => {
    const routes: Array<{ kind: string; path: string }> = []
    const disposers: Array<() => void> = []
    const webServer = {
      register: (route: { kind: string; path: string; handler: unknown }) => {
        if (routes.some((item) => item.kind === route.kind && item.path === route.path)) {
          throw new Error(`webserver: duplicate ${route.kind} route "${route.path}"`)
        }
        routes.push(route)
        return () => {
          const index = routes.indexOf(route)
          if (index >= 0) routes.splice(index, 1)
        }
      },
    }
    const ctx = {
      inject: (_deps: string[], cb: (scope: unknown) => void) => cb({
        webServer,
        effect: (setup: () => () => void) => {
          disposers.push(setup())
        },
      }),
    } as unknown as Context

    installStaticMapRoute(ctx, () => undefined)
    expect(routes).toHaveLength(1)

    for (const run of disposers.splice(0)) run()
    expect(routes).toHaveLength(0)

    expect(() => installStaticMapRoute(ctx, () => undefined)).not.toThrow()
    expect(routes).toHaveLength(1)
  })
})
