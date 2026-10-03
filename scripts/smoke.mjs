/**
 * Smoke test: load dsh-map-tools plugin against a real Cordis context and
 * verify all 7 tools register. Run from the dsh-map-tools package dir:
 *   node scripts/smoke.mjs
 */
import { Context } from '@deepseek-ai/cordis'
import { fileURLToPath, pathToFileURL } from 'node:url'
import fs from 'node:fs'
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
  provider: 'osm',
  timeoutMs: 15000,
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

// The portal page (site/index.html) is static, so nothing else ties it to the release:
// it carried `0.7.1` while the package was already at 0.7.3. Assert the version it
// prints is the manifest's, and that every local asset it points at actually exists.
const siteDir = path.join(pkgRoot, 'site')
const site = fs.readFileSync(path.join(siteDir, 'index.html'), 'utf8')
const version = JSON.parse(fs.readFileSync(path.join(pkgRoot, 'package.json'), 'utf8')).version
console.log('portal page version:', version)
if (!site.includes(`v${version}`)) {
  console.error(`MISSING: site/index.html does not print the package version v${version}`)
  process.exit(1)
}
const refs = [...site.matchAll(/(?:src|href)="(assets\/[^"]+)"/g)].map((m) => m[1])
const absent = [...new Set(refs)].filter((r) => !fs.existsSync(path.join(siteDir, r)))
if (absent.length) {
  console.error('MISSING site assets:', absent.join(', '))
  process.exit(1)
}
console.log(`OK: portal page references ${new Set(refs).size} local assets, all present`)
process.exit(0)
