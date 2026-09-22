/**
 * One-command publish for dsh-map-tools (local — this repo has no CI yet).
 *
 * Usage:
 *   node scripts/publish.mjs                 # 发布：构建 → 测试 → 打包检查 → npm publish → 验证可安装
 *   node scripts/publish.mjs --stage         # 两段式：npm stage publish，等维护者 2FA 批准
 *   node scripts/publish.mjs --verify-only   # 只验证某个版本"真的能装上"（不发布）
 *   node scripts/publish.mjs --skip-tests    # 跳过测试闸门（仅排障用）
 *
 * ## npm 现在的行为（旧文档里的"bypass-2FA token"已经过时）
 *
 * 账号开启 2FA 后，npm 提供 **staged publishing**：`npm stage publish` 只把版本交给
 * registry —— 元数据可见，但 **tarball 不公开、任何人都装不到**；必须由维护者用
 * 2FA 批准（`npm stage list <pkg>` → `npm stage approve <stage-id>`，或 npmjs.com
 * 的 Staged Packages 页）才真正公开。`npm stage` 需要 npm >= 11.15.0。
 *
 * dsh-jev-tools 的 CI（.github/workflows/release.yml）走的就是这条路：trusted
 * publisher 配成 **stage-only**（`npm publish` 不在允许的动作里），tag 触发 → 跑闸门
 * → `npm stage publish` → 人工 2FA 批准 → 把草稿 Release 转正。dsh-map-tools 还没搭
 * CI，本脚本就是同一件事的本地版：默认直接 `npm publish`（本地登录账号可直发），
 * `--stage` 走两段式。
 *
 * ## 验证为什么这么写（0.7.0 发布时实测的坑）
 *
 * 发布成功 ≠ 立刻能读到。npm 的读路径是几份**独立传播**的缓存：完整 packument、
 * 安装用的 corgi packument、tarball 各一份，本地 npm 还有自己的 HTTP 缓存。
 * 0.7.0 那次：npmjs.com 已显示 Published、完整 packument 里也有 0.7.0，但 tarball
 * 仍 404、corgi 里没有它、`npm pack dsh-map-tools@0.7.0` 报 notarget —— **全是缓存
 * 滞后，不是发布失败**（旧版脚本因此打了假警告，还把排查带偏）。
 *
 * 所以这里唯一的判据是：**用全新缓存 + --prefer-online 把 tarball 真拉下来**，并与
 * 本地 `npm pack` 产物的 sha1 对照。`npm view` / 网站上的 "Published" 都不算数 ——
 * 它们比 tarball 传播得早。
 */
import { execSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdtempSync, readdirSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const pkgRoot = path.resolve(__dirname, '..')
const args = new Set(process.argv.slice(2))
const verifyOnly = args.has('--verify-only')
const stageOnly = args.has('--stage')
const skipTests = args.has('--skip-tests')

/** 传播窗口：默认 12 次 × 15s ≈ 3 分钟（实测 0.7.0 各处对齐花了 5 分钟上下，可调）。 */
const attempts = Number(process.env.DSH_PUBLISH_VERIFY_ATTEMPTS ?? 12)
const delayMs = Number(process.env.DSH_PUBLISH_VERIFY_DELAY_MS ?? 15000)

const pkg = JSON.parse(readFileSync(path.join(pkgRoot, 'package.json'), 'utf8'))
const spec = `${pkg.name}@${pkg.version}`

/** 跑一条会打印输出的命令（子进程直接继承 stdio）。 */
function run(command) {
  console.log(`\n$ ${command}`)
  execSync(command, { stdio: 'inherit', cwd: pkgRoot })
}

/** 跑一条只要输出的命令。 */
function check(command) {
  return execSync(command, { encoding: 'utf8', cwd: pkgRoot }).trim()
}

/** 临时目录：每次验证都换新的 npm 缓存，避免读到滞后副本。 */
function tempDir(prefix) {
  return mkdtempSync(path.join(tmpdir(), prefix))
}

function sha1(file) {
  return createHash('sha1').update(readFileSync(file)).digest('hex')
}

/**
 * `npm pack <specifier>`，返回 tarball 路径；拉不到就抛（由调用方解读原因）。
 *
 * @param specifier - 包名@版本，或工作区路径（打本地那份）。
 * @param destination - tarball 落盘目录。
 * @param cache - 传入时使用**全新缓存**并 `--prefer-online`（绕过 npm 自己的 HTTP 缓存）。
 */
function pack(specifier, destination, cache) {
  const cacheFlags = cache === undefined ? '' : ` --cache "${cache}" --prefer-online`
  execSync(`npm pack "${specifier}" --pack-destination "${destination}"${cacheFlags} --silent`, {
    cwd: pkgRoot,
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  const tarball = readdirSync(destination).filter((name) => name.endsWith('.tgz')).pop()
  if (tarball === undefined) throw new Error(`npm pack produced no tarball for ${specifier}`)
  return path.join(destination, tarball)
}

/** 完整 packument 里能否看到这个版本（只能说明 registry 受理了，不代表能装）。 */
function metadataVisible() {
  try {
    return check(`npm view "${spec}" version`) === pkg.version
  } catch {
    return false
  }
}

/** 两段式发布后，人要做的两步。 */
function printApprovalHint() {
  console.log(`  npm stage list ${pkg.name}`)
  console.log('  npm stage approve <stage-id>          # 会要 2FA；npmjs.com → Staged Packages 也行')
  console.log(`  node scripts/publish.mjs --verify-only   # 批准后验证真的能装上`)
}

// ------------------------------------------------------------------ 发布
if (!verifyOnly) {
  // 1. 登录态
  try {
    console.log(`Logged in as: ${check('npm whoami')}`)
  } catch {
    console.error('\n❌ 未登录 npm。先执行：')
    console.error('  npm config set registry https://registry.npmjs.org/')
    console.error('  npm login')
    process.exit(1)
  }

  // 2. 两段式需要 npm >= 11.15.0。缺了就**明确失败**，不偷偷退回直发——那会绕过人工批准。
  //    先于任何配置/构建检查，省得白跑一遍才说不支持。
  if (stageOnly) {
    try {
      check('npm stage --help')
    } catch {
      console.error(`\n❌ 本机 npm ${check('npm --version')} 没有 \`npm stage\`（需要 >= 11.15.0）。`)
      console.error("   升级：npm install --global 'npm@^11.15.0'")
      console.error('   或者去掉 --stage 直接发布（本地登录账号可直发）。')
      process.exit(1)
    }
  }

  // 3. 本项目固定用官方源（用户级 registry 可能是镜像；已是官方源时是空操作）
  run('npm config set registry https://registry.npmjs.org/')
  console.log(`Registry: ${check('npm config get registry')}`)

  // 4. 闸门：构建、测试、打包内容检查（对齐 CI 跑的那几道）
  run('npm run build')
  if (!skipTests) run('npm test')
  run('npm pack --dry-run')

  // 5. 发布
  const publishCommand = stageOnly ? 'npm stage publish' : 'npm publish --access public'
  console.log(`\n$ ${publishCommand}`)
  try {
    process.stdout.write(execSync(publishCommand, { cwd: pkgRoot, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }))
  } catch (error) {
    // 捕获后再打印：只有拿到文本才能把"这个版本已经交过了"和真失败区分开。
    const text = `${error.stdout ?? ''}${error.stderr ?? ''}${error.message ?? ''}`
    process.stdout.write(text)
    if (/E409|EPUBLISHCONFLICT|Cannot publish over|previously published|previously staged/.test(text)) {
      console.log(`\nℹ️  ${spec} 已经在 registry 上（重复发布被拒），跳过发布，继续验证。`)
    } else {
      console.error('\n❌ 发布失败。')
      process.exit(1)
    }
  }

  if (stageOnly) {
    // staging 之后 tarball 本来就不公开，等传播没有意义：直接把"人要做的那两步"说清楚。
    console.log(`\nℹ️  已 staging ${spec} —— 现在它还不是公开版本，谁都装不到。`)
    console.log('   用 2FA 批准后才对所有人生效：')
    printApprovalHint()
    process.exit(0)
  }
}

// ------------------------------------------------------------------ 验证
console.log(`\n=== 验证 ${spec} 是否真的可安装 ===`)
const localDir = tempDir('dsh-publish-local-')
let localSha
try {
  localSha = sha1(pack(pkgRoot, localDir))
} catch (error) {
  console.log(`（本地打包装不出来，跳过 sha1 对照：${error.message}）`)
}

let installed
let installedSha
let lastError = ''
for (let attempt = 1; attempt <= attempts; attempt += 1) {
  try {
    const tarball = pack(spec, tempDir('dsh-publish-remote-'), tempDir('dsh-publish-cache-'))
    installed = tarball
    installedSha = sha1(tarball)
    break
  } catch (error) {
    lastError = String(error?.stderr ?? error?.message ?? error).trim().split('\n').pop() ?? ''
    console.log(`  第 ${attempt}/${attempts} 次：还拉不到 tarball${lastError === '' ? '' : `（${lastError}）`}`)
    if (attempt < attempts) await new Promise((resolve) => setTimeout(resolve, delayMs))
  }
}

if (installed !== undefined) {
  console.log(`\n✅ ${spec} 已可安装：${path.basename(installed)}（${readFileSync(installed).length} 字节）`)
  console.log(`   sha1 ${installedSha}`)
  if (localSha !== undefined) {
    console.log(localSha === installedSha
      ? '   与本地构建产物 sha1 一致 —— 发出去的就是测过的那份字节'
      : `   ⚠️  与本地构建产物 sha1 不同（本地 ${localSha}）；内容差异需人工确认（npm 版本不同也会导致字节不同）`)
  }
  if (!verifyOnly) {
    console.log('\n接下来（若还没做）：')
    console.log(`  git tag -a v${pkg.version} -m "${pkg.name} ${pkg.version}"`)
    console.log(`  git push origin v${pkg.version}`)
  }
  process.exit(0)
}

console.log(`\n❌ ${spec} 在 ${attempts} 次尝试（约 ${Math.round((attempts * delayMs) / 1000)} 秒）内仍无法下载。`)
console.log(`   完整 packument 里能看到该版本：${metadataVisible() ? '是（registry 已受理，但这不等于能装）' : '否'}`)
console.log('   两种常见原因：')
console.log('   1) staged 等待 2FA 批准 —— tarball 在批准前不会公开：')
printApprovalHint()
console.log('   2) 只是 CDN 尚未传播 —— 等几分钟后重跑 `node scripts/publish.mjs --verify-only`。')
process.exit(1)
