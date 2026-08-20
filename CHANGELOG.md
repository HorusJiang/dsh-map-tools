# Changelog

All notable changes to this project are documented in this file.

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
