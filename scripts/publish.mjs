/**
 * One-command npm publish for dsh-map-tools.
 *
 * Usage (after `npm login`):
 *   node scripts/publish.mjs
 *
 * Steps:
 *   1. Verify npm auth (npm whoami).
 *   2. Switch this package's registry to the official npm registry
 *      (the user-level registry may be a mirror like npmmirror).
 *   3. Build (tsc) — `prepack` also builds, but we build explicitly so a
 *      build failure stops before packing.
 *   4. Dry-run pack to confirm contents.
 *   5. Publish.
 *   6. Verify the published version is fetchable.
 */
import { execSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const pkgRoot = path.resolve(__dirname, '..')

function run(cmd, opts = {}) {
  console.log(`\n$ ${cmd}`)
  execSync(cmd, { stdio: 'inherit', cwd: pkgRoot, ...opts })
}

function check(cmd, opts = {}) {
  return execSync(cmd, { encoding: 'utf8', cwd: pkgRoot, ...opts }).trim()
}

// 1. Auth check
try {
  const who = check('npm whoami')
  console.log(`Logged in as: ${who}`)
} catch {
  console.error('\n❌ Not logged in to npm. Run:')
  console.error('  npm config set registry https://registry.npmjs.org/')
  console.error('  npm login')
  process.exit(1)
}

// 2. Use the official registry for this project (user-level may be a mirror).
run('npm config set registry https://registry.npmjs.org/')
const registry = check('npm config get registry')
console.log(`Registry: ${registry}`)

// 3. Build
run('npm run build')

// 4. Dry-run pack
run('npm pack --dry-run')

// 5. Publish
run('npm publish --access public')

// 6. Verify
// npm 的读路径走 CDN，刚 publish 完立刻 `npm view` 可能先拿到 404（实测 0.6.0
// 发布时就是这样：包已经上线、dist-tag 也已指向它，但首次查询报 "No match found"）。
// 这里重试几次再判，避免把"已经成功"的发布误判成失败并让脚本崩掉。
const version = check('node -p "require(\'./package.json\').version"')
const name = check('node -p "require(\'./package.json\').name"')
let published = ''
for (let attempt = 1; attempt <= 6; attempt += 1) {
  try {
    published = check(`npm view ${name}@${version} version`).split('\n').pop().trim()
    break
  } catch (error) {
    console.log(`  verify attempt ${attempt}/6 did not see ${name}@${version} yet (registry CDN propagation)`)
    if (attempt < 6) await new Promise((resolve) => setTimeout(resolve, 5000))
  }
}
if (published === version) {
  console.log(`\n✅ Published ${name}@${version} — https://www.npmjs.com/package/${name}`)
} else {
  console.warn(`\n⚠️ Published version ${version} not confirmed (got: ${published || 'not found'}); check npmjs.com manually.`)
  console.warn('   （发布本身很可能已经成功——npm 写入与 CDN 读取是两个路径。）')
}
