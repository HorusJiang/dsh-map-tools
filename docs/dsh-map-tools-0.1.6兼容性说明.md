# dsh-map-tools 兼容性说明与更新建议

**目标插件**：`dsh-map-tools@0.6.0`（仓库 <https://github.com/HorusJiang/dsh-map-tools>）
**宿主版本**：DeepSeek Harness `0.1.6-alpha.2`（commit `ddefc45`，2026-09-18 本地构建）
**上一兼容版本**：`0.1.6-alpha.1`
**文档日期**：2026-09-18
**影响面**：回合尾部的地图路线卡片不显示（其余功能全部正常）

---

## 一、结论（先看这段）

DSH `0.1.6-alpha.2` 把客户端插槽 `conversation.chat.turnTail` 的**类型从 `chain` 改成了 `list`**。
插件按 `chain` 语义注册（`select` + 组件读 `props.matched`），在新版下会有两处不匹配：

| 问题 | 表现 |
| --- | --- |
| `list` 槽位要求必填 `id`，插件没传 | 注册时抛错，浏览器控制台报错，卡片完全不渲染 |
| `list` 槽位不再传 `matched`，插件组件依赖它 | 即使补上 `id`，组件仍会因拿不到数据而静默返回 `null` |

**修复要点**：给注册项加 `id`、去掉 `select`，并把"选路线"的逻辑从 `select` 挪进组件内部自己推导。

---

## 二、问题现象

### 2.1 浏览器控制台报错

```
Error: list slot "conversation.chat.turnTail" requires options.id
```

每个会话实例出现一次（实测一次页面加载出现 2 条）。

### 2.2 用户可见表现

在会话里让 Agent 规划过路线后，**回合末尾不再出现地图卡片**；工具调用卡片（过程区）、设置里的
"地图引擎"配置卡片、侧边栏等都正常，地图 API 调用本身也正常。

### 2.3 复现步骤

1. 用 DSH `0.1.6-alpha.2` 启动 Web（本地：`node "apps/cli/lib/bin.js" web`）。
2. 打开任意一个曾经调用过路线工具的历史会话（例如"长沙到双牌县自驾与高铁换乘路线规划"）。
3. 打开浏览器控制台：出现上面的报错，且该回合尾部没有地图卡片。

---

## 三、根因：插槽类型由 chain 改为 list

### 3.1 插槽声明的变化

文件：`packages/client/ui-chat/src/client/chat/register-node-renderers.ts`（均为第 51 行）

```ts
// 0.1.6-alpha.1（插件编写时的版本）
'conversation.chat.turnTail': { kind: 'chain', scope: 'session' },

// 0.1.6-alpha.2（当前版本）
'conversation.chat.turnTail': { kind: 'list', scope: 'session' },
```

渲染侧同步从 `renderSlotChain(...)` 改为 `renderSlot(...)`（见同目录 `client.js` 里的
`turnTailDefinition` 渲染处）。

### 3.2 两种插槽的语义对比

**chain（旧）** —— 文件：`packages/client/ui-renderer/src/client/scoped-slots.tsx:822-838`

```ts
let matched: unknown
matched = (entry.select as (owner: object) => unknown)(ownerProps)
if (matched !== null) {
  elected = guarded(entry, entryKeyOf(entry), { ...ownerProps, matched })
  break            // 第一个返回非 null 的注册者当选，其余不挂载
}
```

- 必填：`select`
- 语义：**单选**，按 `priority` 升序依次询问，第一个非空当选
- 组件 props：`{ ...ownerProps, matched }` —— 这就是插件里 `props.matched.routes` 的来源

**list（新）** —— 文件同上，第 1216 行起；注册校验见 `packages/client/ui-slots/src/index.ts:1230`

