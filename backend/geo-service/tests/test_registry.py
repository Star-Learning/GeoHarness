from __future__ import annotations

from geoharness_geo import LayerRegistry


def test_registry_persists_canonical_layer_metadata_and_data(registry, register_scenario_layer):
    buildings = register_scenario_layer("01-building-data-inspection", "buildings")
    assert buildings.layer_id == "layer_0001"
    assert buildings.name == "buildings"
    assert buildings.geometry == "Polygon"
    assert buildings.crs == "EPSG:4326"
    assert buildings.feature_count == 12
    assert buildings.source == "scenario"
    assert len(buildings.bbox) == 4

    restored = LayerRegistry(registry.root)
    assert restored.metadata(buildings.layer_id) == buildings
    assert len(restored.get(buildings.layer_id)) == 12
    geojson = restored.geojson(buildings.layer_id)
    assert geojson["type"] == "FeatureCollection"
    assert len(geojson["features"]) == 12
