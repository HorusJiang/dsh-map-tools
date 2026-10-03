# Security Policy

## Supported versions

We provide security updates for the latest published npm version. Older
versions receive fixes only when a security issue is backported explicitly.

| Version | Supported |
|---|---|
| latest (0.7.x) | ✅ |
| < 0.7.0 | ❌ |

The row above names the line, not a patch release: whatever `package.json` currently
declares is the supported one. It has drifted before (it read `0.6.x` while the package
was at 0.7.3), so treat `package.json` as the source of truth if they ever disagree.

## How keys are stored

- Your Amap key lives in **`~/.dsh-map-tools/config.json`**, outside any git working
  tree.
- **Permissions.** The file is created with mode `0600` and re-tightened to owner-only on
  every save. On POSIX that is `chmod 0600`; on **Windows** Node ignores POSIX mode bits
  entirely, so the plugin instead runs
  `icacls <file> /inheritance:r /grant:r "<user>:F"` to drop inherited ACEs. This is
  best-effort: a filesystem that cannot express ownership (a FAT volume, some network
  shares) is left as the platform makes it rather than failing the save. Check it
  yourself on Windows with `icacls "%USERPROFILE%\.dsh-map-tools\config.json"` — you
  should see only your own account and the OS service accounts.
- The key is **never echoed** to the settings page or to logs. The host only
  reports a boolean (`hasAmapKey`) to the frontend card.
- The settings card route (`/dsh-map-tools/config`) answers **same-origin
  loopback only** — cross-origin and non-loopback requests are refused with
  403.
- Keys are stored per-machine (never synced through DSH settings documents or
  any cloud store).

## Leak protection (defense in depth)

Four layers keep keys out of the repository:

1. **Storage location**: keys live in `~/.dsh-map-tools/config.json`, outside
   any git working tree by design.
2. **`.gitignore`**: `config.json`, `.dsh-map-tools/`, `.env` and key files are
   ignored — even a copy dropped into the workdir is never tracked.
3. **Pre-commit hook**: `scripts/check-secrets.mjs` scans staged files for
   key-shaped values (e.g. `"amapKey":"<32-hex>"`) and **refuses the commit**
   on a hit. The hook installs via `pnpm hooks`
   (`scripts/install-hooks.mjs`, contributors only — never for npm consumers,
   and the published package carries no build script). Run manually with
   `pnpm check:secrets`.
4. **CI**: the same script runs on every push and pull request as
   `node scripts/check-secrets.mjs --all`, which reads the tracked files instead of the
   staging area. Layer 3 only protects a contributor who has installed the hook and who
   did not pass `--no-verify`; layer 4 is the one that cannot be skipped locally. It is
   also the reason the script has an `--all` mode at all — in CI there is no staging
   area, so the pre-commit mode would have scanned nothing and reported "clean".

## Reporting a vulnerability

If you find a security issue — especially anything that could leak the stored
Amap key — please **do not open a public issue**. Report it privately:

- Open a [private security advisory](https://github.com/HorusJiang/dsh-map-tools/security/advisories/new)
- Or email the maintainer via the address on the GitHub profile

Please include:

- A description of the issue and its impact
- Steps to reproduce (as minimal as possible)
- Affected version(s)

We aim to acknowledge reports within 3 business days and to ship a fix in the
next patch release.

## Out of scope

- Leaked keys due to the user sharing their own `~/.dsh-map-tools/config.json`
  or pasting the key into an untrusted channel.
- Free third-party sources (OSRM / Photon / Nominatim) being rate-limited or
  unreachable — these are availability issues, not security issues.
- The Amap/OSM provider's own platform security.
