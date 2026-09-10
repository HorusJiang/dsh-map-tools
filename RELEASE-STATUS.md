# dsh-map-tools 发布状态交接（2026-09-11 更新至 v0.6.0）

> 本文档记录插件发布流程的**全部当前状态**，供随时接续，无需重跑调研。

## 已完成（全部验证通过）

| 项目 | 状态 | 证据 |
|---|---|---|
| 插件开发 | ✅ | 7 个工具（driving/transit/walking/bicycling route + geocode + reverse_geocode + poi_search）+ 路线卡片（真地图 / 兜底示意图 / 回合尾部）；src/ 12 个源文件 |
| 单元测试 | ✅ | 135 个 vitest 测试（tests/ 11 文件），全绿（2026-09-11 0.6.0 会话实测） |
| 真机验证 | ✅ | DSH 0.1.5-rc.1 + Node v24.13.0：真地图三种模式（步行/公交/跨省 1205km）量化验证、回合尾部卡片、设置卡片、开发期热插拔全部实机跑通 |
| 集成测试 | ✅ | scripts/integration.mjs：OSRM 真实路线返回 + Nominatim 降级引导 + transit key 引导 |
| 冒烟测试 | ✅ | scripts/smoke.mjs：7 工具注册 + secret 脱敏 + 申请链接 |
| 高德真实链路 | ✅ | scripts/amap-e2e.mjs（需 AMAP_API_KEY）：长途路线折线点数/曲折度/耗时/`presentationMeta.line` 断言 |
| GitHub CI | ✅ | .github/workflows/ci.yml（build + test）全绿 |
| GitHub 仓库 | ✅ | HorusJiang/dsh-map-tools（dsh-plugin topic，prepare 脚本） |
| git 安装链路 | ✅ | `dsh plugin add github:HorusJiang/dsh-map-tools` 端到端可用（allowBuilds 引导正常） |
| **npm 发布** | ✅ | **dsh-map-tools@0.6.0 已上线（2026-09-11，latest）**；0.5.1 为上一版 |
| **Git tags / Release** | ✅ | annotated tag v0.1.0~v0.6.0 均已推送；**GitHub Release v0.6.0（Latest）已创建**（2026-09-11，notes 基于 CHANGELOG） |
| 收录 PR | ✅ | awesome-dsh-plugin#1842 已合并（2026-08-20），条目已进精选列表，dshmarket 每日刷新自动收录 |
| 一键发布脚本 | ✅ | scripts/publish.mjs（认证守卫 + registry 切换 + 构建 + 发布 + 验证） |

## 待办：~~维护者审阅合并 PR #1842~~ ✅ 已完成

~~**现状**：收录 gate 已全部通过（首次 run 在 PR 提交时判定仓库仅 0.5 天而 fail；
2026-08-20 11:1x 向 PR 分支 `add-dsh-map-tools` push 空 commit 重新触发 CI，
新 run 的 Submission gate = success，PR mergeable = CLEAN）。~~

- **已合并**：2026-08-20 由维护者合并 PR #1842；条目已收录进 awesome-dsh-plugin
  精选列表，dshmarket 通过每日刷新的 plugins.json 自动收录（无需额外操作）。

## 接续方法

```sh
# 检查外部条件
npm whoami                                   # 已登录（horusj）；registry.npmjs.org 本机可达
gh pr checks 1842 --repo awesome-dsh-plugin/awesome-dsh-plugin   # 检查收录 gate
gh release list                              # 查看 GitHub Release（Latest: v0.6.0）
```

> ⚠️ **本机网络**：GitHub 需要走**系统代理**（`127.0.0.1:7892`）。`gh` 会自动使用它；
> **`git` 不会**，push/pull 要显式带上：
> `git -c http.proxy=http://127.0.0.1:7892 -c https.proxy=http://127.0.0.1:7892 push origin master`
> （或一次性写进 `git config --global http.proxy …`）。npm registry 直连可达。

## 发布流程固化（下次发版照此执行）

1. 更新 `CHANGELOG.md`（版本段 + 变更分类；`## [Unreleased]` → `## [x.y.z] - 日期`）。
2. `package.json` 按 SemVer 提升版本（0.x 阶段：无破坏性改动 → MINOR）。
3. `pnpm run build && pnpm test` 全绿（沙箱里 `pnpm test` 会 spawn EPERM，可用程序化 vitest）。
4. 同步 `SECURITY.md` 支持版本表与本文档的状态行。
5. `git commit`（如 `chore(release): 0.6.0`）。
6. `git tag -a v0.6.0 -m "dsh-map-tools v0.6.0"` + `git push origin master v0.6.0`。
7. `node scripts/publish.mjs` 发布 npm。
8. `gh release create v0.6.0 --title "dsh-map-tools v0.6.0" --notes-file <notes>` 创建 GitHub Release（notes 用 CHANGELOG 内容）。

## 关键链接

- 插件仓库：https://github.com/HorusJiang/dsh-map-tools
- npm 包：https://www.npmjs.com/package/dsh-map-tools
- 收录 PR：https://github.com/awesome-dsh-plugin/awesome-dsh-plugin/pull/1842
- 收录条目：docs/awesome-dsh-plugin-submission.yml
- 高德 key 申请：https://console.amap.com/dev/key/app
