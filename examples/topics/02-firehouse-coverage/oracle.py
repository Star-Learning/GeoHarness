"""Independent GeoPandas/Shapely oracle for the firehouse coverage Topic."""

from __future__ import annotations

import json
from pathlib import Path

import geopandas as gpd


ROOT = Path(__file__).resolve().parents[3]
BUILDINGS = ROOT / "examples/scenarios/01-building-data-inspection/data/buildings.geojson"
FIREHOUSES = ROOT / "examples/topics/02-firehouse-coverage/data/firehouses.geojson"
DISTRICTS = ROOT / "examples/scenarios/03-building-statistics-by-district/data/districts.geojson"
METRIC_CRS = "EPSG:32618"
COVERAGE_DISTANCE_M = 500.0


def calculate() -> dict[str, object]:
    buildings = gpd.read_file(BUILDINGS)
    firehouses = gpd.read_file(FIREHOUSES)
    districts = gpd.read_file(DISTRICTS)
    buildings_metric = buildings.to_crs(METRIC_CRS)
    firehouses_metric = firehouses.to_crs(METRIC_CRS)
    districts_metric = districts.to_crs(METRIC_CRS)

    coverage = firehouses_metric.geometry.buffer(COVERAGE_DISTANCE_M).union_all()
    uncovered = buildings_metric.loc[buildings_metric.geometry.disjoint(coverage)].copy()
    uncovered["area_m2"] = uncovered.geometry.area
    nearest = gpd.sjoin_nearest(
        uncovered,
        firehouses_metric[["facility_name", "geometry"]],
        how="left",
        distance_col="distance_m",
    ).drop(columns=["index_right"])
    joined = gpd.sjoin(
        nearest,
        districts_metric[["boro_cd", "geometry"]],
        how="left",
        predicate="within",
    )
    grouped = joined.groupby("boro_cd", dropna=False).agg(
        feature_count=("geometry", "size"),
        area_sum_m2=("area_m2", "sum"),
        mean_distance_m=("distance_m", "mean"),
        maximum_distance_m=("distance_m", "max"),
    )

    return {
        "input_buildings": len(buildings),
        "input_firehouses": len(firehouses),
        "coverage_distance_m": COVERAGE_DISTANCE_M,
        "uncovered_buildings": len(uncovered),
        "total_uncovered_area_m2": round(float(uncovered["area_m2"].sum()), 2),
        "minimum_distance_m": round(float(nearest["distance_m"].min()), 2),
        "maximum_distance_m": round(float(nearest["distance_m"].max()), 2),
        "mean_distance_m": round(float(nearest["distance_m"].mean()), 2),
        "districts": {
            str(int(index)): {
                "feature_count": int(row.feature_count),
                "area_sum_m2": round(float(row.area_sum_m2), 2),
                "mean_distance_m": round(float(row.mean_distance_m), 2),
                "maximum_distance_m": round(float(row.maximum_distance_m), 2),
            }
            for index, row in grouped.iterrows()
        },
        "building_ids": sorted(str(value) for value in uncovered["building_id"]),
        "checks": {
            "all_uncovered_are_beyond_500m": bool((nearest["distance_m"] > COVERAGE_DISTANCE_M).all()),
            "all_buildings_joined_to_a_district": bool(joined["boro_cd"].notna().all()),
            "all_source_geometries_valid": bool(
                buildings.geometry.is_valid.all()
                and firehouses.geometry.is_valid.all()
                and districts.geometry.is_valid.all()
            ),
        },
    }


if __name__ == "__main__":
    print(json.dumps(calculate(), ensure_ascii=False, sort_keys=True))
