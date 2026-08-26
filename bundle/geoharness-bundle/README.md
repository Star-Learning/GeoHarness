# `@geoharness/harness-plugin`

This package is the GeoHarness integration layer for the inspected DeepSeek Harness release. It deliberately combines two roles in one installable npm package:

- `dsh.bundle` exports `cordis.patch.yml`, which inserts the package as a Cordis plugin row.
- `dsh.client` exposes the same package's `./client` browser entry to the Harness Web client module registry.

The host entry remains intentionally empty through Phase 3. The browser entry contributes the
`GeoHarness` conversation view and a lightweight brand overlay through
`ctx.slots.inject(...)`. Its generated client artifact embeds the six independent Scenario
packages, registers their vector layers, and renders an interactive SVG map with layer
visibility, opacity, zoom, pan, fit-bounds and feature inspection controls. Geo computation and
Harness Tool registration are added in later phases rather than hidden in the browser UI.

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

The package pins the inspected Harness packages (`0.1.1-rc.2`) and their
current Cordis runtime (`4.0.1`) as exact peers. Re-run the integration review
before relaxing or advancing those versions.
