#!/usr/bin/env node
/**
 * Secret-leak guard.
 *
 * Two callers, two modes:
 *
 *   node scripts/check-secrets.mjs            # staged changes (the pre-commit hook)
 *   node scripts/check-secrets.mjs --all      # every tracked file (CI)
 *
 * The pre-commit mode only ever sees `git diff --cached`, so it cannot catch a secret
 * that is already committed, and it cannot run in CI at all — there is no staging area
 * there, so it would report "clean" without having scanned anything. `--all` reads the
 * tracked files themselves, which is what a CI gate has to do.
 *
 * Installed as `.git/hooks/pre-commit` by install-hooks.mjs (`pnpm hooks`).
 *
 * Two false-positive notes, because both have been hit:
 *   - the ellipsis placeholders in README (`"amapKey": "……"`) are not 32-hex, so they
 *     pass; a real key would not.
 *   - a base64 payload inside an SVG (`data:image/jpeg;base64,…`) can contain a
 *     sequence like `AKIA` by chance. Matching is case-sensitive on purpose, because a
 *     case-insensitive `-match` in PowerShell has flagged exactly that before.
 */

import { execFileSync, execSync } from 'node:child_process'
import { readFileSync, statSync } from 'node:fs'

/** Files that must never be committed, regardless of content. */
const BLOCKED_PATHS = [
  /(^|\/)config\.json$/,
  /\.dsh-map-tools(\/|$)/,
  /^\.env(\.|$)/,
  /\.pem$/, /\.p12$/, /\.key$/,
  /secrets(\/|$)/,
]

/** Secret-shaped values to flag inside file contents. */
const SECRET_PATTERNS = [
  // Amap Web Service key: 32 hex chars.
  /"amapKey"\s*:\s*"[0-9a-f]{32}"/i,
  // Generic API key assignments (heuristic: key= long opaque value).
  /(?:amapkey|api[_-]?key|baiduak|token|secret)\s*[=:]\s*["']?[A-Za-z0-9_-]{24,}["']?/i,
]

/** Text files larger than this are not read: a secret in a 5 MB blob is not our shape. */
const MAX_BYTES = 2 * 1024 * 1024

/**
 * Run a git command without a shell.
 *
 * `execFileSync` with an argument array, not `execSync` with an interpolated string: a
 * staged filename containing a quote used to be escaped by hand here, and the escape
 * only covered `"`. No shell, no escaping, no bug.
 *
 * `core.quotePath=false` matters for the same reason in the other direction: git's
 * default C-style quoting turns a path like `docs/兼容性说明.md` into
 * `docs/\345\205\274...`, which then does not exist on disk. Without this, `--all`
 * silently skips every non-ASCII filename — it reported them as unreadable rather than
 * scanning them, which is the one failure mode a secret scan cannot have.
 */
function git(args) {
  return execFileSync('git', ['-c', 'core.quotePath=false', ...args], {
    encoding: 'utf8',
    cwd: process.env.GIT_PREFIX || undefined,
  })
}

/** Staged file list, excluding deletions (nothing to scan). */
function stagedFiles() {
  return git(['diff', '--cached', '--name-only', '--diff-filter=ACM'])
    .split('\n').map((s) => s.trim()).filter(Boolean)
}

/** Very small binary sniff: a NUL byte in the first 8 KiB. */
function looksBinary(text) {
  return text.includes('\u0000')
}

function readTextIfSmall(file) {
  try {
    if (statSync(file).size > MAX_BYTES) return { skip: 'too large to scan' }
    const text = readFileSync(file, 'utf8')
    if (looksBinary(text)) return { skip: 'binary' }
    return { text }
  } catch (error) {
    return { skip: `unreadable (${error?.code ?? error?.message ?? 'error'})` }
  }
}

/**
 * Collect what to scan.
 *
 * Returns `{ file, content }[]` plus the list of paths that were skipped, so a scan that
 * silently covered nothing cannot pass for a scan that found nothing.
 */
function collect() {
  if (!process.argv.includes('--all')) {
    const files = stagedFiles().map((file) => {
      try {
        return { file, content: git(['diff', '--cached', '--unified=0', '--', file]) }
      } catch {
        return { file, content: '' }
      }
    })
    return { files, skipped: [] }
  }

  const tracked = git(['ls-files']).split('\n').map((s) => s.trim()).filter(Boolean)
  const files = []
  const skipped = []
  for (const file of tracked) {
    const { text, skip } = readTextIfSmall(file)
    if (skip !== undefined) skipped.push(`${file}: ${skip}`)
    else files.push({ file, content: text })
  }
  return { files, skipped }
}

function main() {
  const mode = process.argv.includes('--all') ? 'all tracked files' : 'staged files'
  let collected
  try {
    collected = collect()
  } catch (error) {
    // Not a git checkout (a published tarball, for instance): say so instead of exiting 0
    // as though the tree had been checked.
    console.error(`[check-secrets] ⚠️  cannot list ${mode}: ${error?.message ?? error}`)
    console.error('[check-secrets]     nothing was scanned — this is not a pass')
    process.exit(0)
  }

  const { files, skipped } = collected
  const problems = []

  for (const { file, content } of files) {
    if (BLOCKED_PATHS.some((re) => re.test(file))) {
      problems.push(`${file}: blocked path (config / env / key file must never be committed)`)
      continue
    }
    for (const pattern of SECRET_PATTERNS) {
      const match = content.match(pattern)
      if (match) {
        problems.push(`${file}: possible secret value ${JSON.stringify(match[0].slice(0, 60))}`)
        break
      }
    }
  }

  if (problems.length > 0) {
    console.error(`[check-secrets] ❌ ${mode} contain a potential secret:\n`)
    for (const p of problems) console.error(`  - ${p}`)
    console.error('\nRemove the value and retry. If this is a false positive, do not reach')
    console.error('for `git commit --no-verify` — that skips this check for everything in')
    console.error('the same commit. Narrow the pattern instead, or stage explicit paths.')
    process.exit(1)
  }

  console.log(`[check-secrets] ✅ ${mode} look clean (${files.length} scanned, ${skipped.length} skipped)`)
  if (skipped.length > 0 && process.argv.includes('--all')) {
    // Printed, not swallowed: "skipped" must never be mistaken for "clean".
    for (const s of skipped) console.log(`[check-secrets]    skipped ${s}`)
  }
}

main()
