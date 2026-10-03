# 发版流程（Release process）

> 本文是这个仓库**唯一**的发版说明。其他地方只应该链接到这里，不再重复步骤——
> 重复过的两份描述已经互相矛盾过一次（见文末「这片文档的由来」）。
>
> 维护者用；贡献者只需要读 [CONTRIBUTING.md](CONTRIBUTING.md)。

## 一句话

**tag 只是候选，2FA 那一下才是发布。** 顺序是：**合并版本 PR → 打 tag → CI staging → 你 2FA 批准 → 转正草稿 Release。**

---

## 标准流程

### 1. 准备版本（走 PR，不能直推）

`master` 有分支保护（require PR + required status checks），**直推会被拒**。所以版本准备是一个 PR：

```sh
git switch -c release/0.8.0          # 从最新 master 开分支
```

- 更新 `CHANGELOG.md`：把该版本的改动归到 `Added` / `Fixed` / `Changed` / `Removed`。
  **正文取自这里**，CI 会拿它当 Release notes；缺这一节会**直接失败**，不会产生空 Release。
- 按 SemVer 提升 `package.json` 的 `version`。
  ⚠️ **tag 与 `package.json` 必须一致**，CI 在 staging 之前就会校验并 `exit 1`。
- 同步 `SECURITY.md` 的支持版本表（它曾经停在 `0.6.x` 而包已经 0.7.3，别再让它漂）。

本地先跑一遍闸门（CI 也会跑同样的几道）：

```sh
pnpm run build && pnpm test
node scripts/smoke.mjs           # 7 个工具仍然注册
node scripts/check-tarball.mjs   # 发布包不含本地状态、也不缺消费者需要的文件
```

### 2. 合并 PR

CI（`ubuntu-latest` + `windows-latest` × node 22，外加一个 node 20 的 runtime-floor job）全绿后合并到 `master`。

### 3. 在合并提交上打 tag 并推送

```sh
git switch master && git pull
git tag -a v0.8.0 -m "dsh-map-tools v0.8.0"
git push origin v0.8.0
```

**推 tag 不受分支保护影响**（ruleset 的 `target` 是 `branch`，`ref_name` 是 `~DEFAULT_BRANCH`），所以这一步永远能走。

### 4. CI 做它该做的（不需要你操作）

`.github/workflows/release.yml` 被 `v*` tag 触发，然后：

1. 校验 tag 与 `package.json` 版本一致——不一致就失败，此时**什么都还没上传**；
2. 跑与 CI 相同的那套闸门（build / test / smoke / check-tarball）；
3. 检查这个版本**是否已经有 provenance**；
4. `npm stage publish` —— 经 npm trusted publishing 的 OIDC 身份上传，**不带任何长期 token**。

**此时什么都没公开。** 版本在 registry 的暂存区里：元数据可见，但 tarball 不公开，**谁都装不到**。

### 5. 你用 2FA 批准（这一步只能是人）

```sh
npm stage list dsh-map-tools
npm stage approve <stage-id>        # 会要 2FA；npmjs.com → Staged Packages 也可以
```

### 6. 把草稿 Release 转正

CI 留下的是**草稿** Release（防止「公告比东西先出现」）：

```sh
gh release edit v0.8.0 --draft=false
```

这两条命令每次都打印在 run summary 里，不用记。

---

## 为什么分两段

npm 的 trusted publisher 对这个包**只授权 staged publishing**——`npm publish` 不在允许的动作里。

于是：**一个被攻陷的 workflow 没有能力把包直接推给全世界。** tag 表示「这是候选发布」，2FA 那一下才表示「这就是发布」。这条设计的代价是多一次人工操作，收益是发布路径上永远有一个人的在场证明。

## 为什么动作被钉在 commit SHA 上

所有 `uses:` 都 pin 到完整 commit SHA 而不是浮动的 `vN` tag。原因是 `release` job 持有 `contents: write`：

一个被投毒的 action 本来可以落一个 commit、改掉 `release.yml`，然后由**你自己那条合法流水线** stage 出攻击者构建的包——只剩 2FA 一道闸。pin 住 SHA 之后，上游改 tag 不再影响这里。

[Dependabot](.github/dependabot.yml) 每周为 actions 与 npm 依赖开 PR 来升这些 pin。**pin 要有人升**，所以别关掉它。

---

## 硬性规则

| 规则 | 为什么 |
|---|---|
| **不要为了省事本地 `npm publish`** | 直发的版本没有 provenance，而且**无法补救**——见下节 |
| **先 tag，后其他** | 发布的是 tag 指向的那个提交；先发后补 tag 会让两者错位 |
| **不要在 tag 之后改 `package.json` 版本** | tag 与 manifest 必须一致，否则 CI 在上传前就失败 |
| **不要直推 `master`** | 分支保护会拒；版本准备走 PR |
| **2FA 那一步不要跳** | 它是「这是发布」的唯一表示 |

