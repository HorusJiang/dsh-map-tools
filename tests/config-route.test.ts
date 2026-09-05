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
function contextWithWebServer(): { ctx: Context; routes: Array<{ kind: string; path: string; handler: RouteHandler }> } {
  const ctx = new Context()
  const routes: Array<{ kind: string; path: string; handler: RouteHandler }> = []
  const webServer = {
    register: (route: { kind: string; path: string; handler: RouteHandler }) => {
      routes.push(route)
      return () => {}
    },
  }
  ;(ctx as unknown as {
    inject: (deps: string[], cb: (scope: { webServer: typeof webServer }) => void) => void
  }).inject = (_deps, cb) => cb({ webServer })
  return { ctx, routes }
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
})
