# Changelog

All notable changes to GeoHarness will be documented in this file. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project intends to use [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added

- Structured Result Center feature-flow and numeric visualizations, lineage-based Layer groups, a dynamic map legend, bounded CSV field preview and presentation mode.
- Map-linked attribute filtering/sorting, session-local Layer color/line-width controls and UI visualization regression tests.
- A real NYC firehouse-coverage vector-analysis Topic with an independent GeoPandas oracle, audited official data, a regression test and reproducible 1080p60 recording metadata.
- A zero-key Esri World Imagery satellite preview with Web Mercator alignment, viewport-bounded tile loading and offline grid/plain fallbacks.
- Privacy-bounded browser location for fresh empty Sessions, including an accuracy-aware marker and viewport.
- A consent-gated `inspect_satellite_view` Tool and Topic that acquire bounded Esri RGB tiles, produce a real
  visual-screening Overlay and expose structured pixel-share statistics in Map, Tool Trace and Result Center.
- Session-persistent Raster Overlay Layers with visibility, opacity slider, ±10% controls and shared Map/Layer counts.
- Named-place satellite inspection through bounded Esri World Geocoding candidates, including automatic map-view changes
  and explicit non-administrative-boundary disclosure.
- Auditable named-place Polygon/MultiPolygon clipping through OpenStreetMap Nominatim, with boundary provenance,
  in-boundary pixel accounting and transparent out-of-boundary Raster Overlay pixels.
- Safe structured Markdown rendering for Agent Stream headings, lists, emphasis, code, quotes, links and tables.
- Concurrent read-only imagery target snapshots that expose resolved bounds, boundary and bounded inspection stages
  before the slower satellite Tool finishes.

### Changed

- Canonical Workspace restoration now runs independently from new Session events and restores the map before Run/import metadata after a service restart.
- Opening a Layer data workbench collapses the Layer drawer and reallocates width from the Agent column for a denser attribute table.
- The local firehouse-coverage recording removes non-GeoHarness foreground intervals and accelerates provider waits while preserving the real Agent/Tool order; generated MP4 remains outside Git history.
- Map display coordinates now use Web Mercator so canonical GeoJSON overlays align with online raster tiles while GIS Tools keep their existing canonical CRS workflow.
- The workspace now gives more width to the map, keeps restored Layer/Legend overlays collapsed, applies role-aware vector transparency over imagery, and refines Agent Workspace hierarchy without replacing the native composer.
- Fresh empty Sessions now automatically request location for both first-use and previously granted permission, wait up to 30 seconds for desktop positioning, and yield to canonical analysis Layer bounds when data arrives.
- Agent recording frames now retain the Browser screenshot's real PNG/JPEG byte format and the encoder accepts either
  format, preventing JPEG bytes from being mislabeled as `.png`.
- Named-place map transitions now use a continuous Mercator camera with overlapping zoom-out, travel and zoom-in,
  logarithmic scale interpolation, distance-aware timing and a smooth final administrative-boundary adjustment.
- Recent satellite detail tiles remain geographically registered across zoom levels and fade in after loading, with
  bounded retention and a stable global overview underneath.
- Map/Agent layout now reserves the native composer's measured height, renders larger structured reports and keeps
  presentation-mode focus from scrolling the page header out of view.
- Named-place inspection now reveals the boundary and a stage progress indicator after arrival, then replaces the
  loading state with the final Raster Overlay and statistics only when the Tool result is available.

### Fixed

- Completed historical Sessions no longer remain on an empty map until another conversation event is appended.
- Location failures now distinguish browser denial, system unavailability and timeout, with a Windows privacy-setting hint and manual retry.
- Native Run projection now supports the current Harness `turn/start → user/message` event order as well as the
  older inverse order, preventing missing first Runs, stale Prompt binding and an empty Result Center.
- Named-place raster analysis no longer leaves the map labelled as the user's current location or displays an unrelated
  computer-location marker after the analysis view changes.
- Administrative named-place analysis no longer treats a rectangular geocoder extent as the target region; imagery,
  classification statistics and Overlay alpha are clipped by the available OSM boundary geometry.
- Completed Agent responses no longer expose Markdown source markers or pipe-table rows as plain text.
- Canonical resource refresh no longer blocks native Agent history and live imagery progress behind a running Tool.
- Map flights preserve the actual panned/zoomed departure view, and arrival feedback no longer shifts its position.

## [1.0.0] - 2026-08-31

### Added

- GIS Agent Platform v1.0 development plan, acceptance matrix and phased delivery gates.
- MIT license, contribution guide, security policy and cross-platform CI baseline.
- Automated local Markdown link validation.
- Versioned, atomic Session Workspace manifests with canonical Layer, export and run asset indexes.
- Provider-restart recovery, Session isolation and bounded Workspace reset validation.
- Session-scoped browser import for GeoJSON, Shapefile ZIP, GeoPackage and CSV longitude/latitude data.
- Canonical import asset indexing, format-aware UI progress and real user-data Agent Tool E2E coverage.
- Canonical Layer metadata/quality inspection, bounded attribute previews and map/table selection linking.
- Persistent Layer display preferences plus lineage-safe rename and removal RPCs.
- Versioned Native Harness Run Manifests projected from canonical Session events without persisting reasoning.
- Reloadable run comparison for executed Tools, reused input Layers, new outputs and classified errors.
- Real same-Session revision E2E coverage for distance, predicate, attribute value, export format and appended spatial conditions.
- Authoritative Result Center with final answer, Tool counts, terminal Layers, structured statistics, provenance, CRS, units and warnings.
- Indexed 20 MB-bounded download RPC for GeoJSON, GeoPackage, CSV and reasoning-free Run Manifest assets with SHA256 metadata.
- Versioned JSON Schema contracts for Dataset catalogs and Tool manifests, plus a generated catalog reference.
- Catalog-driven registration for all 13 built-in Harness Tools and a tested third-party fixture executor path.
- Bounded Layer/GeoJSON pagination, persistent Tool idempotency records and redacted structured diagnostics export.
- Provider-level timeout/Abort/process-exit diagnostics with real subprocess lifecycle tests.

### Changed

- Development documentation is separated into planning, architecture, testing and media sections.
- Dataset and Scenario selection no longer changes the Session Workspace path or depends on Provider memory.
- Layer registration now uses temporary GeoPackage snapshots and rollback-safe manifest persistence.
- Agent workspace projection now restores per-Session Layer visibility and opacity from `workspace.json`.
- Geo provider writes for one Session Workspace are serialized while independent Sessions remain concurrent.
- Dataset discovery and `list_layers` enums now come from validated deployment catalogs instead of an inline Host list.
- Map projection now validates paged GeoJSON totals under a 3 MB workspace budget instead of copying every full Layer.
- Session directory mapping adds a hash suffix for collision-shaped valid IDs while preserving existing safe IDs.
- GeoHarness Agent workspace now uses clearer semantic map colors and synchronized result focus states.
- Seven Scenario video prompts and reproducible 1080p recording/encoding scripts are tracked without committing generated MP4 files.

### Fixed

- Documentation and tests now match the native Harness AppFrame, Session, settings, model selection and composer integration.
- Media tests reflect the current multi-keyframe Scenario GIFs and concise root README.
- Unsafe upload names, oversized files, ZIP traversal/symlinks/bombs and incomplete imports are rejected without residue.
- Python runner stdin/stdout now use explicit UTF-8 so Chinese goals, answers and metadata survive Windows system code pages.
- Concurrent Run projection and export no longer allow an older Workspace snapshot to overwrite a newer asset index.
- Failed Tool, Layer-write, import and export boundaries remove partial files and newly registered Layers.
- Duplicate Tool delivery replays an identical result without duplicating Layers; conflicting request reuse fails closed.
- Clean-clone CI no longer requires an adjacent DeepSeek Harness source checkout; source-level audits run when available, while exact peers and the published CLI lifecycle remain mandatory everywhere.
- Windows clean-profile smoke invokes pnpm through Node's `npm_execpath`, avoiding direct `.cmd` spawning differences.
- Official Scenario freshness compares source hashes, exact attributes/statistics and tolerance-bounded geometry instead of platform-specific serialized overlay bytes.
