# Changelog

All notable changes to this project are documented in this file.

## [0.5.0] - 2026-09-05

### Changed

- **settings 接线迁移到 DSH 0.1.2-rc.1 / 0.1.3-alpha.1 新 API**：`@deepseek-ai/dsh-settings`
  删除了 `installSettingsSection` 与 `settingsNamespace` 工厂（namespace 改为普通小写连字符
  字符串，注册/接线改为 `SettingsProvider` 实例方法）。`src/settings-ns.ts` 现经
  `ctx.inject(['settings'])` 取得 provider 并调用
  `settings.installSection(ctx, 'dsh-map-tools', ConfigSchema, entry, { setSource, onChange })`
  ——语义与旧接口等价（组合入口值作 base 层；attach/commit/detach 时回调 reload）；未组合
  settings 服务的部署保持惰性、不运行。设置页卡片无改动：客户端 `settings.plugin.item`
  （key = `dsh-map-tools`）注入与 0.1.3 的 slot 架构一致，工具定义、自有配置路由均不变。
  （分析报告见 `docs/dsh-map-tools-v0.1.3兼容性说明.md`。）
- **peerDependencies 提升**：`@deepseek-ai/dsh-settings`、`@deepseek-ai/dsh-tools`
  由 `^0.1.0-rc.5` 提升到 `>=0.1.2-rc.1`（npm 当前发布线 0.1.2-rc.1 已是新 API；
  源码构建的 0.1.3-alpha.1 同样兼容）；`@deepseek-ai/cordis` → `^4.0.2`，
  `@deepseek-ai/schemastery` → `^3.18.2`。
- **dsh 元数据**：新增 `dsh.compatibility.dshReleases`（`0.1.2-rc.1`、`0.1.3-alpha.1`
  标记为 `compatible`），对齐 dsh-context 等已适配插件的写法。

### Fixed

- **设置卡片保存后工具未真正重建**：`POST /dsh-map-tools/config` 此前只写入
  `~/.dsh-map-tools/config.json`，从不触发工具重注册——卡片提示的"已保存 — 工具已重建"
  在 0.4.x 里实际要到插件重启才生效。现在路由保存成功后立即 reload
  （`installConfigRoute(ctx, reload)`）；settings section 变更的 `onChange` 路径保持原有行为。

## [0.4.4] - 2026-08-24

### Changed

- **设置卡片标题与描述**：卡片标题由裸的 `dsh-map-tools` 改为 **`地图引擎
  (dsh-map-tools)`**，并新增一行描述副标题（驾车/公交/步行/骑行路线、地理编码、
  POI 搜索），与 ModLens（"视觉引擎"）等的两行式卡片头部一致，观感更统一。
- **摘要改为挂载时加载**：原先卡片收起时右侧一直显示"加载中…"，只有点开才拉取
  配置摘要（数据源/是否已配置 key）。现改为卡片一挂载就加载，收起时右侧立即
  显示"高德 ✓ / OSM ✓ / 未配置"，去掉"加载中…"。

## [0.4.3] - 2026-08-24

### Fixed

- **设置卡片配色与 DSH 其它插件不一致**：`client/client.js` 的设置卡片原先外层用
  `<li>`，背景取 `var(--dsw-alias-bg-layer, #1e1e1e)`（实心深色），边框取
  `--dsw-alias-border`，因此在 设置 → 插件 里渲染成一条扁平的深色实心条，和
  ModLens 等用半透明主题叠加色（`--dsw-alias-bg-layer-2/-3`）+ `--dsw-alias-border-l2`
  的圆角卡片不一致。现将卡片外层改为 `div`，背景/边框对齐标准设置的半透明
  叠加色并添加过渡，使其与 DSH 主题配色一致。

## [0.4.2] - 2026-08-24

### Fixed

- **仍被 pnpm 构建脚本拦截**：0.4.1 移除了 `postinstall`，但发布包仍带
  `prepare: npm run build`。pnpm 会把 `prepare` 也当作构建脚本默认拦截
  （`preinstall`/`install`/`postinstall`/`prepare`），且对 registry 装的包一旦
  放行就会执行 `npm run build`（`tsc`），而发布包并未携带
  `src`/`tsconfig.json`/`typescript`，因此安装仍失败。
