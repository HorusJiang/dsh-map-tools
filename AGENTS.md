# AGENTS.md — 给 AI Agent 的协作指南

本文档为在 dsh-map-tools 仓库中工作的 AI Agent 提供约定。目标是让任何 agent（或人）在此仓库修改代码时，都能遵循一致的开发、测试与发布流程。

## 仓库结构

```
src/
  index.ts          # 插件入口：buildClients（配置文件优先）+ apply
  config.ts         # Schemastery 配置 schema + 申请链接常量
  config-file.ts    # ~/.dsh-map-tools/config.json 读写（仅属主）
  config-route.ts   # 回环路由 /dsh-map-tools/config（同源校验）
  settings-ns.ts    # 老宿主设置页 namespace 注册（新宿主走 bundle 座位）
  clients/          # 数据源客户端
    amap.ts         #   高德 Web 服务 API（推荐数据源）
    osrm.ts         #   OSRM 免费路线（兜底）
    photon.ts       #   Photon 免费地理编码（兜底）
    nominatim.ts    #   Nominatim 免费地理编码（兜底）
  tools/            # 7 个原生工具定义（defineTool）
    routes.ts       #   map_driving/transit/walking/bicycling_route
    geocode.ts      #   map_geocode / map_reverse_geocode
    poi.ts          #   map_poi_search
  types.ts          # 共享类型（LngLat / RouteResult / GeocodeResult 等）
client/client.js    # bundle 配置页 + 路线卡片（手写 lazy-CJS bundle，零构建零依赖）
tests/              # vitest 单元测试（mock fetch，不碰真实网络）
scripts/            # smoke / integration / amap-e2e / config-e2e / publish
```

## 硬性约定

### 数据源

- **高德是唯一主数据源**：所有面向用户的完整能力（公交、POI、中文地理编码）依赖高德 key。
- **免费源（OSRM/Photon/Nominatim）只是兜底**：驾车/步行/骑行路线可用；**中文地理编码不可靠**（Photon 对 CJK 返回 400、Nominatim 国内不可达）——这是设计行为，**不要试图"修复"为可用**，而是保证给出清晰的中文引导提示。
- **不要重新引入百度**：百度 JS-API 的 ak 无法用于服务端调用（已移除，见 CHANGELOG 0.3.0）。

### 配置

- 配置只存 **`~/.dsh-map-tools/config.json`**（仅属主可读写），不存 DSH 设置文档。
  POSIX 上是 `chmod 0600`；Windows 上 Node 忽略 POSIX mode 位，改用 `icacls` 去掉继承的
  ACE（见 `restrictToOwner()`）。**改动这条时两个平台都要照顾到**——只写 `mode: 0o600`
  在 Windows 上等于没写（实测落盘 `0o666`）。
- key **绝不**回显到前端或日志；路由只返回 `hasAmapKey` 布尔。
- 配置优先级：配置文件 → `cordis.yml` 默认值。修改 buildClients 时保持这个优先级。
- 配置文件路径可通过 `DSH_MAP_TOOLS_CONFIG` 环境变量覆盖（测试用）。

### 工具

- 每个工具必须用 `defineTool`，声明 `output.schema`（规范 JSON）+ `output.render`（模型可见文本）。
- 错误消息必须**面向用户可操作**：中文地址解析失败时给出"提供 lng,lat 坐标"或"配置高德 key（含链接）"的引导。
- 坐标统一 `LngLat = [lng, lat]`；入参支持地址文本或 `"lng,lat"`。

### client 卡片

- `client/client.js` 是**手写 lazy-CJS bundle**（`window.__ModuleLoader__.load`），零构建、零依赖：**只 require `react`**。不要再 require `@deepseek-ai/dsh-client-ui-primitives` 之类的客户端包——运行中的宿主模块表未必有它，`require` 抛错会把整张卡带走。
- 配置卡注册在 **`plugins.bundle.config`**（keyed，key = 包名 `dsh-map-tools`，宿主画标题/描述/开关，插件只画内容）；**老宿主**（DSH ≤ 0.1.5，没有这个座位）回落到 `settings.plugin.item`（list，`id` + `key` + `order`）。两条注册都要留：`slots.inject` 只对宿主**已声明**的座位触发工厂，所以这是能力探测，不是版本判断。
- 卡片数据走 `/dsh-map-tools/config` 回环路由，**不直接写 DSH 设置**。
- 主题变量只用 `--dsw-alias-*` 里**真实存在**的名字（对照 `ui-theme` 的 `design-platform.css` 或运行时 token 表）。不存在的名字会静默落到 fallback、深浅色不跟随——`--dsw-alias-accent` / `--dsw-alias-border` / `--dsw-alias-bg-elevated` 就是踩过的三个。`tests/client-card.test.ts` 里有一张登记表守着这条。
- 卡片是**暂存 + 显式保存**：离开页面丢弃暂存（所以没有「取消」按钮）、非法草稿**拦住**保存而不是被改写、只发改动过的字段、保存后**从宿主回读**再播种（key 输入框随之回到空白）。
- 修改后必须 `node --check client/client.js` 验证语法。

## 开发流程

