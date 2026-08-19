# Security Policy

## Supported versions

We provide security updates for the latest published npm version. Older
versions receive fixes only when a security issue is backported explicitly.

| Version | Supported |
|---|---|
| latest (0.3.x) | ✅ |
| < 0.3.0 | ❌ |

## How keys are stored

- Your Amap key lives in **`~/.dsh-map-tools/config.json`** with file mode
  **0600** (owner read/write only).
- The key is **never echoed** to the settings page or to logs. The host only
  reports a boolean (`hasAmapKey`) to the frontend card.
- The settings card route (`/dsh-map-tools/config`) answers **same-origin
  loopback only** — cross-origin and non-loopback requests are refused with
  403.
- Keys are stored per-machine (never synced through DSH settings documents or
  any cloud store).

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
