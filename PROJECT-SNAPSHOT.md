# 项目现状快照（给新会话的 30 秒简报）

> **如果你是刚接手这个仓库的 AI Agent**：先读这份 + `AGENTS.md` + `README.md`，即可完整继承开发上下文。详细设计见 `PLAN.md`，发布状态见 `RELEASE-STATUS.md`。

## 这是什么

`dsh-map-tools` —— DeepSeek Harness 的地图/路径规划插件。7 个原生工具（驾车/公交/步行/骑行路线 + 地理编码 + 逆地理编码 + POI 搜索），模型直接调用，无需 MCP。

## 当前状态（2026-08-19 快照）

| 项 | 状态 |
|---|---|
| 最新版本 | **0.3.1**（npm latest，已发布） |
| GitHub 仓库 | https://github.com/HorusJiang/dsh-map-tools（master，24 commit，CI 绿） |
| 收录 PR | [awesome-dsh-plugin#1842](https://github.com/awesome-dsh-plugin/awesome-dsh-plugin/pull/1842) 已提交，**等仓库满 1 天**（首次 commit 2026-08-19 10:48，约 2026-08-20 10:48 后 regate 自动通过） |
| 测试 | 32 个 vitest 单元测试全绿 + smoke/integration/config-e2e |
| 高德 key | 已配置在 `~/.dsh-map-tools/config.json`（用户目录，**不在仓库**），实测可用 |

## 关键决策（继承时不要推翻）

1. **高德是唯一主数据源**：公交/POI/中文地理编码都依赖高德 key。免费源（OSRM/Photon/Nominatim）只兜底驾车/步行/骑行路线。
2. **中文地理编码免费源不可靠**（Photon 对 CJK 返回 400、Nominatim 国内不可达）——**这是设计**，不要试图修复，保证给出中文引导即可。
3. **百度已移除**（0.3.0）：百度 JS-API 的 ak 无法用于服务端调用，**不要重新引入**。
4. **配置只存 `~/.dsh-map-tools/config.json`**（0600），不存 DSH 设置文档；key 绝不回显；配置优先级 = 配置文件 > cordis.yml。
5. **配置卡片是 client 端**（`client/client.js`，手写 lazy-CJS 零依赖），通过 `/dsh-map-tools/config` 回环路由读写——用户需**重启 DSH web** 才能加载新 client 卡片。

## 安全红线（重中之重）

- 本地高德 key 在 `~/.dsh-map-tools/config.json`（用户目录）。
- 三道防线防泄露：存储隔离 + `.gitignore`（`config.json`/`.dsh-map-tools/`/`.env` 忽略）+ **pre-commit 钩子**（`scripts/check-secrets.mjs`，含 key 的提交被拒绝）。
- **任何情况下不要**把 key 写入代码、文档、示例或提交。

## 待办 / 下一步

- [ ] 用户重启 DSH web 后验证配置卡片（设置 → 插件 → dsh-map-tools）
- [ ] 收录 PR #1842 满 1 天后确认 gate 转绿 → 维护者合并 → dshmarket 自动收录
- [ ] （可选）后续版本迭代：按 SemVer 提版本 + CHANGELOG

## 常用命令

```sh
pnpm run build                # tsc → lib/
pnpm test                     # 32 个单元测试
node scripts/smoke.mjs        # 7 工具注册检查
node scripts/integration.mjs  # 免费源真实请求
node scripts/amap-e2e.mjs     # 高德 e2e（需 AMAP_API_KEY）
node scripts/config-e2e.mjs   # 配置读写回环
node scripts/publish.mjs      # 一键发布 npm
pnpm check:secrets            # 手动跑密钥扫描
```

## 关键链接

- 插件仓库: https://github.com/HorusJiang/dsh-map-tools
- npm: https://www.npmjs.com/package/dsh-map-tools
- 收录 PR: https://github.com/awesome-dsh-plugin/awesome-dsh-plugin/pull/1842
- 高德 key 申请: https://console.amap.com/dev/key/app