```sh
pnpm install
pnpm hooks         # 安装 pre-commit secret guard（开发者手动；见"不要做的事"）
pnpm run build     # tsc → lib/（必须通过）
pnpm test          # vitest 单元测试（必须全绿）
node scripts/smoke.mjs   # 7 工具注册检查
node scripts/check-tarball.mjs   # 发布包不含本地状态、也不缺消费者需要的文件
node scripts/check-runtime.mjs   # 构建产物能在声明的最低 Node 上加载（需先 build）
```

- 单元测试用 `vi.stubGlobal('fetch', ...)` mock 网络，**不要**在 tests/ 里发真实请求。
- 真实请求验证用 `scripts/integration.mjs`（免费源）和 `scripts/amap-e2e.mjs`（需 `AMAP_API_KEY`）。
- **调试/验证脚本绝不硬编码 key**：需要真实 key 的脚本一律从 `process.env.AMAP_API_KEY` 读取（对齐 `scripts/amap-e2e.mjs` 范本）；临时诊断脚本用完即删，禁止把 key 写进任何脚本文件。
- 新增/修改 client.js 后：`node --check` 语法 + `node scripts/config-e2e.mjs` 配置回环。

## 测试政策

- 任何面向模型的工具变更必须补充/更新对应单元测试。
- 修改配置文件读写必须更新 `tests/config-file.test.ts`。
- 修改 `client/client.js` 必须更新 `tests/client-card.test.ts`（该文件直接加载随包发布的 client.js，跑的就是浏览器那份字节）。
- 提交前确认：`build` 绿、`test` 全绿、`smoke` 绿。

## 发布流程

发版走 CI（`.github/workflows/release.yml`），而且是**两段式**。**完整说明、失败处理与恢复步骤见 [RELEASING.md](RELEASING.md)**；这里只列顺序，改动发版逻辑前请先读那一份。

1. 更新 `CHANGELOG.md`（版本号 + 变更分类 Added/Fixed/Changed/Removed）。
2. 按 SemVer 提升 `package.json` 版本（tag 与 `package.json` 必须一致，CI 会拦）。
3. `pnpm run build && pnpm test` 全绿。
4. **走 PR 合并到 `master`**——分支保护要求 PR + required status checks，直推会被拒。
5. 在合并提交上 `git tag -a vX.Y.Z -m "dsh-map-tools vX.Y.Z" && git push origin vX.Y.Z`：CI 跑闸门（build / test / smoke / check-tarball）后执行 `npm stage publish`，**只 staging**（此时谁都装不到），并留下一个**草稿** Release。**推 tag 不受分支保护影响。**
6. 维护者用 2FA 批准：`npm stage list dsh-map-tools` → `npm stage approve <stage-id>`（或 npmjs.com → Staged Packages），再 `gh release edit vX.Y.Z --draft=false` 把草稿转正。CI 的 run summary 会打印这几条命令。
7. 手动/无 CI 时的等价物：`node scripts/publish.mjs`（**默认两段式**）/ `--direct`（直发，见下）/ `--verify-only`（事后核对可安装性）。

- **不要本地直发。** 直发的版本没有 provenance，而 npm 不允许已发布版本再次 staging，所以**该版本无法补救**，之后每次推它的 tag 都会让 release run 变红。`release.yml` 里的 `unprovenanced` 检查就是为此存在的；`workflow_dispatch` + `acknowledge_unprovenanced` 是给已经发生的意外留的唯一出口，且 tag 触发满足不了它。
- 一次性配置：npm 包的 Trusted publishing 需要一条 GitHub Actions 连接（repository `dsh-map-tools`、workflow `release.yml`、**`allowed actions` 不勾 `npm publish`**），见 `release.yml` 顶部注释。
- 所有 `uses:` 都 pin 到 commit SHA（`release` job 持有 `contents: write`）。Dependabot 每周升这些 pin，不要关。
- "发布成功"的判据只有一条：**全新缓存 + `--prefer-online` 真能拉到 tarball**（并与本地构建产物对照 sha1）。网站上的 `Published` 和 `npm view` 都比 tarball 传播得早，**不能**当"能装上"的判据。

## 提交信息规范

遵循 Conventional Commits：`feat:` / `fix:` / `refactor:` / `docs:` / `test:` / `ci:` / `chore:`，正文说明动机与影响面。

## 不要做的事

- 不引入新的运行时依赖（保持零依赖 / 仅 @deepseek-ai 官方 peer）。
- 不把 key 写入代码、README 示例或任何可提交文件。
- 不改动 `cordis.patch.yml` 的插件 id（`map-tools`）——影响已安装用户。
- 不引入百度/其他需要额外白名单配置的数据源。
- 不在仓库内创建 `config.json` / `.env` / 密钥文件；两道守卫都会拦：**pre-commit 钩子**（`scripts/check-secrets.mjs`，开发者用 `pnpm hooks` 安装，只扫暂存区）与 **CI**（同一个脚本的 `--all` 模式，扫全部已跟踪文件——暂存区在 CI 里是空的，不换模式等于什么都没扫）。改这个脚本后必须验证两件事：**假 key 被拒**、**正常树放行**。
