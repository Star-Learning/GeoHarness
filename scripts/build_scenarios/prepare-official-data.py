"""Normalize downloaded NYC Open Data snapshots for deterministic Scenario packaging."""

from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path
from typing import Any

import geopandas as gpd
import numpy as np
import pandas as pd
from shapely.geometry import GeometryCollection, MultiPolygon, Polygon, box
from shapely.ops import unary_union


ROOT = Path(__file__).resolve().parents[2]
SOURCE_ROOT = ROOT / "data" / "official-sources" / "nyc"
DERIVED_ROOT = SOURCE_ROOT / "derived"
METRIC_CRS = "EPSG:32618"
DISPLAY_CRS = "EPSG:4326"
SNAPSHOT_DATE = "2026-08-27"
TERMS_URL = "https://opendata.cityofnewyork.us/overview/#termsofuse"
BUILDING_SAMPLE_SIZE = 360

SOURCE_SPECS: dict[str, dict[str, Any]] = {
    "building.geojson": {
        "dataset_id": "5zhs-2jue",
        "dataset": "BUILDING",
        "publisher": "NYC Office of Technology and Innovation (OTI)",
        "dataset_url": "https://data.cityofnewyork.us/d/5zhs-2jue",
        "expected_count": 2622,
        "sha256": "3CB38B0627A5ECEC0C2E8837B65870C0F748379D7665FA6561DDA900C0149102",
    },
    "centerline.geojson": {
        "dataset_id": "inkn-q76z",
        "dataset": "Centerline",
        "publisher": "NYC Office of Technology and Innovation (OTI)",
        "dataset_url": "https://data.cityofnewyork.us/d/inkn-q76z",
        "expected_count": 293,
        "sha256": "830FAEF8923E0B71A4477B9A62FE788BB1AC12E101A61E4F6756C3EC5CD3C13D",
    },
    "hydrography.geojson": {
        "dataset_id": "pjs3-c3z5",
        "dataset": "NYC Planimetric Database: Hydrography",
        "publisher": "NYC Office of Technology and Innovation (OTI)",
        "dataset_url": "https://data.cityofnewyork.us/d/pjs3-c3z5",
        "expected_count": 6,
        "sha256": "05BD5932D0FAD76B83E9798CEB34DE104FDD2B5866B78B520B3D1BAAEE07DE59",
    },
    "community-districts.geojson": {
        "dataset_id": "5crt-au7u",
        "dataset": "Community Districts",
        "publisher": "NYC Department of City Planning (DCP)",
        "dataset_url": "https://data.cityofnewyork.us/d/5crt-au7u",
        "expected_count": 3,
        "sha256": "E29D52165A4A5115A6A5E8768F6F04C7473D3EE44545EB247870E0882D051DE2",
    },
    "community-districts-water.geojson": {
        "dataset_id": "6ak9-vek3",
        "dataset": "Community Districts (Water areas included)",
        "publisher": "NYC Department of City Planning (DCP)",
        "dataset_url": "https://data.cityofnewyork.us/d/6ak9-vek3",
        "expected_count": 3,
        "sha256": "B5268BC156747AC287C304E92A4CD31511EFD4A3BA0B169BC850E0935C3734BF",
    },
}


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest().upper()


def read_sources() -> dict[str, gpd.GeoDataFrame]:
    sources: dict[str, gpd.GeoDataFrame] = {}
    for filename, spec in SOURCE_SPECS.items():
        path = SOURCE_ROOT / filename
        if not path.is_file():
            raise FileNotFoundError(f"Missing official source snapshot: {path}")
        actual_hash = sha256(path)
        if actual_hash != spec["sha256"]:
            raise ValueError(f"{filename}: source hash changed; audit and update expected statistics first")
        frame = gpd.read_file(path)
        if len(frame) != spec["expected_count"]:
            raise ValueError(f"{filename}: expected {spec['expected_count']} features, found {len(frame)}")
        sources[filename] = frame.to_crs(DISPLAY_CRS)
    return sources


