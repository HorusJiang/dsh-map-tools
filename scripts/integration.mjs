/**
 * Integration test: drive the built plugin's tools with REAL network calls.
 *
 * Uses only the zero-key path (OSRM + Nominatim). Run from the package dir:
 *   node scripts/integration.mjs
 *
 * Verifies:
 *   1. map_driving_route via OSRM (expected to succeed)
 *   2. map_geocode via Nominatim (may fail on CN networks — that failure mode
 *      is itself a valid, informative result we assert on)
 */
import { fileURLToPath, pathToFileURL } from 'node:url'
import path from 'node:path'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const pkgRoot = path.resolve(__dirname, '..')

const plugin = await import(pathToFileURL(path.join(pkgRoot, 'lib/index.js')).href)

// Minimal execution context the tools receive.
function makeExec(signal) {
  return { signal, token: Symbol('exec'), agent: {}, callId: 'smoke' }
}

// Build a tiny tools registry + context, mirroring smoke.mjs.
class StubToolsRegistry {
  constructor() {
    this.registered = []
  }
  register(def) {
    this.registered.push(def)
    return () => { }
  }
}

const { Context } = await import('@deepseek-ai/cordis')
const ctx = new Context()
const tools = new StubToolsRegistry()
ctx.provide('tools', tools)

const config = plugin.Config({ provider: 'auto', timeoutMs: 20000, defaultMode: 'driving', language: 'zh' })
plugin.apply(ctx, config)

const byName = Object.fromEntries(tools.registered.map((t) => [t.name, t]))
const ac = new AbortController()

// --- Test 1: driving route (OSRM, zero key) ---
const driving = byName['map_driving_route']
const routeResult = await driving.execute(
  { origin: '116.397428,39.90923', destination: '116.403874,39.915099' },
  makeExec(ac.signal),
)
console.log('route provider:', routeResult.provider)
console.log('route distanceM:', routeResult.distanceM, 'durationS:', routeResult.durationS)
console.log('route steps:', routeResult.steps?.length)
if (routeResult.provider !== 'osrm' || !(routeResult.distanceM > 0)) {
  console.error('FAIL: route result unexpected', JSON.stringify(routeResult))
  process.exit(1)
}
console.log('OK: driving route via OSRM')

// --- Test 2: geocode (Nominatim, zero key) — may fail on CN networks ---
const geocode = byName['map_geocode']
try {
  const geoResult = await geocode.execute({ address: 'Beijing Tiananmen' }, makeExec(ac.signal))
  console.log('geocode provider:', geoResult.provider, 'loc:', geoResult.location)
  if (geoResult.provider !== 'nominatim' || !Array.isArray(geoResult.location)) {
    console.error('FAIL: geocode result unexpected', JSON.stringify(geoResult))
    process.exit(1)
  }
  console.log('OK: geocode via Nominatim')
} catch (err) {
  // Nominatim unreachable on CN networks is expected; the error must be informative.
  const msg = String(err?.message ?? err)
  console.log('geocode threw (expected on CN networks if Nominatim blocked):', msg)
  if (!/Nominatim|nominatim/.test(msg)) {
    console.error('FAIL: geocode error not informative about Nominatim', msg)
    process.exit(1)
  }
  console.log('OK: geocode failure is informative (Nominatim unreachable)')
}

// --- Test 3: transit without key must fail informatively ---
const transit = byName['map_transit_route']
try {
  await transit.execute({ origin: '116.397428,39.90923', destination: '116.403874,39.915099' }, makeExec(ac.signal))
  console.error('FAIL: transit should have failed without amapKey')
  process.exit(1)
} catch (err) {
  const msg = String(err?.message ?? err)
  console.log('transit threw (expected without amapKey):', msg)
  if (!/amapKey|高德/.test(msg)) {
    console.error('FAIL: transit error missing amapKey guidance', msg)
    process.exit(1)
  }
  console.log('OK: transit requires amapKey with guidance')
}

console.log('\nALL INTEGRATION TESTS PASSED')
process.exit(0)
