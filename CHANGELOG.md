# Changelog

All notable changes to this project are documented in this file.

## [Unreleased]

### Added

- **路线卡片升级为真地图（即调研里的"第一档：静态地图"）**：卡片优先显示高德
  静态地图——真底图 + 高德绘制的路线折线 + 起/终标注，由**宿主**去取，浏览器
  只加载一张本地图片：
  - 新增回环路由 `GET /dsh-map-tools/staticmap?w&h&line`（同源校验、按参数
    缓存、连接关闭即取消上游请求）。**key 不出服务端**——这也是不把图片塞进
    工具结果的原因（既不进模型上下文，也不必往附件仓库写字节）。
  - 新增 `AmapClient.staticMap()`：按官方文档格式拼 `paths`（**逗号分隔**：
    `weight,color,transparency,fillcolor,fillTransparency:坐标`；用竖线分隔
    会被高德拒成 `20003 UNKNOWN_ERROR`），响应按 PNG 字节缓存。
  - 取景框**交给高德自己适配**：只给 `paths`（+ `markers`），不传 `location`、
    不传 `zoom`，高德按路线外包框自适应取景。实测 0.8km 步行、20.9km 驾车、
    1205km 跨省、公交链各种尺度都完整居中、不裁切。
  - 没有 key / 配额超限 / 宿主没有这个路由时，图片加载失败 → 卡片**自动退回
    自绘示意图**（原来的第二档保留为兜底层，不是被替换掉）。
- **回合尾部的路线卡片（"最终结果"处）**：工具卡片渲染在回合的过程区
  （"思考"块里，可被折叠），所以只看最终答案的人看不到地图。现在按
  ui-deliverables 的模式自己折叠本轮路线结果（`ConversationNodeDefinition`，
  Turn 级数据键 `map-routes`），并注册到链式槽位
  `conversation.chat.turnTail` —— 地图出现在收尾正文之后（多条路线时显示
  最后一条，并注明本轮共几条）。
- **对话内路线卡片（自绘示意图，保留为兜底层）**：四个路线工具新增
  `output.presentationMeta` 投影——把真实路线几何抽稀后（Douglas–Peucker，
  ≤200 点、坐标 5 位小数）随会话日志持久化；客户端 `client/client.js` 用官方
  keyed 槽位 `tool.call.toolview` 认领 `map_*_route` 四个工具名，用纯 SVG 画出
  路线走向（蓝色折线 + 光晕 + 起点绿点 / 终点红点 + 起/终标注），显示距离、
  耗时、数据源、共 N 步，附"在高德打开"深链。**无底图、不请求外部网络、
  不需要前端 key**。
  - 新增 `src/geo.ts`（解码 / 去重 / 抽稀 / 编码，纯函数）；四个路线工具的输出
    schema 新增 `geometry` 字段（只用于派生卡片，不进入模型可见文本）。
  - 画布按路线外包框比例生成（画框宽 ≤560px、高 ≤240px），框内不再出现
    "一大片空白里一条细线"；空白处铺细网格底纹，读起来像地图画布。
  - 分段指引默认折叠（此前是个占半屏、带独立滚动条的框，把图挤成了配角）。
  - 卡片覆盖运行中 / 成功 / 失败 / 无几何四种形态：拿不到 `meta` 时退回文本行，
    错误态显示错误文本——不会因为"认领了 key"而让失败态比原来更难看。

### Fixed

- **回合尾部是"单选"席位，地图卡会被"本轮产出文件"行挤掉**：链式槽位
  `conversation.chat.turnTail` 的语义是**选举**——第一个非空 `select` 当选，
  同优先级按注册顺序（`packages/client/ui-renderer/src/client/scoped-slots.tsx`）。
  `ui-deliverables` 在 web 组合里先注册，于是**只要本轮产出了文件，它的行就当选，
  地图卡永远轮不到渲染**（实测：agent 的回合几乎必然写临时脚本，地图一直不显示；
  只有"没产出文件"的回合才碰巧轮到我们）。现在我们的入口用 `priority: -1` **先试**：
  有路线时我们当选并在卡片里注明"本轮另有 N 个产出文件"（数量取自
  `owner.turn.data.get('deliverables')`，读不到就当 0）；没有路线时返回 null 弃权，
  官方的产出文件行照常渲染。回归测试钉住 `priority < 0`。