- 现将 `prepare` 也从 `scripts` 移除，发布包只保留 `build`/`test`/`hooks`/
  `check:secrets` 等对消费者无副作用的脚本；`prepack`（仅 `npm pack`/`publish`
  时运行、不参与依赖安装、不被 pnpm 拦截）保留用于 publish 前构建 `lib/`。
  这样消费者安装 dsh-map-tools 时，pnpm 不再有任何构建脚本需要拦截或执行。

## [0.4.1] - 2026-08-24

### Fixed

- **发布包无法被消费者安装**：`scripts.postinstall` 原先运行
  `node scripts/install-hooks.mjs`（给开发者装 git pre-commit 钩子），但
  `scripts/` 目录并不在 `package.json` 的 `files` 清单里（仅
  `lib` / `client` / `cordis.patch.yml` / `LICENSE`），导致发布到 npm 的包
  **缺失该脚本文件**，消费者安装时 `postinstall` 直接失败
  （`Cannot find module scripts/install-hooks.mjs`）；`postinstall` 的存在
  同时也触发了 **pnpm ≥10 默认拦截依赖构建脚本** 的提示（需额外点一次
  "Allow build scripts"）。
- 现将 `postinstall` 从 `scripts` 移除——这类只服务开发者本仓库的钩子安装
  不应在消费者安装时运行，一并消除了"构建脚本拦截"和"缺失文件"的双重失败。
  开发者如需重新安装 pre-commit secret guard，手动执行 `pnpm hooks`
  （= `node scripts/install-hooks.mjs`）。

## [0.4.0] - 2026-08-21

### Added

- **高德配额保护层（`src/clients/amap.ts`）**：个人开发者 key 的 QPS 上限极低
  （常见 3 QPS/秒，超限报 10021 `CUQPS_HAS_EXCEEDED_THE_LIMIT`），而一次工具
  调用内部可能连发 1~5 个高德请求、多个工具并行时瞬时击穿配额。新增三层防护：
  1. **限速排队**：RateLimiter 把任意两次请求的最小间隔钳制在 `1000/maxQps`，
     并发请求排队等待而非同时发出；
  2. **TTL 结果缓存**：geocode / route / POI 按参数做内存缓存，同一会话中相同
     请求直接命中缓存（transit 的 `resolveCity` 会命中 `resolve` 刚写下的
     geocode 缓存，省掉重复请求）；
  3. **配额错误分类 + 重试**：10020/10021（QPS 超限）标记为可重试并在客户端内
     线性退避重试；10022/10023（日配额超限）重试无意义，直接给出友好中文提示
     （新增 `AmapQuotaError`，`retryable` 字段区分两类）。
- **路线工具自动降级（`src/tools/routes.ts`）**：高德配额超限时，驾车/步行/骑行
  自动降级 OSRM 免费源（结果标注 `provider: osrm`）；公交无免费兜底源，改为
  可操作的错误提示（建议稍后重试或改用其他模式）。地址解析阶段遇到配额超限
  同样转为"稍后重试或提供 lng,lat 坐标"的引导。
- **`maxQps` 配置项**：`config.ts` / `config-file.ts` 新增，默认 2（低于高德
  常见 3 QPS 上限、留余量防 10021）；`configSummary()` 暴露给设置页卡片。

### Fixed

- 高德配额超限时不再裸抛 `Amap API error 10021: CUQPS_HAS_EXCEEDED_THE_LIMIT`，
  而是自动排队/重试/降级后返回结果，或给出中文可操作提示。

## [0.3.3] - 2026-08-20

### Security

- `applyConfig` 保存时清理已废弃配置字段（`baiduAk`，百度 provider 于
  0.3.0 移除后残留），避免死字段携带假 key 长驻 `~/.dsh-map-tools/config.json`。
- AGENTS.md 新增硬性约定：调试/验证脚本一律从 `process.env.AMAP_API_KEY`
  读取 key，禁止硬编码（对齐 `scripts/amap-e2e.mjs` 范本）。

## [0.3.2] - 2026-08-20

### Fixed

- **公交换乘（`map_transit_route`）对所有城市报 `Amap API error 20000:
  INVALID_PARAMS`**。两个叠加根因：
  1. 高德对直辖市（北京/上海/天津/重庆）的 `addressComponent.city` 返回空
     数组 `[]`（城市名实际在 `province` 里），导致城市解析拿到 `[]`、
     city1/city2 参数为空。新增 `normalizeCity()`：数组取首元素、空值回退
     `province`，`geocode()`/`reverseGeocode()` 统一规范化（类型放宽为
     `string | string[]`）。
  2. 高德 v5 公交接口只接受 adcode/citycode，不接受城市名（实测
     `北京`/`北京市` → INVALID_PARAMS，`110000`/`110101`/`010` → OK）。
     `resolveCity()` 改为优先返回 geocode/reverseGeocode 结果的 `adcode`
     （区级 adcode 如 `110101` 亦被接受），缺失时才回退去「市」字的城市名。
