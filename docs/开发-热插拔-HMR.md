# 开发期热插拔（HMR）：改完源码不用重启 DSH

本文记录**实测验证过**的配方与原理。结论来自读 DSH 源码 + 在本机真机验证
（2026-09-10，DSH 0.1.5-rc.1 / Node v24.13.0）。

## 一句话结论

DSH 底层**支持**插件热替换（内置 `@deepseek-ai/cordis-plugin-hmr`），但默认关着；
而且它有个结构性限制：**装在 `node_modules` 下的插件不可能被热替换**。
所以要让本插件热插拔，需要两件事——打开 `hmr` 行 + 把 profile 里的副本换成
指向本仓库的 **junction**。

## 三层热更新，现状各不相同

| 层 | 机制 | 默认状态 |
|---|---|---|
| 组合层（增删/改配置插件行） | profile 的 `patchReload: live` 监视两份 `cordis.patch.yml` | ✅ web profile 默认开启 |
| 浏览器半边（`client/client.js`） | `dsh-client-hmr` 每 500ms stat 轮询 bundle，SSE 通知浏览器原地换插件 | ✅ 常驻挂载（无需 dev:web；那只是"谁来重写 bundle"） |
| 宿主 Node 半边（`lib/**` 工具与路由） | `cordis-plugin-hmr` 清 Node 模块缓存后重新 `import()` + 原地换 fiber | ❌ 被 `dsh-base` 显式 `disabled: true` |

浏览器半边的热替换**今天就能用**：直接覆盖 profile 里的 `client/client.js`，
约 0.5 秒后浏览器原地换掉卡片（React 组件状态丢失，会话/连接不动）。

## 为什么"装在 node_modules 里"就永远热替换不了

`vendor/hmr/src/index.ts` 的重载判定：

```ts
// 只重载"依赖集合里有被改动文件"的插件
const dependencies = [...await loadDependencies(job, this.declined)]
if (!dependencies.some(dep => this.accepted.has(dep))) continue
```

而 `loadDependencies()` 的第一行：

```ts
async function traverse(job: ModuleJob) {
  if (job.url.startsWith('node:') || job.url.includes('/node_modules/')) return  // ← 直接返回
```

插件入口本身就在 `/node_modules/` 下 → `dependencies` 恒为空 → 判定永远 `continue`，
**静默什么都不做**（不报错、不告警）。`analyzeChanges()` 里还有第二处同样的排除
（`isExcluded = url.includes('/node_modules/')`），挡住依赖图上的向上传播。

这不是配置问题：`disabled`、`ignored`、`root` 怎么配都绕不过去。

## 配方（本机已在用）

### 1. profile 的 patch 层：`~/.dsh/profiles/web/cordis.patch.yml`

```yaml
- id: hmr
  disabled: false
  config:
    root: ['D:/projects/DSH/DSH代码学习/04-插件/dsh-map-tools/lib']
    ignored: ['**/.*', 'cache', 'data']
```

- patch 是**整段替换** `config`（不是深合并），所以 `root`/`ignored` 都要写全。
- `root` 必须指向**仓库**的 `lib`（真实路径），不能指向 profile 里的插件目录：
  后者路径含 `/node_modules/`，会撞上面那条排除。
- 默认 `ignored` 里带 `**/node_modules`，不删掉的话连监视都进不去。
- 这一层是 live 的，**保存即生效**——但第一次开启 `hmr` 行时，进程里已经有一个
  启动器挂的"只管配置"的 HMR 实例（`config: { root: [] }`），所以**首次需要重启一次**。

### 2. 把 profile 的插件副本换成 junction

```powershell
$link = 'C:\Users\Horus\.dsh\profiles\web\node_modules\dsh-map-tools'
Move-Item $link "$link.bak-hmr-copy" -Force
New-Item -ItemType Junction -Path $link -Target 'D:\projects\DSH\DSH代码学习\04-插件\dsh-map-tools'
```

Node 解析 symlink/junction 时会取 realpath，于是模块 URL 变成
`file:///D:/projects/.../lib/index.js`——不含 `/node_modules/`，重载链路整条打通。
顺带**省掉"tsc 后手工拷贝到 profile"这一步**。

⚠️ pnpm 若重新安装 `dsh-map-tools`，junction 会被换回真实副本，热替换随之静默失效，
需要重建 junction。

### 3. 日常循环

```sh
# 改 src/**，然后
node node_modules/typescript/bin/tsc -p tsconfig.json
```

tsc 重写 `lib/*.js` → HMR 检测到变化 → 清模块缓存 → 重新 import → 原地换 fiber。
约 0.1~2 秒生效，无需重启、无需刷新页面。

## 验证手段（也是排查手段）

插件自己的回环路由可以直接从本机探测（不带 `Origin` 头即通过同源栅栏）：

```powershell
Invoke-WebRequest http://127.0.0.1:3080/dsh-map-tools/config -UseBasicParsing -OutFile $p
[System.IO.File]::ReadAllText($p, [System.Text.Encoding]::UTF8)   # 注意：PS 5.1 会按 Latin-1 解响应体
```

改一处可观察的响应字段 + `tsc`，看它是否自动变化，即可判定热替换是否生效。

有用的内部探针（临时加过、已撤）：

- `ctx.get('hmr')` → 拿到 HMR 服务实例，可读 `baseDir` / `config.root`，
  甚至 `hmr.watcher.getWatched()` 看它到底在监视哪些目录。
- `ctx.on('hmr/change' | 'hmr/reload', ...)` → 看事件流；`hmr/reload` 出现即
  代表框架确实发起了重载（重载失败会回滚，旧实例继续跑）。
- `ctx.loader.internal.loadCache.has(import.meta.url)` → 判断本模块是否在 Node 的
  ESM 缓存里（不在就永远不会被 stash）。
- 重载失败的原因只写进 `ctx.logger.warn`，没有 console logger 时不可见；
  临时在 `apply()` 里写文件日志是最快的抓法。

静态检查组合结果：

```sh
node "<DSH安装目录>/apps/cli/lib/bin.js" --profile web --dump-config
# 注释会标出每一行由哪个文件提供、被哪些层 patched
```

## 我们插件侧的要求（已满足）

- 所有注册都必须随 fiber 卸载而撤销：工具走 `ctx.effect`，
  回环路由必须 `ctx.effect(() => webServer.register(...))`
  （`register()` 的 disposer 是唯一撤销手段，同路径重复注册会抛 duplicate，
  而该错误会被 `ctx.inject` 子作用域静默吞掉 —— 见 CHANGELOG "Fixed" 第一条）。
- 设置 namespace 走 `settings.installSection(owner, ...)`，owner 负责清理，已正确。

## 代价与注意

- 重载会重建插件内存态：静态地图缓存、TTL 缓存、`current` 客户端集合（会多几次高德请求）。
- 正在进行的工具调用可能被打断，别在路线规划跑到一半时 `tsc`。
- 浏览器半边的热替换会丢 React 组件状态（会话/连接/工作区不受影响）。
- 热替换是开发期机制：**发布版本不受影响**（生产 profile 不开 `hmr`）。
