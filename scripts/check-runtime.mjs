/**
 * The published artifact must load on the oldest Node `engines` promises.
 *
 * package.json says `>= 20`, and that claim is about the *shipped* files: plain
 * ES2022 JavaScript under `lib/`. The suite is TypeScript run by vitest, so "the
 * tests passed on 22" says nothing about whether a Node 20 consumer can load the
 * package at all.
 *
 * This checks the part that claim is actually about: import the built entry, then
 * resolve the config schema — the one thing every code path goes through, and the
 * only place a dependency (`@deepseek-ai/schemastery`) is imported at module
 * scope, so resolving it proves the dependency graph loads and not just the entry.
 *
 * Runs in CI on the floor version, locally as:
 *
 *   pnpm run build && node scripts/check-runtime.mjs
 */

const index = await import('../lib/index.js')

if (typeof index.apply !== 'function') {
  throw new Error('lib/index.js does not export apply(), so the host cannot mount the plugin')
}
if (index.name !== 'dsh-map-tools') {
  throw new Error(`lib/index.js exports name ${JSON.stringify(index.name)}, but the bundle patch mounts "dsh-map-tools"`)
}
if (!Array.isArray(index.inject) || !index.inject.includes('tools')) {
  throw new Error('lib/index.js does not declare the `tools` service it registers into')
}

const { Config, AMAP_APPLY_URL } = await import('../lib/config.js')

const defaults = Config({})
const expected = { provider: 'amap', timeoutMs: 15000, maxQps: 2, defaultMode: 'driving', language: 'zh' }
if (JSON.stringify(defaults) !== JSON.stringify(expected)) {
  throw new Error(`the config schema resolved to unexpected defaults: ${JSON.stringify(defaults)}`)
}
if (typeof Config !== 'function') {
  throw new Error('Config is not callable, so a settings surface cannot render from it')
}
if (AMAP_APPLY_URL !== 'https://console.amap.com/dev/key/app') {
  throw new Error(`the Amap application link is unexpected: ${AMAP_APPLY_URL}`)
}

console.log(`the built entry imports and its config schema resolves on ${process.version}`)
