# site/ — 插件门户页（静态，未自动部署）

`index.html` 是 dsh-map-tools 的展示页（本地双击即可打开）：能力介绍、安装步骤、架构图、FAQ。
它**不是插件运行的一部分**，与 npm 包、工具注册、配置卡都无关——`lib/` 和 `client/` 不需要它。

**当前没有被自动部署**：仓库的 GitHub Pages 没有启用，`pages.yml` 也已移除（开启 Pages 需要仓库管理员在
Settings → Pages → Source 里选 “GitHub Actions”，而工作流自己的 `GITHUB_TOKEN` 没有这个权限，实测报
`Resource not accessible by integration`）。

以后想把它发布到 `https://horusjiang.github.io/dsh-map-tools/`，三步：

1. 仓库 Settings → Pages → Build and deployment → Source 选 **GitHub Actions**；
2. 恢复部署工作流：`git checkout 0ccaf2f -- .github/workflows/pages.yml`
   （并把 `configure-pages` 的 `enablement: true` 去掉——那是给有管理员权限的 token 用的）；
3. push 一次 `site/**` 的改动即可触发。

或者直接把这个目录丢到任何静态托管（Vercel / Netlify / 对象存储 / 飞书妙搭）——它是纯静态的，没有构建步骤。