- **卡片抬头是很长的整串地址**：`placeLabel` 的剥离列表是
  `[city, district, township]`，**漏了 `province`**。高德 `formatted_address` 是
  "省市区街道+具体位置"连写、以"湖南省"开头，`startsWith` 从整串开头比，一个前缀
  都匹配不上，整串原样留下——卡片抬头就成了"湖南省长沙市雨花区东山街道长沙南站"。
  现在把 `province` 一起剥（`GeocodeResult` 新增该字段，高德反查解析补上），实测
  显示为 `长沙南站`。原单测的 mock 恰好省略了省前缀，所以该缺陷一直隐形——已把
  mock 改成带省的真实形态（缺修复则必失败），并补了反查字段的单元测试。

- **回环路由在卸载时不撤销 → 热替换后路由永远停在上一个版本**：`webServer.register()`
  的返回值是**唯一**的撤销手段（同 `(kind, path)` 重复注册会抛
  `webserver: duplicate exact route`，而它不是 effect 自动托管的）。两个路由安装
  函数此前丢掉了这个 disposer，于是插件被卸载（HMR 重载、组合重算）后旧处理器留在
  表里，新实例再注册就撞 duplicate——该错误落在 `ctx.inject` 子作用域内被静默吞掉，
  现象是"工具已经换成新的、回环路由还是旧的"。现在 `installConfigRoute` /
  `installStaticMapRoute` 都把注册包进 `ctx.effect(() => scope.webServer.register(...))`，
  并补了回归测试：桩改成真实语义（重复注册抛错、disposer 是唯一撤销手段），
  断言"卸载后路由消失、重新安装不抛错"（旧写法下该测试必失败）。

- **静态地图"有底图、没路线"（根因）**：原先本地按 Web Mercator 公式算
  `location` + `zoom`，但**高德静态地图的 `zoom` 与标准 Web Mercator 差一级**
  （它的 12 级才等于 256px 瓦片的 13 级），于是"算准了装得下"的 zoom 实际被
  放大一倍，路线溢出画布；而高德**不报错**，只是静默把整条 `paths` 丢掉。
  现在不传 `location`/`zoom`，交回高德自适应（`AmapClient.staticMap`）。
  判定过程用 15px 洋红粗线做探针（底图不会有这种颜色，蓝色像素计数会被
  底图本身污染）：只传 `paths` 时洋红像素 18422、包围盒完整居中；传
  `zoom=13` 时只剩 705 个碎片。顺带删掉因此不再需要的 `fitMapZoom` /
  `routeCenter` / `webMercatorPx` / `mercatorY`（错的那套换算留在仓库里
  只会招来下一次回归）。
- **过程区的工具卡片会随过程反复重绘**：过程区**不再渲染地图**（紧凑摘要 +
  折叠路书），地图只在回合尾部（最终结果处）出现一次——顺带省掉一次静态
  地图请求。
- **地图太小、路线几乎看不见**：真地图画框原先按"路线比例做小缩略图"
  （竖长路线只有 200×240），实测那条路线的路线在屏幕上只有 **81×97 px**。
  现在画框宽度吃满卡片、高度用 CSS `aspect-ratio` 自适应（比例钳在
  [0.42, 0.68]），并按 1024px 出图。下限从 0.30 抬到 0.42：真实路线常常又长
  又扁（20 公里城市路线的高/宽只有 0.3 左右），按真实比例出图就是一条又矮
  又长的窄条，卡片里几乎看不出是张地图；抬高下限**不会缩小路线本身**
  （路线像素尺寸受宽度限制），多出来的是上下两边的地图上下文。
  另外给图片 URL 加了 `v=2` 版本号——宿主回的是 `max-age=86400`，不换 URL
  的话用户看到的还是缓存里那张坏图。
- **最终卡片显示经纬度而不是地名**：模型常常先用 `map_geocode` 把地名换成
  坐标、再拿坐标调路线工具，于是卡片抬头只能显示坐标。现在**坐标入参时反查
  一次**并裁成可读地名（剥掉省/市/区/街道前缀、去掉尾部括号补充），
  例如 `116.378,39.865 → 116.6,40.07` 变成 `北京南站 → 北京首都国际机场`。
  地名入参**不打任何额外请求**；反查失败（无 key / 配额）退回坐标原文，
  绝不影响路线结果。
