# dsh-map-tools 发布状态交接（2026-08-19）

> 本文档记录插件发布流程的**全部当前状态**，供随时接续，无需重跑调研。

## 已完成（全部验证通过）

| 项目 | 状态 | 证据 |
|---|---|---|
| 插件开发 | ✅ | 7 个工具（driving/transit/walking/bicycling route + geocode + reverse_geocode + poi_search），src/ 10 个源文件 |
| 单元测试 | ✅ | 32 个 vitest 测试（tests/ 6 文件），全绿（2026-08-19 会话实测） |
| 集成测试 | ✅ | scripts/integration.mjs：OSRM 真实路线返回 + Nominatim 降级引导 + transit key 引导 |
| 冒烟测试 | ✅ | scripts/smoke.mjs：7 工具注册 + secret 脱敏 + 申请链接 |
| GitHub CI | ✅ | .github/workflows/ci.yml（build + test）全绿 |
| GitHub 仓库 | ✅ | HorusJiang/dsh-map-tools（28 commit，dsh-plugin topic，prepare 脚本，本地与 origin/master 同步） |
| git 安装链路 | ✅ | `dsh plugin add github:HorusJiang/dsh-map-tools` 端到端可用（allowBuilds 引导正常） |
| **npm 发布** | ✅ | **dsh-map-tools@0.3.1 已上线**（CHANGELOG 0.3.1 = 2026-08-19，`dsh plugin add dsh-map-tools` 安装验证通过） |
| **Git tags / Release** | ✅ | 4 个 annotated tag（v0.1.0/v0.2.0/v0.3.0/v0.3.1）已推送，指向各自发布 commit；**GitHub Release v0.3.1（Latest）已创建**（2026-08-19，notes 基于 CHANGELOG） |
| 收录 PR | ✅ | awesome-dsh-plugin#1842 已提交，**Submission gate 通过**（2026-08-20 11:1x 重跑后 success："repo old enough, enough commits"），mergeable CLEAN |
| 一键发布脚本 | ✅ | scripts/publish.mjs（认证守卫 + registry 切换 + 构建 + 发布 + 验证） |

## 待办：维护者审阅合并 PR #1842（阻塞于对方仓库）

**现状**：收录 gate 已全部通过（首次 run 在 PR 提交时判定仓库仅 0.5 天而 fail；
2026-08-20 11:1x 向 PR 分支 `add-dsh-map-tools` push 空 commit 重新触发 CI，
新 run 的 Submission gate = success，PR mergeable = CLEAN）。

- **下一步**：等待 awesome-dsh-plugin 维护者审阅并合并 PR #1842（我方无合并权限，勿尝试 gh pr merge）
- **合并后**：awesome-dsh-plugin.com/plugins.json 每日刷新 → dshmarket 自动收录（无需额外操作）

## 接续方法

```sh
# 检查外部条件
npm whoami                                   # 已登录（horusj），npm 发布已完成
gh pr checks 1842 --repo awesome-dsh-plugin/awesome-dsh-plugin   # 检查收录 gate
gh release list                              # 查看 GitHub Release（当前 Latest: v0.3.1）
```

## 发布流程固化（下次发版照此执行）

1. 更新 `CHANGELOG.md`（版本段 + 变更分类）。
2. `package.json` 按 SemVer 提升版本。
3. `pnpm run build && pnpm test` 全绿。
4. `git commit`（如 `chore: release v0.3.2`）。
5. `git tag -a v0.3.2 -m "dsh-map-tools v0.3.2"` + `git push origin master v0.3.2`。
6. `node scripts/publish.mjs` 发布 npm。
7. `gh release create v0.3.2 --title "dsh-map-tools v0.3.2" --notes-file <notes>` 创建 GitHub Release（notes 用 CHANGELOG 内容）。

## 关键链接

- 插件仓库：https://github.com/HorusJiang/dsh-map-tools
- npm 包：https://www.npmjs.com/package/dsh-map-tools
- 收录 PR：https://github.com/awesome-dsh-plugin/awesome-dsh-plugin/pull/1842
- 收录条目：docs/awesome-dsh-plugin-submission.yml
- 高德 key 申请：https://console.amap.com/dev/key/app
