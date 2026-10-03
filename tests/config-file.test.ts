import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { mkdtempSync, writeFileSync, rmSync, existsSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { applyConfig, configPath, configSummary, readConfig } from '../src/config-file.js'

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

describe('config-file', () => {
  it('reads empty config when the file is missing', () => {
    expect(readConfig()).toEqual({})
  })

  it('applies a patch and persists it', () => {
    applyConfig({ provider: 'amap', amapKey: 'test-key', timeoutMs: 20000, maxQps: 4 })
    const saved = readConfig()
    expect(saved.provider).toBe('amap')
    expect(saved.amapKey).toBe('test-key')
    expect(saved.timeoutMs).toBe(20000)
    expect(saved.maxQps).toBe(4)
  })

  it('clears a key when patched with an empty string', () => {
    applyConfig({ amapKey: 'test-key' })
    expect(readConfig().amapKey).toBe('test-key')
    applyConfig({ amapKey: '' })
    expect(readConfig().amapKey).toBeUndefined()
  })

  it('summary never echoes secret values', () => {
    applyConfig({ provider: 'amap', amapKey: 'super-secret-key' })
    const summary = configSummary()
    expect(summary.hasAmapKey).toBe(true)
    expect(JSON.stringify(summary)).not.toContain('super-secret-key')
    expect(JSON.stringify(summary)).not.toContain('amapKey')
  })

  it('throws on an unparsable existing file instead of overwriting it', () => {
    writeFileSync(configPath(), 'not json{', 'utf8')
    expect(() => readConfig()).toThrow(/cannot parse/)
  })

  it('creates the config file on first apply', () => {
    expect(existsSync(configPath())).toBe(false)
    applyConfig({ provider: 'osm' })
    expect(existsSync(configPath())).toBe(true)
  })

  it('purges deprecated fields (baiduAk) on save', () => {
    writeFileSync(configPath(), JSON.stringify({ provider: 'amap', amapKey: 'test-key', baiduAk: 'old-ak' }), 'utf8')
    applyConfig({ timeoutMs: 30000 })
    const saved = readConfig()
    expect('baiduAk' in saved).toBe(false)
    expect(saved.amapKey).toBe('test-key')
    expect(saved.timeoutMs).toBe(30000)
  })

  // `defaultMode` was documented from 0.1.0 but no code path ever read it, so it was
  // removed from the schema. A user file that still carries it is cleaned up on the
  // next save — including the other keys, which must survive the purge.
  it('purges the removed defaultMode field on save, keeping its neighbours', () => {
    writeFileSync(
      configPath(),
      JSON.stringify({ provider: 'osm', defaultMode: 'walking', maxQps: 2 }),
      'utf8',
    )
    applyConfig({ timeoutMs: 30000 })
    const saved = readConfig()
    expect('defaultMode' in saved).toBe(false)
    expect(saved.provider).toBe('osm')
    expect(saved.maxQps).toBe(2)
    expect(saved.timeoutMs).toBe(30000)
  })

  // The file holds an API key, so its resting permissions matter. `writeFileSync`'s
  // `mode` only applies at creation and Node ignores POSIX mode bits on Windows, where
  // the plugin uses `icacls` instead — so this assertion is meaningful on POSIX only.
  it.skipIf(process.platform === 'win32')('tightens an existing over-permissive file to 0600', () => {
    writeFileSync(configPath(), JSON.stringify({ amapKey: 'k' }), { encoding: 'utf8', mode: 0o644 })
    expect(statSync(configPath()).mode & 0o777).toBe(0o644)

    applyConfig({ timeoutMs: 1234 })

    // Not just on creation: an already-wider file is narrowed rather than left as it was.
    expect(statSync(configPath()).mode & 0o777).toBe(0o600)
  })
})
