import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { mkdtempSync, writeFileSync, rmSync, existsSync } from 'node:fs'
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
    applyConfig({ provider: 'amap', amapKey: 'test-key', timeoutMs: 20000 })
    const saved = readConfig()
    expect(saved.provider).toBe('amap')
    expect(saved.amapKey).toBe('test-key')
    expect(saved.timeoutMs).toBe(20000)
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
})
