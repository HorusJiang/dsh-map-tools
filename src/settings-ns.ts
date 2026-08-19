/**
 * Settings-card wiring for dsh-map-tools.
 *
 * The settings page 设置 → 插件 dispatches our card on the `dsh-map-tools`
 * namespace. The card's real data lives in ~/.dsh-map-tools/config.json
 * behind the loopback route (src/config-route.ts) — the namespace schema here
 * is the free-form object the card reads through the route, never the DSH
 * settings document. Harnesses without the settings service never run the
 * closure.
 */
import type { Context } from '@deepseek-ai/cordis'
import { installSettingsSection, settingsNamespace } from '@deepseek-ai/dsh-settings'
import { Config as ConfigSchema } from './config.js'
import type { Config as ConfigType } from './config.js'

/** Namespace the settings page keys this plugin's card to. */
export const MAP_TOOLS_NS = settingsNamespace('dsh-map-tools')

/**
 * Wire the settings section so the card renders. The values live in the
 * config file; the section carries only the composition entry as its base so
 * the page has something to dispatch on.
 *
 * @param ctx - plugin context.
 * @param entry - the composition entry config (schema defaults).
 * @param reload - rebuild tools after a settings change (none expected for
 *   file-backed values, but kept symmetric with the host wiring).
 */
export function installSettingsNamespace(ctx: Context, entry: ConfigType, reload: () => void): void {
  let source = (): ConfigType => entry
  installSettingsSection(ctx, MAP_TOOLS_NS, ConfigSchema, entry, {
    setSource: (current) => {
      source = current
    },
    onChange: () => {
      // The card writes the config file through the route; the section only
      // needs to refresh tools if the schema-level defaults changed.
      reload()
    },
  })
}
