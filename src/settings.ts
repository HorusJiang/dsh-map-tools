/**
 * Settings wiring: exposes the plugin Config as an editable settings section
 * (腾讯地图连接器-style "高德 Key 配置" card on the plugin configuration page).
 *
 * Mirrors dshmarket's pattern: installSettingsSection registers our namespace
 * with the composition entry as base; the browser settings page renders a form
 * from the Schemastery schema — the amapKey field (role: secret) plus the
 * "如何获取高德 Key?" guidance link carried in its description.
 */
import { installSettingsSection, settingsNamespace } from '@deepseek-ai/dsh-settings'
import type { Context } from '@deepseek-ai/cordis'
import { Config, type Config as ConfigType } from './config.js'

/** Namespace the settings card keys itself to. */
export const MAP_TOOLS_SETTINGS_NS = settingsNamespace('dsh-map-tools')

/**
 * Wire the settings section so a saved amapKey reaches the live runtime.
 *
 * @param ctx - plugin context.
 * @param resolved - the live config object the tools read (mutated on change).
 * @param reload - callback to re-create clients after a config change.
 */
export function installMapSettings(ctx: Context, resolved: ConfigType, reload: () => void): void {
  let source = (): ConfigType => resolved
  installSettingsSection(ctx, MAP_TOOLS_SETTINGS_NS, Config, resolved, {
    setSource: (current) => {
      source = current
    },
    onChange: () => {
      const next = source()
      // Update the live config object in place so tools pick up the change.
      Object.assign(resolved, next)
      reload()
    },
  })
}
