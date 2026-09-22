/**
 * Print the GitHub Release body for one version.
 *
 * The changelog is the honest source for this. It is written before the release,
 * it says *why* a change was made, and it is what a reader is pointed at.
 * GitHub's generated notes would be a second, thinner account of the same release.
 *
 * Used by the release workflow after npm has accepted the publish, and runnable
 * by hand:
 *
 *   node scripts/release-notes.mjs 0.7.0
 *
 * It exits non-zero when CHANGELOG.md has no section for the version, because an
 * empty release body is worse than a red workflow — nobody sees it fail.
 */

import { readFileSync } from 'node:fs'

const version = process.argv[2]

if (version === undefined || version === '') {
  console.error('usage: node scripts/release-notes.mjs <version>   (for example: 0.7.0)')
  process.exit(2)
}

/** Read a file from the repository root, as UTF-8. */
function read(name) {
  return readFileSync(new URL(`../${name}`, import.meta.url), 'utf8')
}

/**
 * Find one version's section.
 *
 * The section ends at the next level-2 heading, which is what keeps the following
 * releases out of the body.
 *
 * @param changelog - the whole file.
 * @param wanted - the version, without a leading `v`.
 * @returns the heading line and the body, or undefined when the file has none.
 */
function sectionOf(changelog, wanted) {
  const escaped = wanted.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const pattern = new RegExp(`^## \\[${escaped}\\]`)
  const lines = changelog.split('\n')
  const start = lines.findIndex((line) => pattern.test(line))
  if (start < 0) return undefined

  let end = lines.length
  for (let at = start + 1; at < lines.length; at += 1) {
    if (lines[at].startsWith('## ')) {
      end = at
      break
    }
  }
  return { heading: lines[start].trim(), body: lines.slice(start + 1, end).join('\n').trim() }
}

const section = sectionOf(read('CHANGELOG.md'), version)
if (section === undefined) {
  console.error(`CHANGELOG.md has no "## [${version}]" section — refusing to write an empty release body`)
  process.exit(1)
}

const manifest = JSON.parse(read('package.json'))
// `git+https://github.com/owner/repo.git` is the form npm writes; a release body
// needs the form a browser can open.
const base = String(manifest.repository.url).replace(/^git\+/, '').replace(/\.git$/, '')

process.stdout.write([
  section.body,
  '---',
  `\`npm i ${manifest.name}@${version}\` · [CHANGELOG.md](${base}/blob/master/CHANGELOG.md)`,
  '',
].join('\n\n'))
