# dsh-map-tools

[English](#english) | [中文](README.md)

Map & routing tools plugin for [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness): driving/transit/walking/bicycling route planning, geocoding, reverse geocoding and POI search as native tools.

- **Zero-config out of the box**: uses free OSM/OSRM/Nominatim data sources by default — no API key required.
- **Upgrade path**: set an Amap (高德) Web Service key and the plugin automatically switches to Amap (best China coverage; enables transit and POI search). The settings card includes an "How to get an Amap key?" guide link.
- **China-friendly**: clear Chinese fallback guidance when free providers are unreachable (e.g. Nominatim blocked on CN networks).

## Install

```sh
dsh plugin --profile web add dsh-map-tools
```

Or search `dsh-map-tools` in the plugin market (dshmarket) and click install. Restart `dsh web` after install (or wait for HMR hot-reload).

## Tools

| Tool | What it does | Default source | Amap source |
|---|---|---|---|
| `map_driving_route` | Driving route planning | OSRM | ✅ |
| `map_transit_route` | Transit planning | — (needs Amap key) | ✅ |
| `map_walking_route` | Walking route planning | OSRM | ✅ |
| `map_bicycling_route` | Bicycling route planning | OSRM | ✅ |
| `map_geocode` | Address → coordinates | Nominatim | ✅ |
| `map_reverse_geocode` | Coordinates → address | Nominatim | ✅ |
| `map_poi_search` | POI search | — (needs Amap key) | ✅ |

Origin/destination accept either **address text** or **"lng,lat" coordinates** — the plugin normalizes automatically.

## Configuration (optional)

Configure via the plugin settings page (Settings → Plugins → dsh-map-tools) or `cordis.yml`:

| Field | Default | Description |
|---|---|---|
| `provider` | `auto` | `auto`=Amap when key present, else OSM; `amap`=force Amap; `osm`=force OSM/OSRM |
| `amapKey` | empty | Amap Web Service key (secret-role). [How to get one?](https://console.amap.com/dev/key/app) |
| `timeoutMs` | `15000` | Per-request timeout (ms) |
| `defaultMode` | `driving` | Default route mode |
| `language` | `zh` | Response language |

`cordis.yml` example:

```yaml
- id: map-tools
  name: dsh-map-tools
  config:
    provider: auto
    amapKey: your-amap-web-service-key   # optional; omit for OSM/OSRM free source
```

> **Get an Amap key**: open https://console.amap.com/dev/key/app → create an app → request a "Web Service" key (free for individual developers, daily quota).

## Examples

```
Plan a driving route from Beijing South Station to Capital Airport T3
Geocode "西湖区文三路478号" to coordinates
Any gas stations within 1km of 116.397428,39.90923?
```

## Data sources

- **OSRM** (router.project-osrm.org): free public routing for driving/walking/cycling; rate-limited public server, default fallback.
- **Nominatim** (nominatim.openstreetmap.org): free public geocoding, 1 QPS limit; **may be unreachable on some CN networks** — the geocoding tools return Chinese guidance in that case.
- **Amap (高德)**: best China data (routing/geocoding/POI/transit); requires a free key, highest quality once configured.

## Development

```sh
pnpm install
pnpm run build                # tsc → lib/
pnpm test                     # vitest unit tests (mocked network)
node scripts/smoke.mjs        # smoke: 7 tools register
node scripts/integration.mjs  # integration: real network requests
node scripts/amap-e2e.mjs     # Amap e2e (set AMAP_API_KEY)
```

## Publishing

```sh
npm config set registry https://registry.npmjs.org/
npm login
node scripts/publish.mjs      # one-shot publish (build + pack check + publish + verify)
```

## License

MIT
