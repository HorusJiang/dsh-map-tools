import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Context } from '@deepseek-ai/cordis'
import { installConfigRoute } from '../src/config-route.js'

// Point the config file at a fresh temp dir per test via the env override.
let tmp: string
beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), 'dsh-map-tools-test-'))
  process.env.DSH_MAP_TOOLS_CONFIG = join(tmp, 'config.json')
})

afterEach(() => {
  delete process.env.DSH_MAP_TOOLS_CONFIG
  rmSync(tmp, { recursive: true, force: true })
})

type RouteHandler = (req: unknown, res: unknown) => void | Promise<void>

/** Context whose inject() hands the webServer stub recording the route. */
function contextWithWebServer(): {
  ctx: Context
  routes: Array<{ kind: string; path: string; handler: RouteHandler }>
  dispose: () => void
} {
  const ctx = new Context()
  const routes: Array<{ kind: string; path: string; handler: RouteHandler }> = []
  // 忠实复刻真实 webserver 的语义：同 (kind, path) 重复注册**抛错**，返回的
  // disposer 是唯一的撤销手段（它不是 effect 自动托管的）。桩若在这里放水，
  // "卸载不撤销路由" 这类 HMR 缺陷就会在单测里隐形。
  const webServer = {
    register: (route: { kind: string; path: string; handler: RouteHandler }) => {
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
  const disposers: Array<() => void> = []
  ;(ctx as unknown as {
    inject: (
      deps: string[],
      cb: (scope: {
        webServer: typeof webServer
        effect: (setup: () => () => void) => void
      }) => void,
    ) => void
  }).inject = (_deps, cb) => cb({
    webServer,
    effect: (setup) => {
      disposers.push(setup())
    },
  })
  return { ctx, routes, dispose: () => { for (const run of disposers.splice(0)) run() } }
}

/** Minimal loopback request/response pair for the route handler. */
function harness(overrides: Record<string, unknown> = {}) {
  let status = 0
  let body = ''
  const res = {
    writeHead: (code: number) => {
      status = code
    },
    end: (payload?: string) => {
      body = payload ?? ''
    },
  }
  const req = {
    method: 'GET',
    url: '/dsh-map-tools/config',
    headers: {
      host: '127.0.0.1:3080',
      origin: 'http://127.0.0.1:3080',
    },
    destroy: () => {},
    [Symbol.asyncIterator]: async function* () {
      yield Buffer.from(JSON.stringify({ provider: 'amap' }))
    },
    ...overrides,
  }
  return { req, res, read: () => ({ status, body }) }
}

describe('config-route POST → reload wiring', () => {
  it('registers the loopback route under the web server', () => {
    const { ctx, routes } = contextWithWebServer()
    installConfigRoute(ctx, () => {})
    expect(routes).toHaveLength(1)
    expect(routes[0]!.path).toBe('/dsh-map-tools/config')
    expect(routes[0]!.kind).toBe('exact')
  })

  it('rebuilds the tools after a save (POST), so the card promise "已保存—工具已重建" is true', async () => {
    const { ctx, routes } = contextWithWebServer()
    const reload = vi.fn()
    installConfigRoute(ctx, reload)

    const { req, res, read } = harness({ method: 'POST' })
    await routes[0]!.handler(req, res)
    expect(read().status).toBe(200)
    expect(JSON.parse(read().body).hasAmapKey).toBe(false)
    expect(reload).toHaveBeenCalledTimes(1)
  })

  it('does not rebuild on a read (GET)', async () => {
    const { ctx, routes } = contextWithWebServer()
    const reload = vi.fn()
    installConfigRoute(ctx, reload)

    const { req, res } = harness()
    await routes[0]!.handler(req, res)
    expect(reload).not.toHaveBeenCalled()
  })

  it('refuses cross-origin requests and does not rebuild', async () => {
    const { ctx, routes } = contextWithWebServer()
    const reload = vi.fn()
    installConfigRoute(ctx, reload)

    const { req, res, read } = harness({ headers: { host: 'evil.example.com' } })
    await routes[0]!.handler(req, res)
    expect(read().status).toBe(403)
    expect(reload).not.toHaveBeenCalled()
  })

  it('卸载时撤销路由，重新安装不会撞 "duplicate route"（HMR 重载安全）', () => {
    const { ctx, routes, dispose } = contextWithWebServer()
    installConfigRoute(ctx, () => {})
    expect(routes).toHaveLength(1)

    // 模拟 fiber 卸载（热替换会先卸载旧实例）。
    dispose()
    expect(routes).toHaveLength(0)

    // 新实例注册同一路径：若上一轮没撤销，这里会抛 duplicate 并被静默吞掉，
    // 路由就永远停在上一个版本的处理器上。
    expect(() => installConfigRoute(ctx, () => {})).not.toThrow()
    expect(routes).toHaveLength(1)
    dispose()
  })
})
