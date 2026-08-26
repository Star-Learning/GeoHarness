# GeoHarness

GeoHarness is an independent Agentic GIS workspace built as an extension of DeepSeek Harness. The repository is currently at Phase 0: the Harness integration baseline.

The current code intentionally contains no GIS backend, map implementation, scenario packages, or production Geo Tools. See [`docs/harness-integration.md`](docs/harness-integration.md) for the verified integration model and [`PROGRESS.md`](PROGRESS.md) for the completed Phase 0 scope.

## Phase 0 verification

```sh
pnpm test
pnpm run verify:phase0
```

The minimal installable bundle lives in [`bundle/geoharness-bundle`](bundle/geoharness-bundle). It adds only a browser-side integration marker and diagnostic view through existing Harness Slots.