- **高德 v5 路线请求缺少 `show_fields`，几何与耗时全部丢失**（既有 bug，
  自绘卡片时才暴露）：
  - v5 的 `polyline`（每步折线）与 `cost.duration`（方案耗时）**必须显式请求**
    `show_fields=polyline,cost` 才返回。此前不请求 → 几何只能退化成
    "起终点直线"（卡片画出一根斜棍），`durationS` 恒为 0
    （模型可见文本里连"约 N 分钟"都没有）。现已请求并把 v5 的真实字段名解析对。
  - **字段名按 v3 解析、实际调用 v5 接口**：方案/分段耗时在 `cost.duration`
    （不是 `duration`），分段距离在 `step_distance`（不是 `distance`）。
    旧代码读后者，导致**每个分段的距离与耗时恒为 0**、公交方案耗时恒为 0。
    现在两种写法都读（v5 优先，v3 兼容），公交耗时也恢复。
  - `RouteResult.points` 语义不可靠（高德分支只塞了起终点），已标注 deprecated；
    新增 `RouteResult.geometry` 承载真实折线。
  - 回归护栏：`scripts/amap-e2e.mjs` 增加长途路线断言——折线点数 >10、
    **曲折度（折线长 ÷ 直线距离）> 1.02**（≈1 就是退化的直线兜底）、
    方案耗时 > 0、且 `presentationMeta` 必须给出 ≤200 点的 `line`。
    这两类 bug 本来都能被它挡住。

### Notes

- **版本号暂未提升**：当前以本地覆盖的方式装入 `~/.dsh/profiles/web`（profile
  依赖仍是 `dsh-map-tools@^0.5.1`），此时提版本会让 profile 的依赖解析断档；
  待发布 npm 时再按 SemVer 提到 0.6.0。
- **不使用 `presentCall` / `presentResult`**：DSH 内置 Web 客户端不消费它们
  （`packages/core/tools/README.md`、`docs/cookbook/adding-a-tool.md`），
  UI 侧唯一入口是 `tool.call.toolview`。调研与证据见
  `docs/方向A-渲染路线调研.md`。
- "在高德打开"深链用的是官方 `uri.amap.com` URI 协议，**尚未实机验证**；
  首轮测试时请人工点一次确认。
- 测试 48 → 128（新增 `tests/geo.test.ts`、`tests/client-card.test.ts`、
  `tests/staticmap-route.test.ts`，扩充 `tests/amap.test.ts` /
  `tests/tools.test.ts` / `tests/config-route.test.ts`）。其中 client 测试直接加载随包发布的
  `client/client.js`（用假 `window.__ModuleLoader__` 捕获 factory），
  跑的就是浏览器加载的同一份字节；`geometry` 的嵌套坐标数组另用
  `validateJsonSchemaValue` 走真实运行时校验，并带反向用例证明断言非空转。
- **开发期热插拔（HMR）已实测打通**，配方与原理见 `docs/开发-热插拔-HMR.md`：
  profile 的 `cordis.patch.yml` 里打开 `hmr` 行并把 `root` 指向本仓库的 `lib`，
  同时把 profile 的 `node_modules/dsh-map-tools` 换成指向仓库的 junction。
  关键限制：**装在 `node_modules` 下的插件在结构上无法被模块热替换**——上游
  `cordis-plugin-hmr` 的 `loadDependencies()` 第一行就 `url.includes('/node_modules/')`
  直接返回，插件入口的依赖集合恒为空，重载条件 `dependencies.some(accepted)`
  永远不成立（`root`/`ignored`/`disabled` 怎么配都没用）。junction 让 Node 解析出的
  模块真实路径落在仓库里，才绕开这条排除。
- 高德**公交**的折线在 v5 里实测为空值（字段有 key、内容为空），故公交几何
  退化为"步行段起终点 + 公交上下车站点 + 火车/打车站点"连成的示意链，
  不画真实线路走向。这是已知限制，不是回归。

## [0.5.1] - 2026-09-06

### Docs

- **修正安装说明**：0.4.2 起发布包已不含 `prepare`/`postinstall` 构建脚本，移除 README
  （中/英）里"pnpm ≥10 需放行构建脚本"的过时提示，改为"无需放行、无需 allowBuilds"。
- 同步 SECURITY.md 支持版本表（latest = 0.5.x、< 0.5.0 不受支持）与 pre-commit
  钩子安装说明（`pnpm hooks`，不再经 postinstall）。
- 刷新 RELEASE-STATUS.md 状态交接（npm 0.5.0、GitHub Release v0.5.0、48 个单测）。

## [0.5.0] - 2026-09-05

