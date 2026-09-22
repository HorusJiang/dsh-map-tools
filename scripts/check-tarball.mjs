/**
 * What `npm publish` would actually upload, checked rather than trusted.
 *
 * `files` in package.json is an allowlist, and an allowlist is a control only for
 * as long as nobody widens it. This repository has material that must never ride
 * along: the sources the tarball's `lib/` was built from, the tests, the scripts,
 * the GitHub Pages site, the local handover notes — and the config file the plugin
 * writes at runtime, which is where an Amap key actually lives.
 *
 * The other direction matters just as much: an allowlist that silently stops
 * matching ships a package a consumer cannot use. So this asserts the files a
 * consumer needs are *present* too, against the real `npm pack --dry-run` output
 * rather than against the intention.
 *
 * Runs in CI before a publish (and on every push), locally as:
 *
 *   node scripts/check-tarball.mjs
 */

import { execSync } from 'node:child_process'

/** Local state and development material that must not ship. */
const FORBIDDEN = [
  /^src\//u,
  /^tests\//u,
  /^scripts\//u,
  /^site\//u,
  /^docs\//u,
  /^\.github\//u,
  /^\.pnpm-store\//u,
  /^node_modules\//u,
  /^\.workbuddy\//u,
  /^(AGENTS|CONTRIBUTING|SECURITY|PLAN|PROJECT-SNAPSHOT|RELEASE-STATUS)\.md$/u,
  /^tsconfig\.json$/u,
  /^vitest\.config\.ts$/u,
  /^pnpm-lock\.yaml$/u,
  /^config\.json$/u,
  /(^|\/)\.env/u,
  /\.log$/u,
]

/** What a consumer needs the tarball to carry. */
const REQUIRED = [
  'package.json',
  'lib/index.js',
  'lib/types/index.d.ts',
  'cordis.patch.yml',
  'client/client.js',
  'README.md',
  'README.en.md',
  'LICENSE',
]

// A literal command through the shell on purpose, not `execFileSync`: npm is
// `npm.cmd` on Windows, which execFileSync cannot resolve — and a check that only
// runs on the runner is a check nobody can reproduce locally.
const raw = JSON.parse(execSync('npm pack --dry-run --json', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }))

// npm 11 returns an array of results; npm 12 an object keyed by package name.
// Report an unrecognised shape rather than dying on a destructuring error.
const packed = Array.isArray(raw) ? raw[0] : Object.values(raw)[0]
if (packed === undefined || !Array.isArray(packed.files)) {
  console.error(`unexpected npm pack --json shape: ${JSON.stringify(raw).slice(0, 200)}`)
  process.exit(1)
}

const paths = packed.files.map((file) => file.path)
const leaked = paths.filter((path) => FORBIDDEN.some((pattern) => pattern.test(path)))
const missing = REQUIRED.filter((required) => !paths.includes(required))

console.log(`${packed.name}@${packed.version}: ${paths.length} files, ${(packed.size / 1024).toFixed(0)} KB packed`)

if (missing.length > 0) {
  console.error(`the tarball is missing files a consumer needs: ${missing.join(', ')}`)
  process.exit(1)
}
if (leaked.length > 0) {
  console.error(`the tarball carries local state: ${leaked.join(', ')}`)
  process.exit(1)
}
console.log('ok: nothing local, nothing missing')
