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
const version = check('node -p "require(\'./package.json\').version"')
const name = check('node -p "require(\'./package.json\').name"')
const published = check(`npm view ${name}@${version} version`).split('\n').pop()
if (published === version) {
  console.log(`\n✅ Published ${name}@${version} — https://www.npmjs.com/package/${name}`)
} else {
  console.warn(`\n⚠️ Published version ${version} not confirmed (got: ${published}); check npmjs.com manually.`)
}