def integer(value: Any) -> int | None:
    if value is None or pd.isna(value):
        return None
    return int(float(value))


def number(value: Any, digits: int = 6) -> float | None:
    if value is None or pd.isna(value):
        return None
    return round(float(value), digits)


def text(value: Any) -> str | None:
    if value is None or pd.isna(value):
        return None
    current = str(value).strip()
    return current or None


def polygonal(geometry: Any) -> MultiPolygon:
    if geometry.is_empty:
        raise ValueError("Official water derivation produced an empty geometry")
    if isinstance(geometry, Polygon):
        return MultiPolygon([geometry])
    if isinstance(geometry, MultiPolygon):
        return geometry
    if isinstance(geometry, GeometryCollection):
        polygons = [part for part in geometry.geoms if isinstance(part, (Polygon, MultiPolygon))]
        merged = unary_union(polygons)
        return polygonal(merged)
    raise ValueError(f"Expected polygonal geometry, received {geometry.geom_type}")


def collection_metadata(source_files: list[str], processing: str) -> dict[str, Any]:
    specs = [SOURCE_SPECS[name] for name in source_files]
    return {
        "fixture": False,
        "official_data": True,
        "region": "Lower Manhattan, New York City",
        "coordinate_reference_system": "OGC:CRS84",
        "source": "NYC Open Data official snapshot",
        "publishers": sorted({spec["publisher"] for spec in specs}),
        "dataset_ids": [spec["dataset_id"] for spec in specs],
        "dataset_urls": [spec["dataset_url"] for spec in specs],
        "source_files": source_files,
        "snapshot_date": SNAPSHOT_DATE,
        "terms": "NYC Open Data Terms of Use",
        "terms_url": TERMS_URL,
        "processing": processing,
    }


def to_collection(
    name: str,
    frame: gpd.GeoDataFrame,
    *,
    source_files: list[str],
    processing: str,
) -> dict[str, Any]:
    display = frame.to_crs(DISPLAY_CRS)
    feature_ids = display.pop("_feature_id").astype(str).tolist()
    payload = json.loads(display.to_json(drop_id=True, na="null", default=str))
    for feature, feature_id in zip(payload["features"], feature_ids, strict=True):
        feature["id"] = feature_id
    payload["name"] = name
    payload["crs"] = {
        "type": "name",
        "properties": {"name": "urn:ogc:def:crs:OGC:1.3:CRS84"},
    }
    payload["metadata"] = collection_metadata(source_files, processing)
    return payload


def normalize_buildings(source: gpd.GeoDataFrame) -> gpd.GeoDataFrame:
    metric = source.to_crs(METRIC_CRS)
    centers = metric.geometry.centroid
    order = np.lexsort((centers.x.to_numpy(), centers.y.to_numpy()))
    positions = np.unique(np.linspace(0, len(order) - 1, BUILDING_SAMPLE_SIZE, dtype=int))
    selected = source.iloc[order[positions]].copy().sort_values("objectid").reset_index(drop=True)
    rows: list[dict[str, Any]] = []
    for _, row in selected.iterrows():
        object_id = integer(row["objectid"])
        feature_code = integer(row.get("feature_code"))
        building_name = text(row.get("name"))
        bin_value = text(row.get("bin"))
        rows.append({
            "_feature_id": f"nyc-building-{object_id}",
            "building_id": f"nyc-building-{object_id}",
            "object_id": object_id,
            "bin": bin_value,
            "base_bbl": text(row.get("base_bbl")),
            "name": building_name if building_name not in {None, "unset"} else f"NYC Building {bin_value or object_id}",
            "use": f"feature_code_{feature_code}" if feature_code is not None else "feature_code_unknown",
            "feature_code": feature_code,
            "construction_year": integer(row.get("construction_year")),
            "height_roof_ft": number(row.get("height_roof")),
            "height_m": number(float(row["height_roof"]) * 0.3048) if not pd.isna(row.get("height_roof")) else None,
            "ground_elevation_ft": number(row.get("ground_elevation")),
            "geometry_source": text(row.get("geom_source")),
            "last_edited_date": text(row.get("last_edited_date")),
        })
    return gpd.GeoDataFrame(rows, geometry=selected.geometry.to_list(), crs=selected.crs)


