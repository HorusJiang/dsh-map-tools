/**
 * Loopback settings-card route for dsh-map-tools.
 *
 * GET  /dsh-map-tools/config            → non-secret summary (has-amap-key, …)
 * GET  /dsh-map-tools/config?open=true  → open the config file in the editor
 * POST /dsh-map-tools/config            → apply a provider/key/timeout patch
 *
 * Same-origin loopback only (mirrors dsh's own /api fence and the modlens
 * pattern); the two halves of the card read/write a real file.
 */

import type { Context } from '@deepseek-ai/cordis'
import { spawn } from 'node:child_process'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { configSummary, applyConfig, configPath, configFileExists } from './config-file.js'

/** localhost, ::1, or anything in 127/8 — matching dsh's own /api fence. */
function isLoopbackHost(hostname: string): boolean {
  return hostname === 'localhost' || hostname === '::1' || hostname === '127.0.0.1' || /^127\.\d+\.\d+\.\d+$/.test(hostname)
}

/** Refuse cross-origin and non-loopback requests (the route answers same-origin loopback only). */
function isTrustedRequest(req: IncomingMessage): boolean {
  const host = req.headers?.host
  if (typeof host !== 'string' || host === '') return false
  let hostUrl: URL
  try {
    hostUrl = new URL(`http://${host}`)
  } catch {
    return false
  }
  if (!isLoopbackHost(hostUrl.hostname)) return false
  if (req.headers?.['sec-fetch-site'] === 'cross-site') return false
  const origin = req.headers?.origin
  if (origin === undefined) return true
  try {
    return new URL(origin).host === hostUrl.host
  } catch {
    return false
  }
}

/** Open the config file in the OS default editor. */
function openConfigFile(): void {
  const file = configPath()
  const [command, args] = process.platform === 'win32'
    ? ['cmd', ['/c', 'start', '', file]]
    : process.platform === 'darwin'
      ? ['open', [file]]
      : ['xdg-open', [file]]
  const child = spawn(command, args, { detached: true, stdio: 'ignore' })
  child.unref()
}

/** Register the settings-card route under the web server, when one exists. */
export function installConfigRoute(ctx: Context): void {
  const fn = ctx.inject as unknown as (
    deps: string[],
    callback: (scope: { webServer: { register: (route: {
      kind: 'exact'
      path: string
      handler: (req: IncomingMessage, res: ServerResponse) => void | Promise<void>
    }) => () => void } }) => void,
  ) => unknown
  fn(['webServer'], (scope) => {
    scope.webServer.register({
      kind: 'exact',
      path: '/dsh-map-tools/config',
      handler: async (req: IncomingMessage, res: ServerResponse) => {
        const send = (status: number, body: unknown): void => {
          res.writeHead(status, { 'content-type': 'application/json' })
          res.end(JSON.stringify(body))
        }
        if (!isTrustedRequest(req)) {
          send(403, { error: 'request refused: this route answers same-origin loopback only' })
          return
        }
        if (req.method === 'GET') {
          try {
            const summary = configSummary()
            const wantsOpen = new URL(req.url ?? '/', 'http://localhost').searchParams.has('open')
            if (wantsOpen && !configFileExists()) {
              applyConfig({})
            }
            if (wantsOpen) openConfigFile()
            send(200, { ...summary, configPath: configPath() })
          } catch (error) {
            send(409, { error: String((error as Error)?.message ?? error) })
          }
          return
        }
        if (req.method !== 'POST') {
          res.writeHead(405).end()
          return
        }
        try {
          const chunks: Buffer[] = []
          let total = 0
          for await (const chunk of req) {
            total += chunk.length
            if (total > 64 * 1024) {
              send(413, { error: 'config payload too large' })
              req.destroy()
              return
            }
            chunks.push(chunk)
          }
          const patch = JSON.parse(Buffer.concat(chunks).toString('utf8')) as Record<string, unknown>
          applyConfig({
            provider: patch.provider as 'amap' | 'baidu' | 'osm' | undefined,
            amapKey: patch.amapKey as string | undefined,
            baiduAk: patch.baiduAk as string | undefined,
            timeoutMs: typeof patch.timeoutMs === 'number' ? patch.timeoutMs : undefined,
          })
          send(200, configSummary())
        } catch (error) {
          send(400, { error: String((error as Error)?.message ?? error) })
        }
      },
    })
  })
}