```ts
// ui-slots 注册校验
if (options.id === undefined) throw new Error(`list slot "${options.name}" requires options.id`)
const occupant = rec.entries.find(
  (e) => e.options.id === options.id && (e.options.priority ?? 0) === priority,
)
if (occupant) throw new Error(`list slot "${options.name}" already has an entry with id "${options.id}" …`)
```

- 必填：`id`（同 `id` + 同 `priority` 只允许注册一个，重复会抛错）
- 语义：**全部渲染**，每个 `id` 占一行；排序为 `priority` 升序 → `order` 升序
- 组件 props：只有 `ownerProps`（本槽位是 `{ turn, seq, openFile }`），**没有 `matched`**

### 3.3 为什么旧代码现在会挂

插件当前代码（`dsh-map-tools/client/client.js`）：

```js
scope.slots.inject('conversation.chat.turnTail', function () {
  return scope.slots.register({
    name: 'conversation.chat.turnTail',
    priority: -1,
    select: selectTurnRoutes,     // ← chain 专用；list 槽位不看这个字段，且缺 id 直接抛错
  }, TurnRouteCard)
})
```

```js
function TurnRouteCard(props) {
  var matched = props && props.matched && Array.isArray(props.matched.routes) ? props.matched.routes : []
  if (matched.length === 0) return null      // ← list 槽位下 matched 恒为 undefined，卡片静默消失
  …
  if (props.matched && props.matched.produced > 0 …)   // ← 同样依赖 matched
}
```

补充一点：插件把注册包在 `try/catch` 里，但 `slots.inject(name, factory)` 只是登记工厂函数，
**工厂是稍后异步执行的**，所以抛错发生在 `try` 之外，抓不到，直接冒泡成 page error。

---

## 四、更新建议（0.6.1）

### 4.1 注册处：加 `id`、去掉 `select`

```js
scope.slots.inject('conversation.chat.turnTail', function () {
  return scope.slots.register({
    name: 'conversation.chat.turnTail',
    id: 'dsh-map-tools-turn-routes',   // 新增：list 槽位必填，稳定且全局唯一
    priority: -1,                      // 保留：让地图卡排在官方"文件改动"卡（默认 priority 0）之前
  }, TurnRouteCard)
})
```

> `id` 建议用包名前缀（如 `dsh-map-tools-turn-routes`），避免与其他插件撞号。
> 若希望调整同优先级内的顺序，可再加 `order`（数值升序）。

### 4.2 组件内：自己推导数据，不再依赖 `props.matched`

```js
function TurnRouteCard(props) {
  var react = require('react')
  var h = react.createElement

  // 新增：list 槽位不传 matched，组件自己从 ownerProps（turn / seq）推导
  var selected = selectTurnRoutes(props)
  var matched = selected && Array.isArray(selected.routes) ? selected.routes : []
  var produced = selected && typeof selected.produced === 'number' ? selected.produced : 0
  if (matched.length === 0) return null
  …
  // 原先读 props.matched.produced 的地方改用局部变量 produced
}
```

说明：

- `selectTurnRoutes(owner)` 读的是 `owner.turn.data.get(ROUTE_TURN_KEY)` 和 `owner.seq`，
  这两个字段在 `list` 的 ownerProps 里都有，**函数本身不用改**，只是调用点从框架挪进组件。
- 该函数要求保持纯函数、可重复调用（每次渲染都会跑一次），现有实现满足。
- 建议在 `exports.__route` 里补一个可直接测试的入口（例如导出组件内部使用的
  `turnRouteCardModel(props)`），方便单测覆盖"没有路线时返回空"这条路径。

### 4.3 可选：调整文案

旧版因为是"二选一"，卡片里带了"另有 N 个产出文件"的提示。
新版两个卡片会同时出现（地图卡在前，官方"本轮文件改动"卡在后），这句提示可能就多余了，
可以自行决定保留或删除。

### 4.4 元数据更新

`package.json`：