def normalize_roads(source: gpd.GeoDataFrame) -> gpd.GeoDataFrame:
    rows: list[dict[str, Any]] = []
    for _, row in source.sort_values("objectid").iterrows():
        object_id = integer(row["objectid"])
        street_name = text(row.get("street_name")) or "UNNAMED"
        rows.append({
            "_feature_id": f"nyc-centerline-{object_id}",
            "road_id": f"nyc-centerline-{object_id}",
            "object_id": object_id,
            "physical_id": integer(row.get("physicalid")),
            "name": text(row.get("full_street_name")) or street_name.title(),
            "street_name": street_name,
            "road_class": "major" if street_name.upper() == "BROADWAY" else "other_four_plus_lane",
            "rw_type": integer(row.get("rw_type")),
            "segment_type": text(row.get("segment_type")),
            "posted_speed": integer(row.get("posted_speed")),
            "number_total_lanes": integer(row.get("number_total_lanes")),
            "number_travel_lanes": integer(row.get("number_travel_lanes")),
            "status": text(row.get("status")),
            "modified_date": text(row.get("modified_date")),
        })
    return gpd.GeoDataFrame(rows, geometry=source.sort_values("objectid").geometry.to_list(), crs=source.crs)


def normalize_districts(source: gpd.GeoDataFrame) -> gpd.GeoDataFrame:
    ordered = source.sort_values("boro_cd").reset_index(drop=True)
    rows = []
    for _, row in ordered.iterrows():
        code = integer(row["boro_cd"])
        rows.append({
            "_feature_id": f"nyc-community-district-{code}",
            "district_id": f"MN-{code}",
            "boro_cd": code,
            "name": f"Manhattan Community District {code - 100}",
        })
    return gpd.GeoDataFrame(rows, geometry=ordered.geometry.to_list(), crs=ordered.crs)


def derive_rivers(land: gpd.GeoDataFrame, water_included: gpd.GeoDataFrame) -> gpd.GeoDataFrame:
    land_metric = land.to_crs(METRIC_CRS)
    included_metric = water_included.to_crs(METRIC_CRS)
    clip = gpd.GeoSeries([box(-74.02, 40.70, -73.985, 40.725)], crs=DISPLAY_CRS).to_crs(METRIC_CRS).iloc[0]
    west = gpd.GeoSeries([box(-74.03, 40.69, -74.001, 40.75)], crs=DISPLAY_CRS).to_crs(METRIC_CRS).iloc[0]
    east = gpd.GeoSeries([box(-74.001, 40.69, -73.96, 40.75)], crs=DISPLAY_CRS).to_crs(METRIC_CRS).iloc[0]
    official_water = included_metric.geometry.union_all().difference(land_metric.geometry.union_all()).intersection(clip)
    geometries = [polygonal(official_water.intersection(west)), polygonal(official_water.intersection(east))]
    return gpd.GeoDataFrame(
        [
            {"_feature_id": "hudson-river-official-water", "river_id": "hudson-river", "name": "Hudson River"},
            {"_feature_id": "east-river-official-water", "river_id": "east-river", "name": "East River"},
        ],
        geometry=geometries,
        crs=METRIC_CRS,
    ).to_crs(DISPLAY_CRS)


def district_counts(frame: gpd.GeoDataFrame, districts: gpd.GeoDataFrame) -> dict[str, int]:
    metric = frame.to_crs(METRIC_CRS)
    regions = districts.to_crs(METRIC_CRS)
    joined = gpd.sjoin(metric, regions[["district_id", "geometry"]], how="left", predicate="within")
    counts = joined["district_id"].value_counts().to_dict()
    return {district_id: int(counts.get(district_id, 0)) for district_id in districts["district_id"]}


