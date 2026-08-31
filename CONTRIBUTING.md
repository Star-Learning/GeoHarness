# Contributing to GeoHarness

Thanks for helping improve GeoHarness. The project accepts fixes and features that preserve its core contract: user goals drive Native Harness Agent tool calls, authoritative GIS computation stays in the Python backend, and important results remain verifiable through Layers and the map.

## Development setup

Requirements:

- Node.js `^22.19.0` or `>=24.0.0`;
- pnpm `11.22.0`;
- Python `>=3.11` with GEOS/PROJ-compatible wheels;
- a readable DeepSeek Harness checkout only when inspecting or upgrading upstream integration.

```sh
pnpm install
python -m pip install -e "./backend/geo-service[test]"
pnpm test
pnpm run check:media
```

## Change rules

1. Do not copy DeepSeek Harness source into this repository or patch the upstream checkout as a long-term solution.
2. Production UI must keep native Harness project/session navigation, settings, model selection and composer ownership.
3. Production Agent execution must not route through deterministic Scenario fixtures or hidden expected results.
4. GIS statistics and map layers must come from real Tool Results and the canonical Layer Registry.
5. Every behavior change needs an automated test; spatial correctness changes need an independent GeoPandas/Shapely oracle when practical.
6. Scenario-specific data, prompts and media stay in `examples/scenarios/<id>/`.
7. Generated MP4 files, local workspaces, credentials, caches and provider logs must not be committed.

## Pull requests

Before opening a pull request:

```sh
pnpm run check:docs
pnpm run typecheck
pnpm test
pnpm run check:media
git diff --check
```

Describe the user goal, implementation boundary, tests, GIS data provenance and any DeepSeek Harness API assumption. UI changes should include a screenshot or short GIF; Geo Tool changes should include their input/output and CRS behavior.

## Adding datasets, tools and scenarios

- Dataset catalogs describe available data, not a prescribed analysis plan.
- Tools use bounded schemas, structured `ToolResult`, timeout/cancellation and canonical Layer IDs.
- A Scenario is a deterministic regression and Demo package, not the production planner.
- Official data snapshots must record provider, source URL, date, license/terms, processing and stable verification facts.