```jsonc
{
  "version": "0.6.1",
  "dsh": {
    "compatibility": {
      "dshReleases": {
        "0.1.2-rc.1": "compatible",
        "0.1.3-alpha.1": "compatible",
        "0.1.5-rc.1": "compatible",
        "0.1.6-alpha.2": "compatible"   // 新增
      }
    }
  }
}
```

注意：`0.1.6-alpha.1` 与 `0.1.6-alpha.2` 对 `turnTail` 的语义不同。修复方案采用
"`id` + 组件内自推导"后，**对 alpha.1 也仍然可用吗？不行**——alpha.1 的 `list` 槽位不存在，
`chain` 槽位要求 `select`，去掉 `select` 会在 alpha.1 上报 `chain slot … requires options.select`。
若需要同时兼容两版，需按宿主版本分支注册（例如读取运行时版本，或 try/catch 后回退注册），
否则建议把最低支持版本直接抬到 `0.1.6-alpha.2`。

---

## 五、验证清单

在 DSH `0.1.6-alpha.2` 上：

1. 启动 Web，打开浏览器控制台。
2. 打开一个含路线工具调用的历史会话 → **不再出现** `requires options.id` 报错；
   该回合尾部**出现地图卡片**。
3. 打开一个没有路线调用的回合 → 卡片区域**不出现空白占位**。
4. 同一回合既改了文件又规划了路线 → 地图卡与官方"本轮文件改动"卡**同时出现**，顺序为地图卡在前。
5. 设置 → 插件 → "地图引擎 (dsh-map-tools)"配置卡片仍正常（该槽位 `settings.plugin.item` 未变）。
6. 工具调用过程区的小卡片、静态地图、示意图回退逻辑仍正常。
7. 插件仓库内：`pnpm build && pnpm test` 通过，版本号与 `dsh.compatibility` 已更新。

---

## 六、参考实现（官方同槽位注册）

官方两个内置插件都用 `list` 语义注册同一个槽位，可直接对照：

```ts
// packages/client/ui-deliverables/src/client/index.ts
ctx.slots.inject('conversation.chat.turnTail', () => ctx.slots.register({
  name: 'conversation.chat.turnTail',
  id: '@deepseek-ai/dsh-client-ui-deliverables',
  locale: NS,
  inject: () => ({ … }),
}, DeliverablesCard))

// packages/client/ui-plan/src/client/index.ts
ctx.slots.inject('conversation.chat.turnTail', () => ctx.slots.register({
  name: 'conversation.chat.turnTail',
  id: previewId,
  locale: NS,
  inject: open,
}, PlanCards))
```

两者都是"注册即渲染"，把是否需要显示、显示什么完全交给组件自己判断——修复后的
`dsh-map-tools` 应与这两个保持一致。

---

## 七、附带信息

1. **同类问题的兄弟插件**：`dsh-better-sidebar@0.19.1` 也注册了同一槽位
   （`lib/client-registry.js` → `registerTurnTailInterception`），同样缺 `id` 且用 `select`，
   报同样的错，受影响功能是"把本轮产出的文件送进侧边栏预览"。
2. **定位方法（可复用）**：报错文本里的插槽名 → `rg "requires options.id" packages/client/ui-slots`
   找到校验逻辑 → `rg "conversation.chat.turnTail" packages/client/ui-chat/src` 看当前 `kind`
   → 与上一版本目录对比即可确认是否发生了类型变更。
3. **相关官方变更记录**：`0.1.6-alpha.2` 的 release notes 中
   "客户端 Session 会话支持多实例共存，相关 API 及 slot 有变化" 指的就是这次调整。
4. 本文档依据的宿主源码为本地 `D:\Program Files\DeepSeekHarness\deepseek-harness`（0.1.6-alpha.2），
   上一版本源码保留在 `deepseek-harness-0.1.6-alpha1`，可随时对照。

---

## 八、实施记录（dsh-map-tools 0.6.1，2026-09-18）

