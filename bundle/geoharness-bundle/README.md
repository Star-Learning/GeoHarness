# `@geoharness/harness-plugin`

This package is the GeoHarness integration layer for the inspected DeepSeek Harness release. It deliberately combines two roles in one installable npm package:

- `dsh.bundle` exports `cordis.patch.yml`, which inserts the package as a Cordis plugin row.
- `dsh.client` exposes the same package's `./client` browser entry to the Harness Web client module registry.

The host entry composes a Geo Service Definition, a cancellable local Python Provider and twelve
model-facing Geo Tool consumers using the inspected Harness `Service`, `defineTool`,
`SystemPrompt` and `ToolRuntime` APIs. The browser entry contributes the
`GeoHarness` conversation view and a lightweight brand overlay through
`ctx.slots.inject(...)`. Its generated client artifact embeds the six independent Scenario
packages, registers their vector layers, and renders an interactive SVG map with layer
visibility, opacity, zoom, pan, fit-bounds and feature inspection controls. Geo computation and
Harness Tool execution remain in the Host/Python layers rather than being hidden in the browser UI.

Each Scenario also ships a validated `task-graph.json`. The Host `TaskGraphRuntime` executes those
DAGs through `ctx.geo`, records pending/running/success/failed transitions, resolves canonical
Layer aliases, and preserves ordered transition history. The client shows the same embedded plan,
dependencies and declared outputs instead of maintaining a second hand-written Demo plan.

The default local provider launches one short-lived, cancellable Python runner per request and
isolates persistent GeoPackage workspaces by Harness session and Scenario. Override `python`,
`backendRoot`, `scenarioRoot` or `workspaceRoot` in the plugin row only when the repository layout
or runtime requires it. `GEOHARNESS_PYTHON` is the supported executable override.

For a local checkout, install the package into a Web-capable profile from the GeoHarness repository root:

```sh
dsh plugin --profile web add ./bundle/geoharness-bundle
dsh --profile web --dump-config
dsh --profile web --no-open
```

Use a dedicated profile only when it also includes the shipped Web bundle:

```sh
dsh plugin --profile geoharness add @deepseek-ai/dsh-web-app ./bundle/geoharness-bundle
dsh --profile geoharness --dump-config
dsh --profile geoharness --no-open
```

After installation, a spatial Agent run first calls `list_layers` with an official Scenario id;
the other tools consume only the returned Layer IDs. A repeatable host-boundary verification is:

```sh
pnpm run verify:phase5
```

The package pins the inspected Harness packages (`0.1.1-rc.2`) and their
current Cordis runtime (`4.0.1`) as exact peers. Re-run the integration review
before relaxing or advancing those versions.
