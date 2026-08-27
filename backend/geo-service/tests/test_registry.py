from __future__ import annotations

import geopandas as gpd
import pandas as pd
from shapely.geometry import Point

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