### Changed

- **settings 接线迁移到 DSH 0.1.2-rc.1 / 0.1.3-alpha.1 新 API**：`@deepseek-ai/dsh-settings`
  删除了 `installSettingsSection` 与 `settingsNamespace` 工厂（namespace 改为普通小写连字符
  字符串，注册/接线改为 `SettingsProvider` 实例方法）。`src/settings-ns.ts` 现经
  `ctx.inject(['settings'])` 取得 provider 并调用
  `settings.installSection(ctx, 'dsh-map-tools', ConfigSchema, entry, { setSource, onChange })`
  ——语义与旧接口等价（组合入口值作 base 层；attach/commit/detach 时回调 reload）；未组合
  settings 服务的部署保持惰性、不运行。设置页卡片无改动：客户端 `settings.plugin.item`
  （key = `dsh-map-tools`）注入与 0.1.3 的 slot 架构一致，工具定义、自有配置路由均不变。
  （分析报告见 `docs/dsh-map-tools-v0.1.3兼容性说明.md`。）
- **peerDependencies 提升**：`@deepseek-ai/dsh-settings`、`@deepseek-ai/dsh-tools`
  由 `^0.1.0-rc.5` 提升到 `>=0.1.2-rc.1`（npm 当前发布线 0.1.2-rc.1 已是新 API；
  源码构建的 0.1.3-alpha.1 同样兼容）；`@deepseek-ai/cordis` → `^4.0.2`，
  `@deepseek-ai/schemastery` → `^3.18.2`。
- **dsh 元数据**：新增 `dsh.compatibility.dshReleases`（`0.1.2-rc.1`、`0.1.3-alpha.1`
  标记为 `compatible`），对齐 dsh-context 等已适配插件的写法。

### Fixed

- **设置卡片保存后工具未真正重建**：`POST /dsh-map-tools/config` 此前只写入
  `~/.dsh-map-tools/config.json`，从不触发工具重注册——卡片提示的"已保存 — 工具已重建"
  在 0.4.x 里实际要到插件重启才生效。现在路由保存成功后立即 reload
  （`installConfigRoute(ctx, reload)`）；settings section 变更的 `onChange` 路径保持原有行为。

## [0.4.4] - 2026-08-24

### Changed

- **设置卡片标题与描述**：卡片标题由裸的 `dsh-map-tools` 改为 **`地图引擎
  (dsh-map-tools)`**，并新增一行描述副标题（驾车/公交/步行/骑行路线、地理编码、
  POI 搜索），与 ModLens（"视觉引擎"）等的两行式卡片头部一致，观感更统一。
- **摘要改为挂载时加载**：原先卡片收起时右侧一直显示"加载中…"，只有点开才拉取
  配置摘要（数据源/是否已配置 key）。现改为卡片一挂载就加载，收起时右侧立即
  显示"高德 ✓ / OSM ✓ / 未配置"，去掉"加载中…"。

## [0.4.3] - 2026-08-24

### Fixed

- **设置卡片配色与 DSH 其它插件不一致**：`client/client.js` 的设置卡片原先外层用
  `<li>`，背景取 `var(--dsw-alias-bg-layer, #1e1e1e)`（实心深色），边框取
  `--dsw-alias-border`，因此在 设置 → 插件 里渲染成一条扁平的深色实心条，和
  ModLens 等用半透明主题叠加色（`--dsw-alias-bg-layer-2/-3`）+ `--dsw-alias-border-l2`
  的圆角卡片不一致。现将卡片外层改为 `div`，背景/边框对齐标准设置的半透明
  叠加色并添加过渡，使其与 DSH 主题配色一致。

## [0.4.2] - 2026-08-24

### Fixed

- **仍被 pnpm 构建脚本拦截**：0.4.1 移除了 `postinstall`，但发布包仍带
  `prepare: npm run build`。pnpm 会把 `prepare` 也当作构建脚本默认拦截
  （`preinstall`/`install`/`postinstall`/`prepare`），且对 registry 装的包一旦
  放行就会执行 `npm run build`（`tsc`），而发布包并未携带
  `src`/`tsconfig.json`/`typescript`，因此安装仍失败。
- 现将 `prepare` 也从 `scripts` 移除，发布包只保留 `build`/`test`/`hooks`/
  `check:secrets` 等对消费者无副作用的脚本；`prepack`（仅 `npm pack`/`publish`
  时运行、不参与依赖安装、不被 pnpm 拦截）保留用于 publish 前构建 `lib/`。
  这样消费者安装 dsh-map-tools 时，pnpm 不再有任何构建脚本需要拦截或执行。

