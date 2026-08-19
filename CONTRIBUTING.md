# Contributing

Thanks for your interest in dsh-map-tools!

## Development setup

```sh
pnpm install
pnpm run build                # tsc → lib/
pnpm test                     # vitest unit tests (mocked network)
node scripts/smoke.mjs        # smoke: 7 tools register
node scripts/integration.mjs  # integration: real OSRM/Nominatim requests
node scripts/amap-e2e.mjs     # Amap e2e (set AMAP_API_KEY)
```

## Adding or changing a tool

1. Implement the provider call in `src/clients/` (Amap / OSRM / Nominatim).
2. Register the tool in `src/tools/` with `defineTool` — every tool must declare
   a canonical `output.schema` and a model-facing `output.render`.
3. Add unit tests under `tests/` (mock `fetch`; never hit the network in unit tests).
4. Update `README.md` / `README.en.md` tool tables and `CHANGELOG.md`.

## Conventions

- Zero-key default: OSM/OSRM/Nominatim must always work without an API key.
- Amap is the upgrade path: `provider: auto` uses Amap only when `amapKey` is set.
- Every user-facing error must be actionable (include the fix or the apply link),
  especially on CN networks where free providers may be unreachable.
- Keep `amapKey` secret-role in the settings schema (never logged, never on the wire).

## License

MIT — see [LICENSE](LICENSE).
