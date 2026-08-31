# Changelog

All notable changes to GeoHarness will be documented in this file. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project intends to use [Semantic Versioning](https://semver.org/).

## [Unreleased]

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

### Changed

- Development documentation is separated into planning, architecture, testing and media sections.
- Dataset and Scenario selection no longer changes the Session Workspace path or depends on Provider memory.
- Layer registration now uses temporary GeoPackage snapshots and rollback-safe manifest persistence.
- Agent workspace projection now restores per-Session Layer visibility and opacity from `workspace.json`.
- GeoHarness Agent workspace now uses clearer semantic map colors and synchronized result focus states.
- Seven Scenario video prompts and reproducible 1080p recording/encoding scripts are tracked without committing generated MP4 files.

### Fixed

- Documentation and tests now match the native Harness AppFrame, Session, settings, model selection and composer integration.
- Media tests reflect the current multi-keyframe Scenario GIFs and concise root README.
- Unsafe upload names, oversized files, ZIP traversal/symlinks/bombs and incomplete imports are rejected without residue.
