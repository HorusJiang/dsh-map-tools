#!/usr/bin/env node
/**
 * Secret-leak guard for the pre-commit hook.
 *
 * Scans the staged files (git diff --cached) for anything that could leak a
 * real API key or local config. Any hit exits non-zero so the commit is
 * refused — a second line of defense behind .gitignore.
 *
 * Run standalone:  node scripts/check-secrets.mjs
 * Run via git:     (installed as .git/hooks/pre-commit by install-hooks.mjs)
 */

import { execSync } from 'node:child_process'

/** Files that must never be committed, regardless of content. */
const BLOCKED_PATHS = [
  /(^|\/)config\.json$/,
  /\.dsh-map-tools(\/|$)/,
  /^\.env(\.|$)/,
  /\.pem$/, /\.p12$/, /\.key$/,
  /secrets(\/|$)/,
]

/** Secret-shaped values to flag inside staged file contents. */
const SECRET_PATTERNS = [
  // Amap Web Service key: 32 hex chars.
  /"amapKey"\s*:\s*"[0-9a-f]{32}"/i,
  // Generic API key assignments (heuristic: key= long opaque value).
  /(?:amapkey|api[_-]?key|baiduak|token|secret)\s*[=:]\s*["']?[A-Za-z0-9_-]{24,}["']?/i,
]

/**
 * The staged file list, excluding deletions (nothing to scan) and binary
 * paths (diff -U0 would garble them).
 */
function stagedFiles() {
  const raw = execSync('git diff --cached --name-only --diff-filter=ACM', {
    encoding: 'utf8',
    cwd: process.env.GIT_PREFIX || undefined,
  })
  return raw.split('\n').map((s) => s.trim()).filter(Boolean)
}

/** The staged diff text for one file (line-based, no context). */
function stagedDiff(file) {
  try {
    return execSync(`git diff --cached --unified=0 -- "${file.replace(/"/g, '\\"')}"`, {
      encoding: 'utf8',
      cwd: process.env.GIT_PREFIX || undefined,
    })
  } catch {
    return ''
  }
}

function main() {
  const files = stagedFiles()
  const problems = []

  for (const file of files) {
    if (BLOCKED_PATHS.some((re) => re.test(file))) {
      problems.push(`${file}: blocked path (config / env / key file must never be committed)`)
      continue
    }
    const diff = stagedDiff(file)
    for (const pattern of SECRET_PATTERNS) {
      const match = diff.match(pattern)
      if (match) {
        problems.push(`${file}: possible secret value ${JSON.stringify(match[0].slice(0, 60))}`)
        break
      }
    }
  }

  if (problems.length > 0) {
    console.error('[check-secrets] ❌ Commit blocked — potential secret leak:\n')
    for (const p of problems) console.error(`  - ${p}`)
    console.error('\nRemove the file/value and retry. If this is a false positive,')
    console.error('stage only the intended files explicitly (git add <path>) and commit.')
    process.exit(1)
  }

  console.log('[check-secrets] ✅ staged files look clean')
}

main()