## 一个版本无法补救的两种情况

这两种情况下**唯一**的修法是**换一个版本号重发**。请把这句话当成本流程里最硬的一条。

1. **本地直发**：`npm publish` 不产生 provenance，而 npm 不允许已发布版本再次 staging。
2. **先发后补 tag**：同上——版本已经在 registry 上，但这条 workflow 从没 stage 过它。

之后每次推这个版本的 tag，release run 都会**变红**，报「public without provenance」。那不是 bug，是闸门在工作。

要让一次**已经发生**的直发不阻塞后续：手动触发 workflow

> Actions → release → **Run workflow** → 把 **Use workflow from** 选成**那个 tag**（不是默认分支）
> → 勾选 `acknowledge_unprovenanced`

⚠️ **必须选 tag。** `github.ref_name` 取的是你选的那个 ref，而 workflow 第一步就会拿它跟
`package.json` 的版本比对——选中默认分支（这是下拉框的默认行为）会在**校验阶段**就失败
（`tag master does not match package.json version …`），根本走不到那个勾选框。

tag 推送**满足不了**这个输入（`inputs` 在 tag 触发时为空），所以常规发布保持严格。这个开关是给意外准备的，不是常规路径。

⚠️ **这条闸门红的时候不会产生草稿 Release。** 建 Release 的 job 写着 `needs: stage`，而
`stage` 在这里失败了，所以它整个被跳过。如果你仍想要一个 GitHub Release，得手工建
（正文取 CHANGELOG 里该版本的小节）。

> 历史记录：`dsh-map-tools@0.7.3` 就是这样发出去的（当天 github.com 的 git 通道连不上，tag 推不出去）。事后补了 tag 与 Release，并且当时还专门给 workflow 加了一步「已发布就跳过 staging」来让它不变红。**那一步在 2026-10-03 被换成 provenance 检查**——因为「在 registry 上」并不等于「我们 stage 过」，而旧判断把这个区别抹掉了。

## 只读核对：一次发布到底成没成

**判据只有一条：用全新缓存 + `--prefer-online` 把 tarball 真拉下来**，并与本地构建产物对照 sha1。

```sh
node scripts/publish.mjs --verify-only
```

`npmjs.com` 上的 `Published`、`npm view`、完整 packument——**都不算数**：npm 的读路径是几份独立传播的缓存，它们比 tarball 传播得早。0.7.0 发布时实测过：网站已显示 Published、packument 里也有，但 tarball 仍 404。

## 出问题时

| 现象 | 原因 / 处理 |
|---|---|
| `tag ... does not match package.json version` | tag 与 manifest 不一致。删 tag 重打：`git tag -d vX.Y.Z && git push origin :refs/tags/vX.Y.Z` |
| `public without provenance`（红灯） | 这个版本被直发过，无法补救。换版本号重发；或按上文手动触发 |
| staging 成功但装不上 | **正常**——批准之前 tarball 本来就不公开。去批准 |
| 批准后仍拉不到 | 多半是 CDN 传播滞后，等几分钟重跑 `--verify-only`。若 packument 里也看不到版本，才是真失败 |
| Release 是草稿 | 正常。批准之后 `gh release edit vX.Y.Z --draft=false` |
| 2FA 批准失败 | 账号没开 2FA，或 trusted publisher 配置被改过。见 `release.yml` 头部的一次性配置步骤 |

## 本地没有 CI / CI 不可用时的等价物

```sh
node scripts/publish.mjs              # 默认两段式：等同 CI 的 stage 半程
node scripts/publish.mjs --direct     # ⚠️ 直发：版本立刻公开，且永远拿不到 provenance
node scripts/publish.mjs --verify-only
```

**`publish.mjs` 默认就是两段式**，直发必须显式 `--direct`，而且脚本会把代价打印出来。默认值站在合规一边，是因为这条路上犯错的代价是**不可逆**的。

## 与其他文件的关系

- `CHANGELOG.md` —— Release notes 的来源（两侧语言都要有，正文取自两边的对应段落）。
- `CONTRIBUTING.md` —— 贡献者的开发流程；发版细节指向本文。
- `SECURITY.md` —— 支持版本表**每次发版都要同步**。
- `RELEASE-STATUS.md` —— **本地的状态交接快照，不进版本控制**，也不是流程说明。它按时间记录「当前到什么状态」，发版请以本文为准。

## 这片文档的由来

2026-10-03：仓库里同时存在两套发版描述——`README` / `CONTRIBUTING` 里是「tag → CI staging → 2FA」，而本地 `RELEASE-STATUS.md` 的「发布流程固化」一节写的是「…→ `node scripts/publish.mjs` 发布 npm → `gh release create`」，即旧的本地直发流程。两者都没错，但它们描述的是**不同的东西**，而读者无从分辨。

本文取代那些重复的描述。判据：**如果本文与别处冲突，以本文为准，并把别处改成链接。**