- **`map_reverse_geocode` 在直辖市报 schema 校验失败
  `"value.city" must be a string`**：同上，`city` 经 `normalizeCity()` 后
  保证为 `string`。
- `routeTool` 渲染：高德 v5 公交响应不返回 duration 字段，`durationS` 为 0
  时不再渲染「约 0 分钟」，只显示距离。

### Security

- Pre-commit secret guard: `scripts/check-secrets.mjs` scans staged files for
  key-shaped values and refuses the commit on a hit; installed via
  `scripts/install-hooks.mjs` (`postinstall`, contributors only). Defense in
  depth behind `.gitignore` hardening.
- `.gitignore` hardened: `config.json`, `.dsh-map-tools/`, `.env` and key
  files are now ignored.

## [0.3.1] - 2026-08-19

### Docs

- Professional open-source documentation pass:
  - Rewrote README.md / README.en.md: badges, install-option comparison, quick
    start, architecture diagram, FAQ.
  - Added SECURITY.md (key storage policy + vulnerability reporting).
  - Added AGENTS.md (agent collaboration conventions).
  - Added GitHub issue templates (bug / feature) and PR template.
  - Expanded CONTRIBUTING.md with data-source, config and testing conventions.
- package.json: added `author` and `bugs` fields.

## [0.3.0] - 2026-08-19

### Removed

- **Baidu Maps provider removed**: the Baidu JS-API ak cannot be used for
  server-side calls (requires a separate 服务端 application with IP whitelist),
  so the module was removed per request. `provider` is now `amap | osm`.
- Removed `baiduAk` config, BaiduClient, and all baidu dispatch branches.

### Fixed

- Settings card (client half) now shows only the Amap key field with the apply
  link; no dead Baidu controls.

## [0.2.0] - 2026-08-19

### Added

- **Baidu Maps (百度地图) provider**: `provider: 'baidu'` with `baiduAk` — route
  planning (driving/transit/walking/riding), geocoding, reverse geocoding and
  POI search through the Baidu Web Service API.
- **Host-side settings card** (modlens pattern, no client bundle): the plugin's
  card renders on 设置 → 插件 with a loopback route that reads/writes
  `~/.dsh-map-tools/config.json` — provider, `amapKey`, `baiduAk`, `timeoutMs`.
  Config-file values win over composition defaults; tools rebuild on a save.
- Dual-provider config: `provider: 'amap' | 'baidu' | 'osm'`, keys are
  secret-role with apply links (Amap / Baidu consoles).
- Free-source geocoding now gives actionable CN-friendly guidance (Photon /
  Nominatim are unreliable for Chinese addresses).
- 6 config-file unit tests + config round-trip e2e script (39 unit tests total).

### Fixed

- Geocode tools now try Photon → Nominatim with a unified guidance error
  instead of surfacing raw provider failures.

## [0.1.0] - 2026-08-18

### Added

- 7 native tools for DeepSeek Harness:
  - `map_driving_route` — driving route planning (OSRM default, Amap with key)
  - `map_transit_route` — transit planning (requires Amap key)
  - `map_walking_route` — walking route planning (OSRM default, Amap with key)
  - `map_bicycling_route` — bicycling route planning (OSRM default, Amap with key)
  - `map_geocode` — address → coordinates (Nominatim default, Amap with key)
  - `map_reverse_geocode` — coordinates → address (Nominatim default, Amap with key)
  - `map_poi_search` — POI search (requires Amap key)
- Zero-key default: OSRM + Nominatim free data sources, no API key required.
- Optional Amap (高德) upgrade: `provider: auto|amap|osm`, secret-role `amapKey`
  with an apply-link in the settings card (Tencent-connector style).
- Settings integration via `@deepseek-ai/dsh-settings` (hot-reload on change).
- Friendly Chinese fallback guidance when free providers are unreachable
  (e.g. Nominatim blocked on CN networks) or when a key is invalid.
- Unit tests (vitest, mocked network), smoke test, and integration test.

### Fixed

- Amap base URL missing trailing slash (would 404 on real requests).
- Invalid Amap key now shows actionable guidance instead of a bare error.
