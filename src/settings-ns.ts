/**
 * Settings-card wiring for dsh-map-tools.
 *
 * The settings page 设置 → 插件 dispatches our card on the `dsh-map-tools`
 * namespace. The card's real data lives in ~/.dsh-map-tools/config.json
 * behind the loopback route (src/config-route.ts) — the namespace schema here
 * is the free-form object the card reads through the route, never the DSH
 * settings document. Harnesses without the settings service never run the
 * closure.
 *
 * DSH 0.1.2-rc.1 / 0.1.3-alpha.1 起 `@deepseek-ai/dsh-settings` 移除了
 * `installSettingsSection` / `settingsNamespace`（namespace 变成普通小写连字符
 * 字符串，注册与接线改为 SettingsProvider 实例方法）。这里按语义等价物
 * `SettingsProvider.installSection` 迁移：组合入口值作为 base 层，section
 * 变化时重建工具；设置页卡片仍由浏览器端 `settings.plugin.item` 插槽
 * （key = 'dsh-map-tools'）渲染，宿主据此 serve 该 namespace（见
 * packages/client/ui-settings-plugins 的 tab-store：卡片 = 宿主 serve 的
 * namespace ∩ 插槽注册）。
 */
// Type-only: pulls the `@deepseek-ai/cordis` Context merge (ctx.settings).
import type {} from '@deepseek-ai/dsh-settings'
import type { Context } from '@deepseek-ai/cordis'
import { Config as ConfigSchema } from './config.js'
import type { Config as ConfigType } from './config.js'

/** Namespace the settings page keys this plugin's card to (plain string since DSH 0.1.2-rc.1). */
export const MAP_TOOLS_NS = 'dsh-map-tools'

/**
 * Wire the settings section so the card renders. The values live in the
 * config file; the section carries only the composition entry as its base so
 * the page has something to dispatch on.
 *
 * @param ctx - plugin context.
 * @param entry - the composition entry config (schema defaults).
 * @param reload - rebuild tools after a settings change.
 */
export function installSettingsNamespace(ctx: Context, entry: ConfigType, reload: () => void): void {
  ctx.inject(['settings'], (scope) => {
    scope.settings.installSection(
      ctx,
      MAP_TOOLS_NS,
      ConfigSchema,
      entry,
      {
        setSource: (current) => {
          // The tools read ~/.dsh-map-tools/config.json then the composition
          // entry; the section's own value is a dispatch key for the card and
          // is never a tool configuration source.
          void current
        },
        onChange: () => {
          reload()
        },
      },
    )
  })
}
