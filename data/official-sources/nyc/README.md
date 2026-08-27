# NYC official source snapshots

This directory contains the downloaded source snapshots used to build GeoHarness Scenarios
01–06. They are not synthetic fixtures and are not copied from DeepSeek Harness.

| File | NYC Open Data dataset | Audited features | SHA-256 |
| --- | --- | ---: | --- |
| `building.geojson` | BUILDING (`5zhs-2jue`) | 2,622 | `3CB38B0627A5ECEC0C2E8837B65870C0F748379D7665FA6561DDA900C0149102` |
| `centerline.geojson` | Centerline (`inkn-q76z`) | 293 | `830FAEF8923E0B71A4477B9A62FE788BB1AC12E101A61E4F6756C3EC5CD3C13D` |
| `hydrography.geojson` | NYC Planimetric Database: Hydrography (`pjs3-c3z5`) | 6 | `05BD5932D0FAD76B83E9798CEB34DE104FDD2B5866B78B520B3D1BAAEE07DE59` |
| `community-districts.geojson` | Community Districts (`5crt-au7u`) | 3 | `E29D52165A4A5115A6A5E8768F6F04C7473D3EE44545EB247870E0882D051DE2` |
| `community-districts-water.geojson` | Community Districts, water included (`6ak9-vek3`) | 3 | `B5268BC156747AC287C304E92A4CD31511EFD4A3BA0B169BC850E0935C3734BF` |

Snapshot date: `2026-08-27`. All files retain the official Socrata response geometry. Building and
Centerline downloads use a fixed Lower Manhattan bounding box. Community Districts are limited to
Manhattan codes 101–103. The river layer used by the Scenarios is derived from the official
water-included boundaries minus the land-only boundaries, then split into the Hudson and East
River sides; that processing is performed reproducibly by the Scenario builder.

Re-download with:

```powershell
./scripts/download-nyc-official-sources.ps1
```

NYC Open Data can change. A refreshed snapshot must be reviewed, its hashes and statistics
updated, and all independent GIS regressions rerun before commit. Terms:
[NYC Open Data Terms of Use](https://opendata.cityofnewyork.us/overview/#termsofuse).