## [0.4.1] - 2026-08-24

### Fixed

- **发布包无法被消费者安装**：`scripts.postinstall` 原先运行
  `node scripts/install-hooks.mjs`（给开发者装 git pre-commit 钩子），但
  `scripts/` 目录并不在 `package.json` 的 `files` 清单里（仅
  `lib` / `client` / `cordis.patch.yml` / `LICENSE`），导致发布到 npm 的包
  **缺失该脚本文件**，消费者安装时 `postinstall` 直接失败
  （`Cannot find module scripts/install-hooks.mjs`）；`postinstall` 的存在
  同时也触发了 **pnpm ≥10 默认拦截依赖构建脚本** 的提示（需额外点一次
  "Allow build scripts"）。
- 现将 `postinstall` 从 `scripts` 移除——这类只服务开发者本仓库的钩子安装
  不应在消费者安装时运行，一并消除了"构建脚本拦截"和"缺失文件"的双重失败。
  开发者如需重新安装 pre-commit secret guard，手动执行 `pnpm hooks`
  （= `node scripts/install-hooks.mjs`）。

## [0.4.0] - 2026-08-21

### Added

- **高德配额保护层（`src/clients/amap.ts`）**：个人开发者 key 的 QPS 上限极低
  （常见 3 QPS/秒，超限报 10021 `CUQPS_HAS_EXCEEDED_THE_LIMIT`），而一次工具
  调用内部可能连发 1~5 个高德请求、多个工具并行时瞬时击穿配额。新增三层防护：
  1. **限速排队**：RateLimiter 把任意两次请求的最小间隔钳制在 `1000/maxQps`，
     并发请求排队等待而非同时发出；
  2. **TTL 结果缓存**：geocode / route / POI 按参数做内存缓存，同一会话中相同
     请求直接命中缓存（transit 的 `resolveCity` 会命中 `resolve` 刚写下的
     geocode 缓存，省掉重复请求）；
  3. **配额错误分类 + 重试**：10020/10021（QPS 超限）标记为可重试并在客户端内
     线性退避重试；10022/10023（日配额超限）重试无意义，直接给出友好中文提示
     （新增 `AmapQuotaError`，`retryable` 字段区分两类）。
- **路线工具自动降级（`src/tools/routes.ts`）**：高德配额超限时，驾车/步行/骑行
  自动降级 OSRM 免费源（结果标注 `provider: osrm`）；公交无免费兜底源，改为
  可操作的错误提示（建议稍后重试或改用其他模式）。地址解析阶段遇到配额超限
  同样转为"稍后重试或提供 lng,lat 坐标"的引导。
- **`maxQps` 配置项**：`config.ts` / `config-file.ts` 新增，默认 2（低于高德
  常见 3 QPS 上限、留余量防 10021）；`configSummary()` 暴露给设置页卡片。

### Fixed

- 高德配额超限时不再裸抛 `Amap API error 10021: CUQPS_HAS_EXCEEDED_THE_LIMIT`，
  而是自动排队/重试/降级后返回结果，或给出中文可操作提示。

## [0.3.3] - 2026-08-20

### Security

- `applyConfig` 保存时清理已废弃配置字段（`baiduAk`，百度 provider 于
  0.3.0 移除后残留），避免死字段携带假 key 长驻 `~/.dsh-map-tools/config.json`。
- AGENTS.md 新增硬性约定：调试/验证脚本一律从 `process.env.AMAP_API_KEY`
  读取 key，禁止硬编码（对齐 `scripts/amap-e2e.mjs` 范本）。

## [0.3.2] - 2026-08-20

### Fixed

- **公交换乘（`map_transit_route`）对所有城市报 `Amap API error 20000:
  INVALID_PARAMS`**。两个叠加根因：
  1. 高德对直辖市（北京/上海/天津/重庆）的 `addressComponent.city` 返回空
     数组 `[]`（城市名实际在 `province` 里），导致城市解析拿到 `[]`、
     city1/city2 参数为空。新增 `normalizeCity()`：数组取首元素、空值回退
     `province`，`geocode()`/`reverseGeocode()` 统一规范化（类型放宽为
     `string | string[]`）。
  2. 高德 v5 公交接口只接受 adcode/citycode，不接受城市名（实测
     `北京`/`北京市` → INVALID_PARAMS，`110000`/`110101`/`010` → OK）。
     `resolveCity()` 改为优先返回 geocode/reverseGeocode 结果的 `adcode`
     （区级 adcode 如 `110101` 亦被接受），缺失时才回退去「市」字的城市名。