def build_payloads(sources: dict[str, gpd.GeoDataFrame]) -> tuple[dict[str, dict[str, Any]], dict[str, Any]]:
    buildings = normalize_buildings(sources["building.geojson"])
    roads = normalize_roads(sources["centerline.geojson"])
    districts = normalize_districts(sources["community-districts.geojson"])
    rivers = derive_rivers(
        sources["community-districts.geojson"],
        sources["community-districts-water.geojson"],
    )

    building_metric = buildings.to_crs(METRIC_CRS)
    major_roads = roads[roads["road_class"] == "major"].to_crs(METRIC_CRS)
    river_metric = rivers.to_crs(METRIC_CRS)
    road_distances = building_metric.geometry.distance(major_roads.geometry.union_all())
    river_distances = building_metric.geometry.distance(river_metric.geometry.union_all())
    accessible = buildings.loc[(road_distances <= 300).to_numpy()].copy()

    statistics = {
        "building_count": len(buildings),
        "building_geometry_type": "MultiPolygon",
        "invalid_building_geometry_count": int((~buildings.geometry.is_valid).sum()),
        "missing_height_m_count": int(buildings["height_m"].isna().sum()),
        "missing_construction_year_count": int(buildings["construction_year"].isna().sum()),
        "major_road_feature_count": len(major_roads),
        "river_500m_candidate_count": int((river_distances <= 500).sum()),
        "district_counts": district_counts(buildings, districts),
        "road_300m_candidate_count": int((road_distances <= 300).sum()),
        "road_300m_district_counts": district_counts(accessible, districts),
        "road_200m_candidate_count": int((road_distances <= 200).sum()),
        "road_500m_candidate_count": int((road_distances <= 500).sum()),
        "road_1000m_candidate_count": int((road_distances <= 1000).sum()),
        "multi_constraint_candidate_count": int(((road_distances <= 300) & (river_distances >= 800)).sum()),
    }
    collections = {
        "buildings": to_collection(
            "buildings", buildings, source_files=["building.geojson"],
            processing="Fixed bbox source; 360-feature spatially uniform systematic sample; official fields normalized; geometry unchanged.",
        ),
        "roads": to_collection(
            "roads", roads, source_files=["centerline.geojson"],
            processing="Fixed bbox and number_total_lanes >= 4 query; Broadway segments labelled major for bounded Demo filtering; geometry unchanged.",
        ),
        "districts": to_collection(
            "districts", districts, source_files=["community-districts.geojson"],
            processing="Official Manhattan Community Districts 101–103; fields normalized; geometry unchanged.",
        ),
        "rivers": to_collection(
            "rivers", rivers,
            source_files=["community-districts.geojson", "community-districts-water.geojson"],
            processing="Official water-included district union minus land-only district union; clipped to Demo extent and split west/east as Hudson River and East River.",
        ),
    }
    return collections, statistics


def serialized(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False, indent=2, allow_nan=False) + "\n"


def persist(path: Path, contents: str, *, check: bool) -> None:
    path = path.resolve()
    if not path.is_relative_to(DERIVED_ROOT.resolve()):
        raise ValueError(f"Refusing derived output outside source directory: {path}")
    if check:
        if not path.is_file() or path.read_text(encoding="utf-8") != contents:
            raise ValueError(f"Missing or stale official derived data: {path.relative_to(ROOT)}")
        return
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(contents, encoding="utf-8")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()
    collections, statistics = build_payloads(read_sources())
    for name, collection in collections.items():
        persist(DERIVED_ROOT / f"{name}.geojson", serialized(collection), check=args.check)
    persist(DERIVED_ROOT / "statistics.json", serialized(statistics), check=args.check)
    print(f"{'Verified' if args.check else 'Prepared'} official Scenario data: {statistics}")


if __name__ == "__main__":
    main()
