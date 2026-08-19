/**
 * One-off: call map_driving_route from 116.397428,39.90923 to 116.403874,39.915099.
 * Run from the dsh-map-tools package dir:
 *   node scripts/call-driving-route.mjs
 */
import { fileURLToPath, pathToFileURL } from 'node:url'
import path from 'node:path'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const pkgRoot = path.resolve(__dirname, '..')

const plugin = await import(pathToFileURL(path.join(pkgRoot, 'lib/index.js')).href)

function makeExec(signal) {
  return { signal, token: Symbol('exec'), agent: {}, callId: 'call-driving-route' }
}

class StubToolsRegistry {
  constructor() { this.registered = [] }
  register(def) {
    this.registered.push(def)
    return () => { }
  }
}

const { Context } = await import('@deepseek-ai/cordis')
const ctx = new Context()
const tools = new StubToolsRegistry()
ctx.provide('tools', tools)

const config = plugin.Config({ provider: 'osm', timeoutMs: 20000, defaultMode: 'driving', language: 'zh' })
plugin.apply(ctx, config)

const byName = Object.fromEntries(tools.registered.map((t) => [t.name, t]))
const driving = byName['map_driving_route']
if (!driving) {
  console.error('FAIL: map_driving_route not registered')
  process.exit(1)
}

const ac = new AbortController()
const result = await driving.execute(
  { origin: '116.397428,39.90923', destination: '116.403874,39.915099' },
  makeExec(ac.signal),
)
console.log(JSON.stringify(result, null, 2))
