# Changelog

All notable changes to this project are documented in this file.

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
