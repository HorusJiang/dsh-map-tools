# dsh-map-tools 插件开发方案（v1）

> 状态：**方案待确认**。本文档只描述设计与计划，不含实现代码。
> 目标：为 DeepSeek Harness 开发一个地图/路径规划工具插件，发布到 npm 并提交收录到 [awesome-dsh-plugin](https://github.com/awesome-dsh-plugin/awesome-dsh-plugin)。

---

## 1. 定位

- **是什么**：一个 DSH 社区插件（bundle），向模型注册一组"地图/路径规划"原生工具。
- **与 MCP 方案的关系**：不依赖外部 MCP 服务器，插件内部直接调用地图 API。用户装一个包即可获得全部地图能力，无需单独维护 MCP server 进程。MCP 方案仍可作为轻量备选。
- **目标用户**：需要路径规划、地址解析、POI 搜索的 DSH 用户（个人出行规划、物流调度、地理分析等）。

## 2. 功能设计（工具集）

统一命名空间 `map_*`，全部注册为 DSH 原生工具（模型可直接 `map_xxx()` 调用）：

| # | 工具名 | 功能 | 数据源 | 备注 |
|---|---|---|---|---|
| 1 | `map_driving_route` | 驾车路径规划 | 高德 / OSRM | 返回距离、耗时、路线坐标串、分段指引 |
| 2 | `map_transit_route` | 公交/地铁换乘规划 | 高德 | 高德特有，多方案对比 |
| 3 | `map_walking_route` | 步行路径规划 | 高德 / OSRM | |
| 4 | `map_bicycling_route` | 骑行路径规划 | 高德 / OSRM | |
| 5 | `map_geocode` | 地址 → 经纬度 | 高德 / Nominatim | 支持模糊地址 |
| 6 | `map_reverse_geocode` | 经纬度 → 结构化地址 | 高德 / Nominatim | 含行政区、街道 |
| 7 | `map_poi_search` | 兴趣点搜索（附近餐厅/加油站等） | 高德 | 支持关键词 + 范围 + 类型 |

**统一入参风格**（便于模型记忆）：

```text
起点/终点：接受 "地址文本" 或 "lng,lat" 两种形式（内部自动 geocode 归一）
mode：driving | transit | walking | bicycling
可选：alternatives(多方案)、avoidRoads、language(zh/en)
```

**统一返回结构**：`{ distanceKm, durationMin, polyline, steps[], providers }`，`providers` 注明实际数据源（amap/osrm），便于用户判断数据可信度。

## 3. 技术架构

```
dsh-map-tools/
├── package.json          # dsh.bundle manifest + npm 发布配置
├── cordis.patch.yml      # bundle 配置层：插入 map-tools 插件行
├── tsconfig.json
├── src/
│   ├── index.ts          # 插件入口：export name/apply/Config
│   ├── config.ts         # Schemastery 配置 schema
│   ├── clients/
│   │   ├── amap.ts       # 高德 Web 服务 API 客户端（路径规划/地理编码/POI）
│   │   ├── osrm.ts       # OSRM 免费路线客户端（兜底/无 key 模式）
│   │   └── nominatim.ts  # OSM Nominatim 地理编码客户端（兜底）
│   ├── tools/
│   │   ├── routes.ts     # 4 个路径规划工具（defineTool）
│   │   ├── geocode.ts    # 地理编码/逆地理编码
│   │   └── poi.ts        # POI 搜索
│   └── types.ts          # 共享类型与地址归一化逻辑
└── scripts/
    └── build.mjs         # 轻量构建（esbuild/tsc 二选一，产出 lib/）
```

**关键技术点**：

- 插件形态：函数式插件，`inject: ['tools']`，`ctx.tools.register(defineTool({...}))`。
- 配置：`Schema.object({ provider: ..., amapKey: Schema.string().role('secret').optional(), ... })`，**默认 `provider: 'auto'`**——无 key 时 OSM/OSRM/Nominatim 免费源开箱即用，配置高德 key 后自动升级为高德优先。
- **配置 UI（仿腾讯地图连接器）**：插件配置页显示"高德 Key 配置"卡片——标题 + 用途说明（地点搜索/路线规划/地址解析）+ **"如何获取高德 Key？"跳转链接（指向高德开放平台申请页）** + Key 输入框（`role('secret')` 脱敏显示）+ 保存。保存后 HMR 热更新，无需重启。
- 地址归一化：入参含 `lng,lat` 时跳过 geocode；否则先调 geocode。
- 请求用 `fetch` + `exec.signal`（遵守工具取消约定），超时可配。
- 遵循 DSH 工具规范：`output.schema` 声明规范 JSON 返回值，`output.render` 输出模型可见文本，可选 `presentResult` UI 卡片（generic card）。

## 4. 数据源与成本

| 数据源 | 用途 | Key 要求 | 额度 |
|---|---|---|---|
| 高德 Web 服务 API | 全部 7 个工具（升级路径） | 免费 key（个人开发者） | 每日有免费配额（路径规划/地理编码/POI 分别计） |
| OSRM public server | 驾车/步行/骑行路线（默认） | 无 | 免费公开服务，有频率限制 |
| Nominatim | 地理编码/逆地理编码（默认） | 无 | 免费公开服务，限 1 QPS（需遵守使用政策） |

**策略（面向国内用户的设计定案）**：**默认 OSM/OSRM 零 key 开箱即用**，配置页提供"如何获取高德 Key？"跳转链接引导升级；用户填入 `amapKey` 后自动切换为高德优先（`provider: 'auto'` 默认行为），路线/地理编码/POI 质量全部提升。说明：国内用户不配 key 也能用（OSM 兜底），配 key 后体验最优（高德国内数据最全、支持公交换乘与 POI）。

> **实测发现（2026-08 本机验证）**：OSRM 公共服务器（router.project-osrm.org）在本地网络可达且稳定（天安门→王府井驾车 1270.7m/146.6s、步行同距离）；但 Nominatim（nominatim.openstreetmap.org）直连失败——**部分国内网络环境下 Nominatim 不可达**。影响：零 key 模式下**路线规划可用、地理编码可能不可达**，工具会返回清晰错误提示配置高德 key。这强化了"高德 key 引导"对国内用户的重要性，也提示 OSM 兜底在海外用户/国内网络环境下的差异化表现。

## 5. 配置设计

```ts
export interface Config {
  provider: 'auto' | 'amap' | 'osm'   // 默认 auto：有 key 用高德，无 key 用 OSM
  amapKey?: string        // 高德 Web 服务 key（secret 脱敏），不填走免费 OSM 源
  timeoutMs: number       // 默认 15000
  defaultMode: 'driving' | 'transit' | 'walking' | 'bicycling'  // 默认 driving
  language: 'zh' | 'en'   // 默认 zh
}
```

**配置 UI（设置页卡片，仿腾讯地图连接器）**：

```
┌─ 高德 Key 配置 ─────────────────────────────┐
│ 连接你的高德开发者 Key，用于地点搜索、路线规划、  │
│ 地址解析等。Key 仅存储在本地配置中。不配置时     │
│ 自动使用 OSM/OSRM 免费数据源。                │
│                                              │
│ 如何获取高德 Key?  [跳转高德开放平台申请页]     │
│                                              │
│ Key *  [____________________________]        │
│                                              │
│            [取消]  [保存并连接]               │
└──────────────────────────────────────────────┘
```

- 通过 `@deepseek-ai/dsh-settings` 的 `SettingsNamespace` + Schemastery schema 实现（字段 `role('secret')` 脱敏、`description` 承载跳转链接说明）。
- 保存后写入配置，HMR 热更新立即生效；Key 不落盘日志、不做 wire 暴露（遵循 dsh-settings 的脱敏约定）。

## 6. 验证方式（本机）

1. 本地 build 后 `dsh plugin --profile web add ./dsh-map-tools`（或先 `dsh plugin add` 装官方 mcp-client 对比验证）。
2. 在 Web UI 发指令：`从北京南站到首都机场T3，给我三条驾车路线`、`把"西湖区文三路478号"转成经纬度`。
3. 检查工具调用卡片、返回结构、无 key 降级路径。

## 7. 发布与生态接入

**生态现状（已实测调研）**：dshmarket 插件市场 registry 快照（`awesome-dsh-plugin.com/plugins.json`）当前收录 **839 个插件、12 个分类**（`ui`/`theme`/`model`/`session`/`memory`/`tools`/`skill`/`workflow`/`notify`/`dev`/`market`/`fun`）。**目前没有任何真正的地图/路径规划类插件**——`dsh-map-tools` 将是该领域的第一个，归入 `tools` 分类（现有 182 个）。

**收录条目的确切格式**（来自 registry 快照，提交到 awesome-dsh-plugin 时对齐这个形状）：

```json
{
  "name": "dsh-map-tools",
  "owner": "<你的GitHub用户名>",
  "url": "https://github.com/<你的GitHub用户名>/dsh-map-tools",
  "page": "https://awesome-dsh-plugin.com/p/<你的GitHub用户名>/dsh-map-tools/",
  "category": "tools",
  "description": {
    "en": "Map & routing tools: driving/transit/walking/bicycling route planning, geocoding and POI search via Amap (高德) and OSM/OSRM.",
    "zh": "地图与路径规划工具：驾车/公交/步行/骑行路线、地理编码与 POI 搜索，数据源为高德与 OSM/OSRM。"
  },
  "npm": "dsh-map-tools",
  "stars": 0,
  "install": "dsh plugin --profile web add dsh-map-tools",
  "added": "<收录日期>"
}
```

**发布步骤**：

| 步骤 | 动作 | 说明 |
|---|---|---|
| 1 | GitHub 建仓 `dsh-map-tools`，代码开源 | awesome-dsh-plugin 要求 repository 指向真实源码；`npm` 字段有值则市场显示 `dsh plugin add <npm包名>` 安装，否则走 `github:<owner>/<repo>` |
| 2 | `pnpm publish`（或 npm publish） | 预构建 `lib/`，用户免构建安装（[官方打包规范](../../docs/user/develop/basic/publish.zh.md)） |
| 3 | 提 PR 到 [awesome-dsh-plugin](https://github.com/awesome-dsh-plugin/awesome-dsh-plugin) | 在 `tools` 分类按上述格式加一条；收录后 CI 每日刷新 `plugins.json` |
| 4 | dshmarket 自动收录 | **无需单独提交**——dshmarket 实时读 `awesome-dsh-plugin.com/plugins.json`，收录后通常一天内生效 |
| 5 | 写 README（中英双语） | 含安装、配置、工具说明、示例 |

> 注意：dshmarket 只允许安装 awesome-dsh-plugin 精选列表内的来源，所以第 3 步（收录）是第 4 步（市场上架）的前提。

## 8. 开发里程碑

- **M1 骨架与构建**：package.json / cordis.patch.yml / tsconfig / build 脚本，本机 `--patch` 加载空插件验证链路。*（骨架已建）*
- **M2 客户端层**：amap/osrm/nominatim 三个 client + fetch/signal/超时。
- **M3 路径规划 4 工具**：defineTool 注册 + 规范返回 + render。
- **M4 地理编码 + POI 工具**。
- **M5 本机端到端验证**：Web UI 实测 + 无 key 降级 + 错误处理。
- **M6 发布**：GitHub 仓库、npm publish、awesome-dsh-plugin PR、dshmarket 收录。

## 9. 风险与备选

- **免费额度**：高德免费 key 有 QPS/日配额限制，个人使用足够；可配置多个 key 或提示用户升级。
- **OSRM/Nominatim 公共服务器稳定性**：仅作降级，主源建议高德；文档注明公共源的使用政策（Nominatim 1 QPS）。
- **国内/海外网络**：高德 API 国内直连快；海外用户建议配 OSRM。可在 README 说明。
- **范围蔓延**：v1 只做 7 个工具；距离矩阵、等时圈、地图可视化、自定义 UI 卡片留作 v2（见下）。

## 10. v2 候选（暂不纳入 v1）

- `map_distance_matrix`（多点距离矩阵）
- `map_route_html`（生成可交互的地图 HTML 页面供预览）
- 百度/腾讯地图客户端
- UI 专用地图卡片（`presentResult` 渲染路径图形）

---

## 11. 技术附录：API 端点清单（已核实，开发时直接照做）

### 高德 Web 服务 API（需 key，REST GET + `key` 参数）

| 能力 | 端点 | 关键参数 |
|---|---|---|
| 驾车路径规划 | `https://restapi.amap.com/v5/direction/driving` | `origin`、`destination`（`lng,lat`）、`strategy`（0 速度优先/1 费用优先…）、`waypoints`（途经点）、`show_fields` |
| 骑行路径规划 | `https://restapi.amap.com/v5/direction/bicycling` | 同上 |
| 步行路径规划 | `https://restapi.amap.com/v5/direction/walking` | 同上 |
| 公交路径规划 | `https://restapi.amap.com/v5/direction/transit/integrated` | `origin`、`destination`、`city1`/`city2`（起终点城市）、`strategy` |
| 地理编码 | `https://restapi.amap.com/v3/geocode/geo` | `address`（必填）、`city`（限定城市） |
| 逆地理编码 | `https://restapi.amap.com/v3/geocode/regeo` | `location`（`lng,lat`）、`poitype`、`extensions` |
| POI 关键词搜索 | `https://restapi.amap.com/v5/place/text` | `keywords`、`region`、`city_limit` |
| POI 周边搜索 | `https://restapi.amap.com/v5/place/around` | `location`、`keywords`、`types`、`radius`（默认 1000m）、`sortrule` |

> 参考：[高德路径规划 2.0 文档](https://lbs.amap.com/api/webservice/guide/api/newroute)、[Routes API](https://lbs.amap.com/api/web-service/guide/routes)。key 在 [高德开放平台](https://console.amap.com) 申请（Web 服务类别）。

### OSRM 免费路线（无需 key，降级源）

| 能力 | 端点 | 关键参数 |
|---|---|---|
| 路线 | `https://router.project-osrm.org/route/v1/{profile}/{lng1},{lat1};{lng2},{lat2}` | `profile` ∈ `driving` / `walking` / `cycling`；`overview=full`（返回全路径）、`geometries=geojson`、`steps=true`、`alternatives=true`（多方案） |

返回：`distance`（米）、`duration`（秒）、`geometry`（GeoJSON 线串）、`legs[].steps[]`（分段指引）。公开服务器有频率限制，仅作降级。

> 参考：[OSRM API v5.5.1](https://project-osrm.org/docs/v5.5.1/api/)、[OSRM HTTP server](https://project-osrm.org/docs/v26.4.0/http)

### Nominatim 地理编码（无需 key，降级源，限 1 QPS）

| 能力 | 端点 | 关键参数 |
|---|---|---|
| 正向地理编码 | `https://nominatim.openstreetmap.org/search?format=jsonv2&q={query}&limit=1` | 需带 `User-Agent` 请求头（服务条款要求） |
| 反向地理编码 | `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat={lat}&lon={lon}` | 同上 |

> 参考：[Nominatim API](https://nominatim.org/release-docs/latest/api/Search/)。务必遵守 1 QPS 限制并在 UA 中标识来源，否则会被封 IP。

---

## 待你确认的决策点

1. **插件名**：`dsh-map-tools` 是否 OK？（备选：`dsh-map`、`dsh-geo-tools`）
2. **范围**：v1 七工具 + OSM 降级，是否合适？
3. **主数据源**：确认以高德为主？还是想以 OSM/OSRM 为主（完全零 key）？
4. **开源仓库**：你有 GitHub 账号吗？计划用什么仓库名？（影响 awesome-dsh-plugin 收录）
5. **发布节奏**：先发 npm 跑通，还是等全部工具做完一起发？

确认后我再按里程碑开始写代码。
