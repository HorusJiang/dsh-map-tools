/**
 * dsh-map-tools persisted config file (~/.dsh-map-tools/config.json).
 *
 * Follows the modlens pattern: the plugin's API keys and provider choice live
 * in its own file (shared across profiles, never in the DSH settings
 * document), and the settings card reads/writes it through a loopback route.
 */

import { mkdirSync, readFileSync, writeFileSync, lstatSync, chmodSync, existsSync } from 'node:fs'
import { homedir, userInfo } from 'node:os'
import { dirname, join } from 'node:path'
import { execFileSync } from 'node:child_process'

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
  maxQps?: number
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

/**
 * Deprecated config keys, purged on every save.
 *
 * - `baiduAk` — the Baidu provider was dropped in 0.3.0.
 * - `defaultMode` — documented since 0.1.0 but never consumed by any code path (the four
 *   route tools each fix their own mode, so a "default mode" had nothing to apply to).
 *   Removed from the schema in 0.7.4; purged here so it does not linger in user files.
 */
const DEPRECATED_KEYS = ['baiduAk', 'defaultMode'] as const

/**
 * Restrict the config file to its owner.
 *
 * `writeFileSync(..., { mode: 0o600 })` only applies the mode when it *creates* the
 * file, and Node ignores POSIX mode bits on Windows entirely — so on Windows, the
 * author's own platform, the documented "0600" was not a control at all: the file
 * inherited the profile ACL, where `BUILTIN\Users` can read it. Measured on
 * Node v24.13.0: `writeFileSync(p, "x", { mode: 0o600 })` leaves `mode` at `0o666`.
 *
 * So the mode is enforced explicitly on every write, and by the platform's own tool on
 * Windows. Both paths are best-effort: a filesystem that cannot express ownership
 * (a FAT volume, a network share, an unusual ACL) must not make saving a config fail.
 */
function restrictToOwner(path: string): void {
  try {
    if (process.platform === 'win32') {
      // Resolved to an absolute path rather than looked up through `PATH`: a hostile or
      // merely unusual PATH must not redirect this to a different `icacls`.
      // (SonarCloud S4036 flags the bare-name form for exactly that reason.)
      const icacls = join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'icacls.exe')
      if (!existsSync(icacls)) return
      // /inheritance:r drops inherited ACEs, /grant:r replaces the rest with this user.
      const who = process.env.USERNAME ?? userInfo().username
      execFileSync(icacls, [path, '/inheritance:r', '/grant:r', `${who}:F`], { stdio: 'ignore' })
    } else {
      // Runs on every write, not only on creation: an existing file with wider
      // permissions is tightened rather than left as it was.
      chmodSync(path, 0o600)
    }
  } catch {
    // Best effort. The file is still written and readable to its owner; failing to
    // narrow the ACL is not a reason to lose the user's configuration.
  }
}

/** Persist a patch onto the config file, then return the new whole. */
export function applyConfig(patch: Partial<MapToolsFileConfig>): MapToolsFileConfig {
  const current = readConfig()
  for (const key of ['provider', 'amapKey', 'timeoutMs', 'maxQps'] as const) {
    if (patch[key] !== undefined) {
      if (key === 'amapKey' && patch.amapKey === '') delete current.amapKey
      else current[key] = patch[key] as never
    }
  }
  // Purge deprecated fields (e.g. baiduAk from the pre-0.3.0 Baidu provider, and
  // defaultMode, which never had a code path that consumed it).
  for (const key of DEPRECATED_KEYS) {
    if (key in current) delete (current as Record<string, unknown>)[key]
  }
  const dir = dirname(configPath())
  mkdirSync(dir, { recursive: true, mode: 0o700 })
  writeFileSync(configPath(), `${JSON.stringify(current, null, 2)}\n`, { mode: 0o600 })
  restrictToOwner(configPath())
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
  maxQps?: number
  hasAmapKey: boolean
} {
  const c = readConfig()
  return {
    provider: c.provider,
    timeoutMs: c.timeoutMs,
    maxQps: c.maxQps,
    hasAmapKey: typeof c.amapKey === 'string' && c.amapKey !== '',
  }
}
