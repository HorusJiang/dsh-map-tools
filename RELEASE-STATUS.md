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
| GitHub 仓库 | ✅ | HorusJiang/dsh-map-tools（26 commit，dsh-plugin topic，prepare 脚本，本地与 origin/master 同步） |
| git 安装链路 | ✅ | `dsh plugin add github:HorusJiang/dsh-map-tools` 端到端可用（allowBuilds 引导正常） |
| **npm 发布** | ✅ | **dsh-map-tools@0.3.1 已上线**（CHANGELOG 0.3.1 = 2026-08-19，`dsh plugin add dsh-map-tools` 安装验证通过） |
| 收录 PR | ✅ | awesome-dsh-plugin#1842 已提交，mergeable CLEAN，主 check 通过 |
| 一键发布脚本 | ✅ | scripts/publish.mjs（认证守卫 + registry 切换 + 构建 + 发布 + 验证） |

## 待办：收录 gate 最终通过（阻塞于时间）

**阻塞原因**：仓库须满 1 天（首次 commit 2026-08-19 10:48），gate 的 `MIN_AGE_DAYS = 1` 是硬性 CI 检查。

- **预计通过时间**：2026-08-20 10:48 之后
- **当前状态**：PR #1842 的 submission gate = neutral（"could not be fully checked"），本地模拟验证唯一未达标项就是仓库年龄
- **满 1 天后**：regate 机制或手动 re-run workflow 会自动重新判定 → 应通过 → 维护者审阅合并
- **合并后**：awesome-dsh-plugin.com/plugins.json 每日刷新 → dshmarket 自动收录（无需额外操作）

## 接续方法

```sh
# 检查外部条件
npm whoami                                   # 已登录（horusj），npm 发布已完成
gh pr checks 1842 --repo awesome-dsh-plugin/awesome-dsh-plugin   # 检查收录 gate
```

## 关键链接

- 插件仓库：https://github.com/HorusJiang/dsh-map-tools
- npm 包：https://www.npmjs.com/package/dsh-map-tools
- 收录 PR：https://github.com/awesome-dsh-plugin/awesome-dsh-plugin/pull/1842
- 收录条目：docs/awesome-dsh-plugin-submission.yml
- 高德 key 申请：https://console.amap.com/dev/key/app
