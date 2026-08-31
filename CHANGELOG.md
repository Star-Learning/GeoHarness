# Changelog

All notable changes to GeoHarness will be documented in this file. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project intends to use [Semantic Versioning](https://semver.org/).

## [Unreleased]

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
