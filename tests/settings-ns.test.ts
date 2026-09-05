import { describe, expect, it, vi } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import { installSettingsNamespace, MAP_TOOLS_NS } from '../src/settings-ns.js'
import { Config } from '../src/config.js'
import type { Config as ConfigType } from '../src/config.js'

/** What the real SettingsProvider.installSection consumes (subset). */
interface SettingsSectionHooks {
  setSource: (current: () => ConfigType) => void
  onChange: () => void
}

/** Records the installSection call; returns the settings-scope stub to inject. */
function stubSettings() {
  const installed: Array<{
    ns: string
    schema: unknown
    entry: ConfigType
    hooks: SettingsSectionHooks
  }> = []
  const settings = {
    installSection: (
      _owner: unknown,
      ns: string,
      schema: unknown,
      entry: ConfigType,
      hooks: SettingsSectionHooks,
    ) => {
      installed.push({ ns, schema, entry, hooks })
    },
  }
  return { settings, installed }
}

/** Context whose inject() hands the callback the stub settings scope. */
function contextWithSettings(settings: unknown) {
  const ctx = new Context()
  ;(ctx as unknown as {
    inject: (deps: string[], cb: (scope: { settings: unknown }) => void) => void
  }).inject = (_deps, cb) => cb({ settings })
  return ctx
}

describe('settings-ns (DSH ≥ 0.1.2-rc.1 API)', () => {
  it('registers the plain-string namespace via SettingsProvider.installSection', () => {
    const { settings, installed } = stubSettings()
    const ctx = contextWithSettings(settings)
    const entry: ConfigType = { provider: 'amap', timeoutMs: 15000, maxQps: 2, defaultMode: 'driving', language: 'zh' }
    installSettingsNamespace(ctx, entry, () => {})

    expect(installed).toHaveLength(1)
    const section = installed[0]!
    // 0.1.3 removed settingsNamespace(): the namespace is an ordinary
    // lowercase-hyphen string the provider validates itself.
    expect(MAP_TOOLS_NS).toBe('dsh-map-tools')
    expect(MAP_TOOLS_NS).toMatch(/^[a-z][a-z0-9-]*$/)
    expect(section.ns).toBe('dsh-map-tools')
    expect(section.schema).toBe(Config)
    expect(section.entry).toBe(entry)
  })

  it('rebuilds the tools when the section onChange fires (attach/commit/detach)', () => {
    const { settings, installed } = stubSettings()
    const ctx = contextWithSettings(settings)
    const reload = vi.fn()
    installSettingsNamespace(ctx, {} as ConfigType, reload)

    expect(reload).not.toHaveBeenCalled()
    installed[0]!.hooks.onChange()
    expect(reload).toHaveBeenCalledTimes(1)
    installed[0]!.hooks.onChange()
    expect(reload).toHaveBeenCalledTimes(2)
  })

  it('accepts the source thunk without using it (config lives in the file, not the section)', () => {
    const { settings, installed } = stubSettings()
    const ctx = contextWithSettings(settings)
    installSettingsNamespace(ctx, {} as ConfigType, () => {})

    const scope: ConfigType = { provider: 'osm', timeoutMs: 9000, maxQps: 2, defaultMode: 'walking', language: 'zh' }
    expect(() => installed[0]!.hooks.setSource(() => scope)).not.toThrow()
  })

  it('stays inert when the settings service is not composed (no card served)', () => {
    const ctx = new Context()
    ;(ctx as unknown as { inject: (deps: string[], cb: () => void) => void }).inject = () => {}
    const reload = vi.fn()
    expect(() => installSettingsNamespace(ctx, {} as ConfigType, reload)).not.toThrow()
    expect(reload).not.toHaveBeenCalled()
  })
})
