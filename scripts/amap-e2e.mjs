/**
 * Amap (高德) end-to-end test — requires a real amapKey.
 *
 * Skips (exit 0) when AMAP_API_KEY is not set, so CI without a key stays green.
 * Run from the package dir:
 *   $env:AMAP_API_KEY="your-key"; node scripts/amap-e2e.mjs
 *
 * Verifies the three Amap capabilities against the live API:
 *   1. driving route planning
 *   2. geocode (address → coordinates)
 *   3. POI around search
 */
import { fileURLToPath, pathToFileURL } from 'node:url'
import path from 'node:path'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const pkgRoot = path.resolve(__dirname, '..')

const key = process.env.AMAP_API_KEY
if (!key) {
  console.log('SKIP: AMAP_API_KEY not set (set it to run the Amap e2e test)')
  process.exit(0)
}

const plugin = await import(pathToFileURL(path.join(pkgRoot, 'lib/index.js')).href)
const { Context } = await import('@deepseek-ai/cordis')

class StubToolsRegistry {
  registered = []
  register(def) {
    this.registered.push(def)
    return () => { }
  }
}

const ctx = new Context()
const tools = new StubToolsRegistry()
ctx.provide('tools', tools)

const config = plugin.Config({
  provider: 'amap',
  amapKey: key,
  timeoutMs: 30000,
  defaultMode: 'driving',
  language: 'zh',
})
plugin.apply(ctx, config)

const byName = Object.fromEntries(tools.registered.map((t) => [t.name, t]))
const exec = { signal: new AbortController().signal, token: Symbol('e2e'), agent: {}, callId: 'amap-e2e' }

// 1. Driving route (Amap)
const route = await byName['map_driving_route'].execute(
  { origin: '116.397428,39.90923', destination: '116.403874,39.915099' },
  exec,
)
console.log('route:', JSON.stringify({ provider: route.provider, distanceM: route.distanceM, durationS: route.durationS, steps: route.steps?.length }))
if (route.provider !== 'amap' || !(route.distanceM > 0)) throw new Error('route result unexpected: ' + JSON.stringify(route))

// 2. Geocode (Amap)
const geo = await byName['map_geocode'].execute({ address: '北京西站' }, exec)
console.log('geocode:', JSON.stringify({ provider: geo.provider, formatted: geo.formatted, location: geo.location }))
if (geo.provider !== 'amap' || !Array.isArray(geo.location)) throw new Error('geocode result unexpected: ' + JSON.stringify(geo))

// 3. POI around search (Amap)
const poi = await byName['map_poi_search'].execute({ keywords: '加油站', location: '116.397428,39.90923', radiusM: 2000 }, exec)
console.log('poi:', JSON.stringify({ count: poi.count, first: poi.results?.[0]?.name }))
if (!(poi.count > 0)) throw new Error('poi result unexpected: ' + JSON.stringify(poi))

console.log('\nAMAP E2E PASSED (provider=amap on all three capabilities)')
process.exit(0)
