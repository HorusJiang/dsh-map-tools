# AGENTS.md — 给 AI Agent 的协作指南

本文档为在 dsh-map-tools 仓库中工作的 AI Agent 提供约定。目标是让任何 agent（或人）在此仓库修改代码时，都能遵循一致的开发、测试与发布流程。

## 仓库结构

```
src/
  index.ts          # 插件入口：buildClients（配置文件优先）+ apply
  config.ts         # Schemastery 配置 schema + 申请链接常量
  config-file.ts    # ~/.dsh-map-tools/config.json 读写（0600）
  config-route.ts   # 回环路由 /dsh-map-tools/config（同源校验）
  settings-ns.ts    # 设置页 namespace 注册
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
client/client.js    # 设置页配置卡片（手写 lazy-CJS bundle，零构建零依赖）
tests/              # vitest 单元测试（mock fetch，不碰真实网络）
scripts/            # smoke / integration / amap-e2e / config-e2e / publish
```

## 硬性约定

### 数据源

- **高德是唯一主数据源**：所有面向用户的完整能力（公交、POI、中文地理编码）依赖高德 key。
- **免费源（OSRM/Photon/Nominatim）只是兜底**：驾车/步行/骑行路线可用；**中文地理编码不可靠**（Photon 对 CJK 返回 400、Nominatim 国内不可达）——这是设计行为，**不要试图"修复"为可用**，而是保证给出清晰的中文引导提示。
- **不要重新引入百度**：百度 JS-API 的 ak 无法用于服务端调用（已移除，见 CHANGELOG 0.3.0）。

### 配置

- 配置只存 **`~/.dsh-map-tools/config.json`**（0600），不存 DSH 设置文档。
- key **绝不**回显到前端或日志；路由只返回 `hasAmapKey` 布尔。
- 配置优先级：配置文件 → `cordis.yml` 默认值。修改 buildClients 时保持这个优先级。
- 配置文件路径可通过 `DSH_MAP_TOOLS_CONFIG` 环境变量覆盖（测试用）。

### 工具

- 每个工具必须用 `defineTool`，声明 `output.schema`（规范 JSON）+ `output.render`（模型可见文本）。
- 错误消息必须**面向用户可操作**：中文地址解析失败时给出"提供 lng,lat 坐标"或"配置高德 key（含链接）"的引导。
- 坐标统一 `LngLat = [lng, lat]`；入参支持地址文本或 `"lng,lat"`。

### client 卡片

- `client/client.js` 是**手写 lazy-CJS bundle**（`window.__ModuleLoader__.load`），零构建、零依赖（只 require react + ui-primitives）。
- 修改后必须 `node --check client/client.js` 验证语法。
- 卡片数据走 `/dsh-map-tools/config` 回环路由，**不直接写 DSH 设置**。

## 开发流程

```sh
pnpm install
pnpm run build     # tsc → lib/（必须通过）
pnpm test          # vitest 单元测试（必须全绿）
node scripts/smoke.mjs   # 7 工具注册检查
```

- 单元测试用 `vi.stubGlobal('fetch', ...)` mock 网络，**不要**在 tests/ 里发真实请求。
- 真实请求验证用 `scripts/integration.mjs`（免费源）和 `scripts/amap-e2e.mjs`（需 `AMAP_API_KEY`）。
- 新增/修改 client.js 后：`node --check` 语法 + `node scripts/config-e2e.mjs` 配置回环。

## 测试政策

- 任何面向模型的工具变更必须补充/更新对应单元测试。
- 修改配置文件读写必须更新 `tests/config-file.test.ts`。
- 提交前确认：`build` 绿、`test` 全绿、`smoke` 绿。

## 发布流程

1. 更新 `CHANGELOG.md`（版本号 + 变更分类 Added/Fixed/Changed/Removed）。
2. 按 SemVer 提升 `package.json` 版本。
3. `pnpm run build && pnpm test` 全绿。
4. `node scripts/publish.mjs`（需 npm 已登录；建议 bypass-2FA 发布 token）。
5. 推送 git + 打 tag（可选但推荐）。

## 提交信息规范

遵循 Conventional Commits：`feat:` / `fix:` / `refactor:` / `docs:` / `test:` / `ci:` / `chore:`，正文说明动机与影响面。

## 不要做的事

- 不引入新的运行时依赖（保持零依赖 / 仅 @deepseek-ai 官方 peer）。
- 不把 key 写入代码、README 示例或任何可提交文件。
- 不改动 `cordis.patch.yml` 的插件 id（`map-tools`）——影响已安装用户。
- 不引入百度/其他需要额外白名单配置的数据源。
