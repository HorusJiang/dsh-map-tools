# site/ — 插件门户页（静态，GitHub Pages 自动部署）

`index.html` 是 dsh-map-tools 的展示页：能力介绍、安装步骤、架构图、FAQ。本地双击可以打开，
线上地址是 **https://horusjiang.github.io/dsh-map-tools/**（2026-09-30 上线）。
它**不是插件运行的一部分**，与 npm 包、工具注册、配置卡都无关——`lib/` 和 `client/` 不需要它。

部署走 [`.github/workflows/pages.yml`](../.github/workflows/pages.yml)：push 到 `master` 且改动
落在 `site/**` 或工作流文件本身时，`upload-pages-artifact`（path: `site`）+ `deploy-pages` 直接
把这个目录发上去，没有构建步骤，也没有依赖。

**一次性设置（已完成）**：仓库 Settings → Pages → Build and deployment → Source 选
**GitHub Actions**。工作流里的 `actions/configure-pages` **不要**加 `enablement: true`：工作流
自己的 `GITHUB_TOKEN` 没有"启用 Pages"的权限（实测报 `Resource not accessible by integration`），
启用这一步必须由有仓库管理权的身份完成——网页设置，或者

```bash
gh api --method POST repos/HorusJiang/dsh-map-tools/pages -f build_type=workflow
```

想换到别的静态托管（Vercel / Netlify / 对象存储 / 飞书妙搭）也可以：把 `site/` 整个目录丢过去
即可，它是纯静态的。
