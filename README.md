# dsh-map-tools

[English](#english) | [中文](#中文)

地图与路径规划工具插件，为 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) 提供驾车/公交/步行/骑行路线规划、地理编码、逆地理编码和 POI 搜索等原生工具。

- **零配置开箱即用**：默认使用免费的 OSM/OSRM/Nominatim 数据源，无需任何 API key。
- **可升级**：配置高德（Amap）Web 服务 key 后自动升级为高德数据源（国内数据最全、支持公交换乘与 POI 搜索），配置页内置"如何获取高德 Key？"引导链接。
- **国内友好**：面向国内用户设计，Nominatim 不可达等场景下有清晰的中文降级提示。

## 安装

```sh
dsh plugin --profile web add dsh-map-tools
```

或通过插件市场（dshmarket）搜索 `dsh-map-tools` 一键安装。安装后重启 `dsh web`（或等待 HMR 热加载）。

## 工具

| 工具 | 功能 | 默认数据源 | 高德数据源 |
|---|---|---|---|
| `map_driving_route` | 驾车路线规划 | OSRM | ✅ |
| `map_transit_route` | 公交/地铁换乘 | —（需高德 key） | ✅ |
| `map_walking_route` | 步行路线规划 | OSRM | ✅ |
| `map_bicycling_route` | 骑行路线规划 | OSRM | ✅ |
| `map_geocode` | 地址 → 经纬度 | Nominatim | ✅ |
| `map_reverse_geocode` | 经纬度 → 地址 | Nominatim | ✅ |
| `map_poi_search` | 兴趣点搜索 | —（需高德 key） | ✅ |

起点/终点统一接受 **地址文本** 或 **"lng,lat" 坐标** 两种形式，插件自动归一化。

## 配置（可选）

配置通过插件设置页（设置 → 插件 → dsh-map-tools）或 `cordis.yml` 完成：

| 字段 | 默认 | 说明 |
|---|---|---|
| `provider` | `auto` | `auto`=有 key 用高德否则用 OSM；`amap`=强制高德；`osm`=强制 OSM/OSRM 免费源 |
| `amapKey` | 空 | 高德 Web 服务 key（secret 脱敏）。[如何获取？](https://console.amap.com/dev/key/app) |
| `timeoutMs` | `15000` | 单次请求超时（毫秒） |
| `defaultMode` | `driving` | 默认路线模式 |
| `language` | `zh` | 返回语言 |

`cordis.yml` 示例：

```yaml
- id: map-tools
  name: dsh-map-tools
  config:
    provider: auto
    amapKey: your-amap-web-service-key   # 可选；不配则用 OSM/OSRM 免费源
```

> **获取高德 Key**：打开 https://console.amap.com/dev/key/app → 创建应用 → 申请"Web 服务"类型 key（个人开发者免费，有每日配额）。

## 示例

```
从北京南站到首都机场T3，规划驾车路线
把"西湖区文三路478号"转成经纬度
116.397428,39.90923 附近 1 公里内有什么加油站？
```

## 数据源说明

- **OSRM**（router.project-osrm.org）：免费公开路线服务，驾车/步行/骑行；公共服务器有频率限制，仅作默认兜底。
- **Nominatim**（nominatim.openstreetmap.org）：免费公开地理编码，限 1 QPS；**部分国内网络环境下不可达**，此时地理编码工具会返回中文引导提示。
- **高德（Amap）**：国内数据最全（路径规划/地理编码/POI/公交换乘），需要免费 key，配置后质量最优。

## 开发

```sh
pnpm install
pnpm run build          # tsc 构建到 lib/
node scripts/smoke.mjs  # 冒烟测试：验证 7 工具注册
node scripts/integration.mjs  # 集成测试：真实网络请求
```

## 许可

MIT
