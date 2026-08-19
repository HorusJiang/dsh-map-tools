# dsh-map-tools 发布状态交接（2026-08-19）

> 本文档记录插件发布流程的**全部当前状态**，供随时接续，无需重跑调研。

## 已完成（全部验证通过）

| 项目 | 状态 | 证据 |
|---|---|---|
| 插件开发 | ✅ | 7 个工具（driving/transit/walking/bicycling route + geocode + reverse_geocode + poi_search），src/ 10 个源文件 |
| 单元测试 | ✅ | 26 个 vitest 测试（tests/ 5 文件），全绿 |
| 集成测试 | ✅ | scripts/integration.mjs：OSRM 真实路线返回 + Nominatim 降级引导 + transit key 引导 |
| 冒烟测试 | ✅ | scripts/smoke.mjs：7 工具注册 + secret 脱敏 + 申请链接 |
| GitHub CI | ✅ | .github/workflows/ci.yml（build + test）全绿 |
| GitHub 仓库 | ✅ | HorusJiang/dsh-map-tools（13 commit，dsh-plugin topic，prepare 脚本） |
| git 安装链路 | ✅ | `dsh plugin add github:HorusJiang/dsh-map-tools` 端到端可用（allowBuilds 引导正常） |
| 收录 PR | ✅ | awesome-dsh-plugin#1842 已提交，mergeable CLEAN，主 check 通过 |
| 一键发布脚本 | ✅ | scripts/publish.mjs（认证守卫 + registry 切换 + 构建 + 发布 + 验证） |

## 待办 1：npm 发布（阻塞于用户操作）

**阻塞原因**：npm 未登录（`npm whoami` → ENEEDAUTH），且无现有 token。登录凭据只能用户本人操作。

**用户操作**（完成后即发布）：
```sh
npm config set registry https://registry.npmjs.org/
npm login
node scripts/publish.mjs   # 一键完成：构建 → 打包检查 → 发布 → 验证
```

**备选**（如果不发布 npm）：git 安装链路已验证可用，收录规范允许 git/tarball 形式，npm 发布为增强项非必需。

## 待办 2：收录 gate 最终通过（阻塞于时间）

**阻塞原因**：仓库须满 1 天（首次 commit 2026-08-19 10:48），gate 的 `MIN_AGE_DAYS = 1` 是硬性 CI 检查。

- **预计通过时间**：2026-08-20 10:48 之后
- **当前状态**：PR #1842 的 submission gate = neutral（"could not be fully checked"），本地模拟验证唯一未达标项就是仓库年龄
- **满 1 天后**：regate 机制或手动 re-run workflow 会自动重新判定 → 应通过 → 维护者审阅合并
- **合并后**：awesome-dsh-plugin.com/plugins.json 每日刷新 → dshmarket 自动收录（无需额外操作）

## 接续方法

```sh
# 检查外部条件
npm whoami                                   # 若已登录 → node scripts/publish.mjs
gh pr checks 1842 --repo awesome-dsh-plugin/awesome-dsh-plugin   # 检查收录 gate
```

## 关键链接

- 插件仓库：https://github.com/HorusJiang/dsh-map-tools
- 收录 PR：https://github.com/awesome-dsh-plugin/awesome-dsh-plugin/pull/1842
- 收录条目：docs/awesome-dsh-plugin-submission.yml
- 高德 key 申请：https://console.amap.com/dev/key/app
