# Contributing

感谢你对 dsh-map-tools 的兴趣！欢迎提交 Issue 与 Pull Request。

## 开发环境

- Node.js ≥ 20，pnpm ≥ 10
- DSH（DeepSeek Harness）本地安装（用于端到端验证）

```sh
pnpm install
pnpm run build                # tsc → lib/
pnpm test                     # vitest 单元测试（mock 网络）
node scripts/smoke.mjs        # 冒烟：7 工具注册
node scripts/integration.mjs  # 集成：真实请求（免费源）
node scripts/amap-e2e.mjs     # 高德 e2e：需设置 AMAP_API_KEY
node scripts/config-e2e.mjs   # 配置读写回环
```

## 提交 Issue

- **Bug**：说明复现步骤、期望行为、实际行为、DSH 版本、是否配置了高德 key。
- **功能建议**：说明使用场景与期望能力。

## 提交 PR

1. Fork 本仓库，从 `master` 开分支（如 `fix/xxx`、`feat/xxx`）。
2. 完成改动，遵循下方约定。
3. 确保 `pnpm run build` 与 `pnpm test` 全绿。
4. 更新 `CHANGELOG.md`（按 Added / Fixed / Changed / Removed 分类）。
5. 如需更新 README（工具表/配置/FAQ），中英双语同步。
6. 提交信息遵循 [Conventional Commits](https://www.conventionalcommits.org/)。

## 开发约定

### 数据源

- **高德是唯一主数据源**（免费 key，Web 服务类型）：公交、POI、中文地理编码依赖它。
- **免费源是兜底**：OSRM（驾车/步行/骑行路线）、Photon/Nominatim（地理编码）。
  - 免费源**中文地理编码不可靠**（Photon 对 CJK 返回 400、Nominatim 国内不可达）——这是设计行为，改动时不要试图绕过，保证给出清晰引导即可。
- **不引入百度**：JS-API 的 ak 无法用于服务端调用（见 CHANGELOG 0.3.0 移除记录）。

### 配置与安全

- 配置只存 `~/.dsh-map-tools/config.json`（0600），key **绝不**回显到页面或日志。
- 配置优先级：配置文件 → `cordis.yml` 默认值。
- 新增配置字段时同步更新：`config.ts`（schema）、`config-file.ts`（读写）、`config-route.ts`（路由）、`client/client.js`（卡片）、`README`。

### 工具

- 每个工具用 `defineTool`，声明 `output.schema`（规范 JSON）+ `output.render`（模型可见文本）。
- 面向用户的错误必须**可操作**：给出"提供坐标"或"配置高德 key（含申请链接）"的引导。
- 新增工具后：注册进 `src/index.ts` 的 `registerAll`，补单元测试，更新 README 工具表。

### 测试

- 单元测试 mock `fetch`（`vi.stubGlobal`），**不碰真实网络**。
- 真实请求验证走 `scripts/` 下的集成/e2e 脚本。
- 修改 client 卡片后：`node --check client/client.js` 验证语法。

### 代码风格

- TypeScript strict；相对导入用 `.js` 后缀（NodeNext）。
- 不引入新运行时依赖（保持零依赖 / 仅 @deepseek-ai 官方 peer）。

## 发布

由维护者执行：更新 CHANGELOG → SemVer 提版本 → `node scripts/publish.mjs` → 推送 + tag。详见 [AGENTS.md](AGENTS.md)。

## 许可

MIT — 见 [LICENSE](LICENSE)。
