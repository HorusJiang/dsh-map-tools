/**
 * Integration: config-file read/write round-trip through the same functions
 * the loopback route calls (configSummary + applyConfig), with a real file in
 * a temp dir. Verifies the settings-card data path end to end:
 *   POST-like apply → file persisted → summary hides keys → reload sees values.
 */
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { applyConfig, configSummary, readConfig, configPath } from '../lib/config-file.js'

const tmp = mkdtempSync(join(tmpdir(), 'dsh-map-tools-e2e-'))
process.env.DSH_MAP_TOOLS_CONFIG = join(tmp, 'config.json')

try {
  // 1. Summary with no config: nothing configured.
  const empty = configSummary()
  console.log('empty summary:', JSON.stringify(empty))
  if (empty.hasAmapKey || empty.hasBaiduAk || empty.provider !== undefined) throw new Error('expected empty summary')

  // 2. Apply an amap config (as the settings card POST would).
  applyConfig({ provider: 'amap', amapKey: 'amap-live-test-key', timeoutMs: 20000 })
  const saved = readConfig()
  console.log('saved:', JSON.stringify({ provider: saved.provider, hasKey: !!saved.amapKey, timeoutMs: saved.timeoutMs }))
  if (saved.provider !== 'amap' || saved.amapKey !== 'amap-live-test-key') throw new Error('apply did not persist')

  // 3. Summary must NOT echo the key literal.
  const summary = configSummary()
  const raw = JSON.stringify(summary)
  console.log('summary (secrets hidden):', raw)
  if (raw.includes('amap-live-test-key')) throw new Error('summary leaked the key!')
  if (!summary.hasAmapKey) throw new Error('summary should report hasAmapKey')

  // 4. Clear the key (empty-string patch like the card's clear control).
  applyConfig({ amapKey: '' })
  const afterClear = configSummary()
  if (afterClear.hasAmapKey) throw new Error('clear did not remove the key')

  console.log('\nCONFIG ROUND-TRIP OK:', configPath())
  process.exit(0)
} catch (err) {
  console.error('FAIL:', err instanceof Error ? err.message : err)
  process.exit(1)
} finally {
  rmSync(tmp, { recursive: true, force: true })
}
