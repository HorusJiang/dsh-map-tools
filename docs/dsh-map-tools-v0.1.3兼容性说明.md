# dsh-map-tools 与 DeepSeek Harness v0.1.3-alpha.1 兼容性分析报告

> 提交日期：2026-09-05
> 用途：说明 dsh-map-tools@0.4.4 与最新版 DeepSeek Harness（v0.1.3-alpha.1）不兼容的具体原因，并给出新版本插件开发/迁移的可行路径。
>
> **更新（2026-09-05，dsh-map-tools@0.5.0）**：本报告描述的断点已修复——`src/settings-ns.ts`
> 迁移到 `SettingsProvider.installSection` 新 API（见第 5 节"方式 B"），peerDependencies
> 提升至 `>=0.1.2-rc.1`（npm 发布的 0.1.2-rc.1 已是新 API 线，0.1.3-alpha.1 源码构建同样兼容），
> 并修复了设置卡片保存后未立即重建工具的缺陷。本文件留档作为该次升级的分析记录。

## 1. 环境与版本

| 项目 | 值 |
| --- | --- |
| 操作系统 | Windows（10.0.26200） |
| Node.js | v24.13.0 |
| pnpm | 11.7.0 |
| DeepSeek Harness | `v0.1.3-alpha.1`（tag `dsh-v0.1.3-alpha.1`，commit `d347e70`） |
| Harness 部署方式 | 从 GitHub tag 下载源码，`pnpm run build:official` 官方构建 |
| dsh-map-tools | `0.4.4`（npm registry，作者 HorusJiang，仓库 `github.com/HorusJiang/dsh-map-tools`） |
| 安装位置 | `%USERPROFILE%\.dsh\profiles\web`（profile 插件层） |

## 2. 现象（完整启动报错）

在 v0.1.3-alpha.1 下启动 `dsh web`，插件树加载失败，关键错误：

```text
Error: failed to import loader entry map-tools (dsh-map-tools):
The requested module '@deepseek-ai/dsh-settings' does not provide an export named 'installSettingsSection'

  at file:///C:/Users/Horus/.dsh/profiles/web/node_modules/dsh-map-tools/lib/settings-ns.js:1
  import { installSettingsSection, settingsNamespace } from '@deepseek-ai/dsh-settings';
```

当前本机为了先让 Harness 正常启动，已通过 profile 的
`cordis.patch.yml` 临时禁用该插件：

```yaml
- id: map-tools
  disabled: true
```

禁用后 Harness 全部功能（新建会话、历史会话、模型请求、工具调用）验证正常；本报告即针对恢复该插件所需的修改。

## 3. 根因：DSH 0.1.3 对 settings 能力的重构

### 3.1 旧 API（dsh-map-tools 当前使用）

`@deepseek-ai/dsh-settings` 在 Harness ≤ 0.1.2 时期导出：

```ts
import { installSettingsSection, settingsNamespace } from '@deepseek-ai/dsh-settings'
const NS = settingsNamespace('dsh-map-tools')           // namespace 工厂
installSettingsSection(ctx, NS, schema, entry, hooks)     // 注册设置卡片并接线
```

### 3.2 新 API（v0.1.3-alpha.1，源码 `packages/settings/settings/src/index.ts`）

0.1.3 起 `@deepseek-ai/dsh-settings` 的公开面：

```ts
export { redactSecrets }
export type { RedactedSecret, RedactedValue }
export type { SettingsNamespace, SettingsUpdateSource }
export type SettingsApplies = 'live' | 'restart'
export interface SettingsRegisterOptions<T> { base?; applies?; validate? }
export interface SettingsDescriptor { ns; schema; value; revision; base?; user?; applies; secrets? }
export interface SettingsScope<T> { get(); watch(cb): () => void; update(patch); replace(section) }
export class SettingsConflictError
export type SettingsPathOp
export abstract class SettingsProvider   // 默认导出
```

关键变化：

1. **`installSettingsSection` / `settingsNamespace` 已删除**。
2. namespace 就是普通的小写连字符字符串（如 `'dsh-map-tools'`），由
   `SettingsProvider.register()` 内部校验，不再需要工厂函数。
3. 注册与接线改为 provider 实例方法：

```ts
// 方式 A：只注册 namespace + schema（设置页自动渲染 schema 卡片）
const scope = ctx.settings.register('dsh-map-tools', ConfigSchema, {
  base: entry,            // 可选：组合层默认值
  applies: 'live',        // 可选：'live' | 'restart'
  validate: (v) => {},    // 可选
})
scope.get()               // 读取当前已解析配置
scope.update(patch)       // 写入/合并
scope.replace(section)    // 整体替换

// 方式 B：需要“配置源切换 + 变更回调”的消费方接线（与旧 installSettingsSection 语义最接近）
ctx.settings.installSection(
  owner,                  // 插件 Context（用于判定卸载）
  'dsh-map-tools',
  ConfigSchema,
  entry,                  // 组合入口默认值
  {
    setSource(current: () => T): void {}
    onChange(): void {}
    validate?: (v: T) => void
  },
)
```

4. 设置页卡片由浏览器端根据 `ctx.settings.describe()`（schema.toJSON）自动渲染，
   宿主侧不再需要“手动安装 section”来驱动卡片。

> 附带确认：`SettingsConflictError`、`SettingsNamespace`、`redactSecrets` 等仍导出，
> 已适配插件（见第 5 节）可继续使用。

## 4. dsh-map-tools@0.4.4 的 API 使用面核对

对安装包 `lib/`、`client/` 全量检索 `@deepseek-ai/*` 引用后：