上面的第四、五节是**建议**；实际落地时选了"插件版本跟着宿主版本走"的方案，与前两节的
推荐略有出入，以此节为准。

### 8.1 实际做法：按槽位声明自适应，而不是按版本分叉

不读宿主版本号，改为**读槽位当前的声明类型**（`slots.spec(name).kind`）：

```js
var TURN_TAIL_SLOT = 'conversation.chat.turnTail'
var TURN_TAIL_ID = 'dsh-map-tools-turn-routes'

function slotKind(scope, name) {                      // 读不到就返回 undefined
  var slots = scope && scope.slots
  if (!slots || typeof slots.spec !== 'function') return undefined
  var spec = slots.spec(name)
  return spec && typeof spec.kind === 'string' ? spec.kind : undefined
}

function registerTurnTail(scope) {
  var kind = slotKind(scope, TURN_TAIL_SLOT)
  if (kind === 'chain') return registerTurnTailAsChain(scope)   // 带 select
  if (kind === 'list')  return registerTurnTailAsList(scope)    // 带 id
  try { return registerTurnTailAsList(scope) }                  // 读不到：list → chain 依次试
  catch (listError) {
    try { return registerTurnTailAsChain(scope) }
    catch (chainError) { throw new Error('neither list nor chain registration worked — list: ' + listError + '; chain: ' + chainError) }
  }
}
```

要点：

- **§4.4 的"对 alpha.1 不行"不再成立**：`chain` 宿主拿到的仍是带 `select` 的注册，
  `list` 宿主拿到的是带 `id` 的注册，同一份构建两个宿主都注册得上，不必抬最低版本、
  也不必按版本分叉发布。
- 兜底顺序安全：`list` 槽位缺 `id` 会抛、`chain` 槽位缺 `select` 也会抛，而两者的校验
  都在写入账本之前（`ui-slots/src/index.ts` 的 `register()` 类型检查在最前），失败的
  尝试不留副作用。
- `slots.spec()` 只在 alpha.1/alpha.2 上都存在的公开方法（`SlotRegistry.spec` →
  `SlotCore.spec`）。即使某个宿主没有它，兜底顺序照样能注册成功——读声明只是快路径。
- 兜错**写在 `slots.inject()` 的工厂体里**（见 §3.3）：这样"注册失败"再也不会变成
  控制台 page error。

### 8.2 组件侧

新增纯函数 `turnRouteCardModel(props)` 作为两种语义的唯一适配点（并作为单测入口）：

- 有 `props.matched`（chain 宿主）就用它，并标记 `displaced: true`；
- 没有（list 宿主）就用 `selectTurnRoutes(props)` 从 ownerProps 自己推导。

`produced`（"本轮另有 N 个产出文件"）**只在 `displaced` 时显示**：链式槽位是单选举席，
确实挤掉了官方那行；列表式槽位下官方"本轮文件改动"卡与我们同时渲染，再提示就是多余的
（即 §4.3 提出的文案问题，这里按宿主语义自动取舍）。

### 8.3 实测验证

- 单测 142 项全绿（`tests/client-card.test.ts` 覆盖 list 宿主、chain 宿主、读不到声明时
  的两种回退、双路皆失败只记日志、以及 `turnRouteCardModel` 的三条路径）。
- 在 DSH `0.1.6-alpha.2` 的实况页面用 Slots 检查器查询 `conversation.chat.turnTail`：
  槽位 `kind: "list"`，占位为 `dsh-map-tools-turn-routes`（`priority: -1`，`active: true`）
  + 官方 `@deepseek-ai/dsh-client-ui-deliverables` / `@deepseek-ai/dsh-client-ui-plan`
  （`priority: 0`）——地图卡排在两条官方卡之前，控制台不再出现 `requires options.id`。
- 元数据：`package.json` 版本 → `0.6.1`，`dsh.compatibility.dshReleases` 增加
  `0.1.6-alpha.1` / `0.1.6-alpha.2`。