- **`map_reverse_geocode` 在直辖市报 schema 校验失败
  `"value.city" must be a string`**：同上，`city` 经 `normalizeCity()` 后
  保证为 `string`。
- `routeTool` 渲染：高德 v5 公交响应不返回 duration 字段，`durationS` 为 0
  时不再渲染「约 0 分钟」，只显示距离。

### Security

- Pre-commit secret guard: `scripts/check-secrets.mjs` scans staged files for
  key-shaped values and refuses the commit on a hit; installed via
  `scripts/install-hooks.mjs` (`postinstall`, contributors only). Defense in
  depth behind `.gitignore` hardening.
- `.gitignore` hardened: `config.json`, `.dsh-map-tools/`, `.env` and key
  files are now ignored.

## [0.3.1] - 2026-08-19

### Docs

- Professional open-source documentation pass:
  - Rewrote README.md / README.en.md: badges, install-option comparison, quick
    start, architecture diagram, FAQ.
  - Added SECURITY.md (key storage policy + vulnerability reporting).
  - Added AGENTS.md (agent collaboration conventions).
  - Added GitHub issue templates (bug / feature) and PR template.
  - Expanded CONTRIBUTING.md with data-source, config and testing conventions.
- package.json: added `author` and `bugs` fields.

## [0.3.0] - 2026-08-19

### Removed

- **Baidu Maps provider removed**: the Baidu JS-API ak cannot be used for
  server-side calls (requires a separate 服务端 application with IP whitelist),
  so the module was removed per request. `provider` is now `amap | osm`.
- Removed `baiduAk` config, BaiduClient, and all baidu dispatch branches.

### Fixed

- Settings card (client half) now shows only the Amap key field with the apply
  link; no dead Baidu controls.

## [0.2.0] - 2026-08-19

### Added

- **Baidu Maps (百度地图) provider**: `provider: 'baidu'` with `baiduAk` — route
  planning (driving/transit/walking/riding), geocoding, reverse geocoding and
  POI search through the Baidu Web Service API.
- **Host-side settings card** (modlens pattern, no client bundle): the plugin's
  card renders on 设置 → 插件 with a loopback route that reads/writes
  `~/.dsh-map-tools/config.json` — provider, `amapKey`, `baiduAk`, `timeoutMs`.
  Config-file values win over composition defaults; tools rebuild on a save.
- Dual-provider config: `provider: 'amap' | 'baidu' | 'osm'`, keys are
  secret-role with apply links (Amap / Baidu consoles).
- Free-source geocoding now gives actionable CN-friendly guidance (Photon /
  Nominatim are unreliable for Chinese addresses).
- 6 config-file unit tests + config round-trip e2e script (39 unit tests total).

### Fixed

- Geocode tools now try Photon → Nominatim with a unified guidance error
  instead of surfacing raw provider failures.

## [0.1.0] - 2026-08-18

### Added

- 7 native tools for DeepSeek Harness:
  - `map_driving_route` — driving route planning (OSRM default, Amap with key)
  - `map_transit_route` — transit planning (requires Amap key)
  - `map_walking_route` — walking route planning (OSRM default, Amap with key)
  - `map_bicycling_route` — bicycling route planning (OSRM default, Amap with key)
  - `map_geocode` — address → coordinates (Nominatim default, Amap with key)
  - `map_reverse_geocode` — coordinates → address (Nominatim default, Amap with key)
  - `map_poi_search` — POI search (requires Amap key)
- Zero-key default: OSRM + Nominatim free data sources, no API key required.
- Optional Amap (高德) upgrade: `provider: auto|amap|osm`, secret-role `amapKey`
  with an apply-link in the settings card (Tencent-connector style).
- Settings integration via `@deepseek-ai/dsh-settings` (hot-reload on change).
- Friendly Chinese fallback guidance when free providers are unreachable
  (e.g. Nominatim blocked on CN networks) or when a key is invalid.
- Unit tests (vitest, mocked network), smoke test, and integration test.

### Fixed

- Amap base URL missing trailing slash (would 404 on real requests).
- Invalid Amap key now shows actionable guidance instead of a bare error.