| DSH 包 | 使用位置 | 0.1.3-alpha.1 兼容性 |
| --- | --- | --- |
| `@deepseek-ai/dsh-settings` | `lib/settings-ns.js`：`installSettingsSection`、`settingsNamespace` | ❌ **不兼容**（导出已删除），唯一硬断点 |
| `@deepseek-ai/dsh-tools` | `lib/tools/{routes,geocode,poi}.js`：`defineTool` | ✅ 仍存在（`packages/core/tools/src/schema.ts:545`） |
| `@deepseek-ai/dsh-client-ui-primitives` | `client/client.js`：动态 `require`（设置卡片 UI） | ✅ 用法为惰性加载，需按第 5 节再核对一次注入名 |
| `@deepseek-ai/schemastery` | `lib/config.js` | ✅ 由 Harness 提供 |

其余说明：

- 客户端的设置卡片已经使用新式 slot 注入（`settings.plugin.item`），并通过自有路由
  `/dsh-map-tools/config` 读写配置（密钥存 `~/.dsh-map-tools/config.json`，不回传）。
  说明插件此前已经部分迁移到新架构，**只剩宿主侧 `settings-ns.js` 一处旧接口未改**。
- `peerDependencies` 仍声明 `@deepseek-ai/dsh-settings: ^0.1.0-rc.5`、`@deepseek-ai/dsh-tools: ^0.1.0-rc.5`，
  需要提升到与目标 Harness 同一发布线（0.1.3-alpha.1 对应的 `@deepseek-ai/dsh-*` 版本）。

## 5. 建议的迁移方案（最小改动）

### 5.1 修改 `lib/settings-ns.js`

```ts
// 删除：
// import { installSettingsSection, settingsNamespace } from '@deepseek-ai/dsh-settings';

// 改法（按第 3.2 节“方式 B”，保留原有 setSource/onChange 语义）：
export const MAP_TOOLS_NS = 'dsh-map-tools'

export function installSettingsNamespace(ctx, entry, reload) {
  let source = () => entry
  ctx.settings.installSection(
    ctx,                 // owner：插件 Context
    MAP_TOOLS_NS,
    ConfigSchema,
    entry,
    {
      setSource: (current) => { source = current },
      onChange: () => { reload() },
    },
  )
}
```

若插件并不依赖源切换/变更回调，也可直接使用方式 A：

```ts
ctx.settings.register(MAP_TOOLS_NS, ConfigSchema)
```

### 5.2 确保 `settings` 服务已注入

插件入口 `apply(ctx, config)` 中确认通过 `ctx.inject(['settings'], ...)` 取得 provider
（0.1.3 中 `ctx.settings` 是 `Context` 上声明的服务，可直接使用；若旧代码依赖
`installSettingsSection` 的内部注入，则必须显式注入后再调用）。

### 5.3 更新包元数据

- `peerDependencies` 改为目标发布线版本（如 `@deepseek-ai/dsh-settings`、
  `@deepseek-ai/dsh-tools` 均改为与 Harness 一致的 0.1.3-alpha.1 系列）。
- 可选：在 `dsh.engines.dsh` 声明最低版本（参考 dsh-context 等插件做法）。

### 5.4 验证清单（在 Windows 本机执行）

```powershell
# 1) 安装后确认插件能被组合（应能看到 map-tools）
pnpm dsh web --dump-config | Select-String "map-tools"

# 2) 启动无报错
pnpm dsh web --no-open

# 3) 浏览器：设置 → 插件 → dsh-map-tools 卡片可正常编辑/保存
# 4) 实际调用一次地图/路径规划工具（高德 key 注意 QPS/每日配额）
```

开发侧可直接把 profile 中的禁用条目移除后重新安装验证：

```yaml
# %USERPROFILE%\.dsh\profiles\web\cordis.patch.yml
# 删除下面两条即恢复
- id: map-tools
  disabled: true
```

## 6. 参考：已完成适配的第三方插件（可作为实现范例）

| 插件 | 版本 | 新写法 |
| --- | --- | --- |
| `dsh-context` | 0.42.0 | `sctx.settings.register(SETTINGS_NAMESPACE, SettingsSchema)`（`lib/index.js`），namespace 为普通字符串常量 |
| `dsh-better-sidebar` | 0.18.0 | `import { SettingsConflictError }` + `sctx.settings.register(ns, PrefsSchema)` |

两者都保留 0.1.3 仍导出的 `SettingsConflictError`，并且设置在宿主注册后由设置页
schema 驱动渲染，无需再手写 section 安装桥接。

## 7. 其他与本插件无关、但开发时需知道的环境点

- v0.1.3-alpha.1 新增原生依赖 `fs-ext`（POSIX 会话锁），Windows 无预编译产物，
  本机通过 `pnpm patch` 提供惰性回退解决（Windows 上从不调用 flock）。若开发环境
  需要原生编译，请安装 Visual Studio C++ 构建工具。
- v0.1.3 会话持久化 API 改为生命周期 `SessionHandle`、`agentLoop.create()` 变异步、
  会话日志格式升级 v2（旧格式自动迁移）；这些对未被影响的工具定义类插件通常无感。
- 官方更新日志已注明 0.1.3 存在“部分历史会话加载变慢”的已知性能回退，与本插件无关。

## 8. 结论

dsh-map-tools@0.4.4 与 v0.1.3-alpha.1 只有**一处宿主侧 API 断点**：
`lib/settings-ns.js` 使用的 `installSettingsSection` / `settingsNamespace`
在 0.1.3 已删除。工具定义（`defineTool`）、客户端 slot 注入、自有配置路由均无需改动。
按第 5 节做最小迁移、更新包元数据并重新发布，即可兼容 0.1.3-alpha.1。
