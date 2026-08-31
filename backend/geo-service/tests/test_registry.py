from __future__ import annotations

import geopandas as gpd
import pandas as pd
import pytest
from shapely.geometry import Point, Polygon

from geoharness_geo import LayerRegistry


def test_registry_persists_canonical_layer_metadata_and_data(registry, register_scenario_layer):
    buildings = register_scenario_layer("01-building-data-inspection", "buildings")
    assert buildings.layer_id == "layer_0001"
    assert buildings.name == "buildings"
    assert buildings.geometry == "MultiPolygon"
    assert buildings.crs == "EPSG:4326"
    assert buildings.feature_count == 360
    assert buildings.source == "scenario"
    assert len(buildings.bbox) == 4

    restored = LayerRegistry(registry.root)
    assert restored.metadata(buildings.layer_id) == buildings
    assert len(restored.get(buildings.layer_id)) == 360
    geojson = restored.geojson(buildings.layer_id)
    assert geojson["type"] == "FeatureCollection"
    assert len(geojson["features"]) == 360


def test_registry_serializes_real_datetime_attributes_to_geojson(registry):
    frame = gpd.GeoDataFrame(
        {"last_edited_date": [pd.Timestamp("2026-08-23T13:15:06Z")]},
        geometry=[Point(-74.01, 40.71)],
        crs="EPSG:4326",
    )
    layer = registry.register("dated_features", frame, source="scenario")
    properties = registry.geojson(layer.layer_id)["features"][0]["properties"]
    assert properties["last_edited_date"] == "2026-08-23 13:15:06+00:00"


def test_registry_can_reset_only_its_resolved_workspace(registry):
    frame = gpd.GeoDataFrame(
        {"name": ["temporary"]},
        geometry=[Point(-74.01, 40.71)],
        crs="EPSG:4326",
    )
    layer = registry.register("temporary", frame, source="scenario")
    storage = registry.root / layer.storage_path
    assert storage.is_file()
    registry.clear()
    assert registry.list_layers() == []
    assert not storage.exists()
    assert not registry.registry_path.exists()


def test_layer_details_bounds_rows_fields_values_and_reports_geometry_quality(registry):
    columns = {
        "long_text": ["x" * 900, *[f"row-{index}" for index in range(1, 150)]],
        "nullable": [None, *range(1, 150)],
        **{f"field_{index:03d}": list(range(150)) for index in range(203)},
    }
    frame = gpd.GeoDataFrame(
        columns,
        geometry=[Point(-74.0 + index / 10_000, 40.7) for index in range(150)],
        crs="EPSG:4326",
    )
    layer = registry.register("wide layer", frame, source="upload")

    details = registry.details(layer.layer_id)

    assert details["schema_version"] == "1.0"
    assert details["preview"] == {
        "limit": 100,
        "returned_rows": 100,
        "total_rows": 150,
        "total_fields": 205,
        "fields_truncated": True,
        "rows_truncated": True,
    }
    assert len(details["fields"]) == 200
    assert len(details["rows"]) == 100
    assert details["rows"][0]["__row_index"] == 0
    assert details["rows"][99]["__row_index"] == 99
    assert details["rows"][0]["long_text"] == f"{'x' * 500}…"
    assert details["fields"][1]["null_count"] == 1
    assert any("200 of 205 fields" in warning for warning in details["warnings"])
    assert any("first 100 of 150 features" in warning for warning in details["warnings"])
    with pytest.raises(ValueError, match="between 1 and 100"):
        registry.details(layer.layer_id, limit=101)


def test_layer_details_reports_null_empty_and_invalid_geometry(registry):
    invalid = Polygon([(0, 0), (1, 1), (1, 0), (0, 1), (0, 0)])
    frame = gpd.GeoDataFrame(
        {"kind": ["valid", "null", "empty", "invalid"]},
        geometry=[Point(0, 0), None, Point(), invalid],
        crs="EPSG:4326",
    )
    layer = registry.register("geometry quality", frame, source="upload")

    details = registry.details(layer.layer_id)

    assert details["quality"] == {
        "missing_crs": False,
        "null_geometry_count": 1,
        "empty_geometry_count": 1,
        "invalid_geometry_count": 1,
    }
    assert any("1 null geometries" in warning for warning in details["warnings"])
    assert any("1 empty geometries" in warning for warning in details["warnings"])
    assert any("1 invalid geometries" in warning for warning in details["warnings"])


def test_registry_rename_restores_and_removal_preserves_lineage(registry):
    source = registry.register("source", gpd.GeoDataFrame(
        {"name": ["source"]}, geometry=[Point(0, 0)], crs="EPSG:4326",
    ), source="upload")
    derived = registry.register("derived", gpd.GeoDataFrame(
        {"name": ["derived"]}, geometry=[Point(0, 0)], crs="EPSG:4326",
    ), source="derived", generated_by="copy", parents=[source.layer_id])

    renamed = registry.rename(source.layer_id, "User source")
    assert renamed.name == "User source"
    assert LayerRegistry(registry.root).metadata(source.layer_id).name == "User source"
    with pytest.raises(ValueError, match="derived Layers depend on it"):
        registry.remove(source.layer_id)
    assert registry.metadata(source.layer_id).name == "User source"

    derived_storage = registry.root / derived.storage_path
    registry.remove(derived.layer_id)
    assert not derived_storage.exists()
    registry.remove(source.layer_id)
    assert registry.list_layers() == []
