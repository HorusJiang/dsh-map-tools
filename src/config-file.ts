/**
 * dsh-map-tools persisted config file (~/.dsh-map-tools/config.json).
 *
 * Follows the modlens pattern: the plugin's API keys and provider choice live
 * in its own file (shared across profiles, never in the DSH settings
 * document), and the settings card reads/writes it through a loopback route.
 */

import { mkdirSync, readFileSync, writeFileSync, lstatSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'

/** The file the plugin's settings card reads and writes. Overridable for tests. */
export function configPath(): string {
  const override = process.env.DSH_MAP_TOOLS_CONFIG
  return override !== undefined && override !== ''
    ? override
    : join(homedir(), '.dsh-map-tools', 'config.json')
}

/** What the plugin persists and serves to the settings card. */
export interface MapToolsFileConfig {
  provider?: 'amap' | 'osm'
  amapKey?: string
  timeoutMs?: number
}

/**
 * Read the shared config, or a thrown error. Only a missing file reads as
 * empty: an existing-but-unparsable file is somebody's configuration, and a
 * card that treated it as empty would overwrite it on the next save.
 */
export function readConfig(): MapToolsFileConfig {
  let raw: string
  try {
    raw = readFileSync(configPath(), 'utf8')
  } catch (error) {
    if ((error as NodeJS.ErrnoException)?.code === 'ENOENT') return {}
    throw new Error(`cannot read ${configPath()}: ${(error as Error)?.message ?? error}`)
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch (error) {
    throw new Error(`cannot parse ${configPath()}: ${(error as Error)?.message ?? error}`)
  }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error(`${configPath()} must hold a JSON object`)
  }
  return parsed as MapToolsFileConfig
}

/** Deprecated config keys, purged on every save (Baidu provider dropped in 0.3.0). */
const DEPRECATED_KEYS = ['baiduAk'] as const

/** Persist a patch onto the config file, then return the new whole. */
export function applyConfig(patch: Partial<MapToolsFileConfig>): MapToolsFileConfig {
  const current = readConfig()
  for (const key of ['provider', 'amapKey', 'timeoutMs'] as const) {
    if (patch[key] !== undefined) {
      if (key === 'amapKey' && patch.amapKey === '') delete current.amapKey
      else current[key] = patch[key] as never
    }
  }
  // Purge deprecated fields (e.g. baiduAk from the pre-0.3.0 Baidu provider)
  // so dead keys don't linger in the config file.
  for (const key of DEPRECATED_KEYS) {
    if (key in current) delete (current as Record<string, unknown>)[key]
  }
  mkdirSync(dirname(configPath()), { recursive: true })
  writeFileSync(configPath(), `${JSON.stringify(current, null, 2)}\n`, { mode: 0o600 })
  return current
}

/** Whether the config file exists (the card can offer "open config file"). */
export function configFileExists(): boolean {
  try {
    lstatSync(configPath())
    return true
  } catch {
    return false
  }
}

/** Non-secret summary served to the settings card (keys are never echoed). */
export function configSummary(): {
  provider: MapToolsFileConfig['provider']
  timeoutMs?: number
  hasAmapKey: boolean
} {
  const c = readConfig()
  return {
    provider: c.provider,
    timeoutMs: c.timeoutMs,
    hasAmapKey: typeof c.amapKey === 'string' && c.amapKey !== '',
  }
}
