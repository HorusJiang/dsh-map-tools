# site/ — 插件门户页（静态，GitHub Pages 自动部署）

`index.html` 是 dsh-map-tools 的展示页：**banner 雾湖原图**打头，往下只有四块——一句主张 + 安装命令、
一张回合尾部地图卡片的实拍、三件能力、页脚。**刻意不堆信息**：没有工具表、没有架构图、没有 FAQ，
细节都在 README 里。本地双击可以打开，线上地址是 **https://horusjiang.github.io/dsh-map-tools/**
（2026-09-30 上线）。它**不是插件运行的一部分**，与 npm 包、工具注册、配置卡都无关——
`lib/` 和 `client/` 不需要它。

页面用到的本地资源都在 `site/assets/`：`banner.svg`（首页大图，仓库根的 `assets/banner.svg` 是同一张）、
`banner.jpg`（同图的位图版，给 `og:image` 用——社交平台不解析 SVG）、`card-turn-tail.png`（实拍截图）、
`favicon.svg`（小篆「径」）。页脚印的版本号必须与 `package.json` 一致，`node scripts/smoke.mjs`
会同时检查这一条和"页面引用的本地资源都存在"——静态页最容易烂掉的就是版本号和图片路径。

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
