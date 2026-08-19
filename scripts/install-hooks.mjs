#!/usr/bin/env node
/**
 * Install the pre-commit secret guard into this repository's git hooks.
 *
 * Writes .git/hooks/pre-commit (git-native hook, no husky dependency). Runs
 * on `postinstall` for contributors, but only inside a git working tree —
 * consumers who install dsh-map-tools from npm never get it.
 */

import { existsSync, mkdirSync, writeFileSync, chmodSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = join(__dirname, '..')
const gitDir = join(root, '.git')

if (!existsSync(gitDir)) {
  console.log('[install-hooks] not a git working tree; skipping pre-commit hook install')
  process.exit(0)
}

const hookPath = join(gitDir, 'hooks', 'pre-commit')
const hook = `#!/bin/sh
# Installed by dsh-map-tools scripts/install-hooks.mjs — secret-leak guard.
# Runs scripts/check-secrets.mjs on staged files; refuses the commit on a hit.
node "${join(root, 'scripts', 'check-secrets.mjs').replace(/\\/g, '/')}"
`

try {
  mkdirSync(join(gitDir, 'hooks'), { recursive: true })
  writeFileSync(hookPath, hook, { mode: 0o755 })
  if (process.platform !== 'win32') chmodSync(hookPath, 0o755)
  console.log(`[install-hooks] ✅ pre-commit hook installed: ${hookPath}`)
} catch (error) {
  console.error(`[install-hooks] ❌ failed to install hook: ${error}`)
  process.exit(1)
}
