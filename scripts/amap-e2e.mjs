/**
 * Amap (高德) end-to-end test — requires a real amapKey.
 *
 * Skips (exit 0) when AMAP_API_KEY is not set, so CI without a key stays green.
 * Run from the package dir:
 *   $env:AMAP_API_KEY="your-key"; node scripts/amap-e2e.mjs
 *
 * Verifies the three Amap capabilities against the live API:
 *   1. driving route planning (+ 真实折线几何 / 方案耗时)
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

/**
 * 路线的"曲折度"：折线总长 ÷ 起终点直线距离。
 * 真实道路一定明显大于 1；≈1 说明拿到的是"起终点直线"兜底
 * （高德 v5 不传 show_fields=polyline 时就是这样，卡片会画成一根直棍）。
 */
function sinuosity(line) {
  let sum = 0
  for (let i = 1; i < line.length; i += 1) {
    const dx = (line[i][0] - line[i - 1][0]) * 0.767 // 北纬 40° 附近的经度收缩
    const dy = line[i][1] - line[i - 1][1]
    sum += Math.hypot(dx, dy)
  }
  const straight = Math.hypot(
    (line[line.length - 1][0] - line[0][0]) * 0.767,
    line[line.length - 1][1] - line[0][1],
  )
  return straight > 0 ? sum / straight : 1
}

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
// v5 的方案耗时在 cost.duration；只读 duration 会拿到 0（曾经的 bug）。
if (!(route.durationS > 0)) throw new Error(`route durationS must be > 0, got ${route.durationS} (Amap v5 puts it in cost.duration)`)

// 1b. 长途路线的几何 + 卡片元数据（这是"画出来是不是一根直棍"的护栏）
const long = { origin: '116.378,39.865', destination: '116.6,40.07' } // 北京南站 → 首都机场
const longRoute = await byName['map_driving_route'].execute(long, exec)
const rawPoints = Array.isArray(longRoute.geometry) ? longRoute.geometry : []
console.log('long route geometry points:', rawPoints.length)
if (rawPoints.length < 10) {
  throw new Error(`expected a real polyline (>10 points), got ${rawPoints.length} — Amap v5 needs show_fields=polyline`)
}
const bendiness = sinuosity(rawPoints)
console.log('long route sinuosity:', bendiness.toFixed(3))
if (!(bendiness > 1.02)) throw new Error(`route looks like a straight fallback line (sinuosity ${bendiness.toFixed(3)})`)

const meta = byName['map_driving_route'].output.presentationMeta(long, longRoute)
console.log('card meta:', JSON.stringify({
  kind: meta.kind,
  points: meta.line?.length ?? 0,
  distanceM: meta.distanceM,
  durationS: meta.durationS,
  stepCount: meta.stepCount,
}))
if (meta.kind !== 'route' || !Array.isArray(meta.line) || meta.line.length < 2) {
  throw new Error('presentationMeta must carry a line for the route card: ' + JSON.stringify(meta))
}
if (meta.line.length > 200) throw new Error(`card line must be simplified to <=200 points, got ${meta.line.length}`)
if (!(meta.durationS > 0)) throw new Error('card meta durationS must be > 0')

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
