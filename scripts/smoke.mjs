/**
 * Smoke test: load dsh-map-tools plugin against a real Cordis context and
 * verify all 7 tools register. Run from the dsh-map-tools package dir:
 *   node scripts/smoke.mjs
 */
import { Context } from '@deepseek-ai/cordis'
import { fileURLToPath, pathToFileURL } from 'node:url'
import path from 'node:path'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const pkgRoot = path.resolve(__dirname, '..')

// Load the built plugin (lib/index.js) as a plain module.
const plugin = await import(pathToFileURL(path.join(pkgRoot, 'lib/index.js')).href)

// Build a minimal context with a stub `tools` registry.
class StubToolsRegistry {
  constructor() {
    this.registered = []
  }
  register(def) {
    this.registered.push(def)
    return () => {
      const i = this.registered.indexOf(def)
      if (i >= 0) this.registered.splice(i, 1)
    }
  }
}

const ctx = new Context()
const tools = new StubToolsRegistry()
// Provide ctx.tools for the plugin's inject.
ctx.provide('tools', tools)

const config = plugin.Config({
  provider: 'auto',
  timeoutMs: 15000,
  defaultMode: 'driving',
  language: 'zh',
})

plugin.apply(ctx, config)

const names = tools.registered.map((t) => t.name)
const expected = [
  'map_driving_route',
  'map_transit_route',
  'map_walking_route',
  'map_bicycling_route',
  'map_geocode',
  'map_reverse_geocode',
  'map_poi_search',
]

console.log('registered tools:', names.join(', '))
const missing = expected.filter((n) => !names.includes(n))
if (missing.length) {
  console.error('MISSING:', missing.join(', '))
  process.exit(1)
}
console.log(`OK: all ${expected.length} tools registered`)

// Check amapKey is secret-role (never exposed on the wire).
const schemaJson = JSON.stringify(plugin.Config)
console.log('schema mentions secret role:', schemaJson.includes('secret'))
console.log('schema mentions amap console link:', schemaJson.includes('console.amap.com'))
process.exit(0)
