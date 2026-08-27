from __future__ import annotations

import json

from geoharness_geo import GeoTools


def test_inspection_geometry_distribution_and_registry_listing(registry, register_scenario_layer):
    buildings = register_scenario_layer("01-building-data-inspection", "buildings")
    tools = GeoTools(registry)

    inspection = tools.inspect_dataset(buildings.layer_id, step_id="inspect")
    assert inspection.success
    assert inspection.data["feature_count"] == 360
    assert inspection.data["geometry_types"] == ["MultiPolygon"]
    assert inspection.data["missing_values"]["height_m"] == 0
    assert inspection.data["invalid_geometry_count"] == 0
    assert inspection.data["area_m2"]["sum"] > 0

    calculated = tools.calculate_geometry(buildings.layer_id, step_id="geometry")
    calculated_frame = registry.get(calculated.outputs[0])
    assert (calculated_frame["area_m2"] > 0).all()
    assert registry.metadata(calculated.outputs[0]).parents == [buildings.layer_id]
    assert registry.metadata(calculated.outputs[0]).generated_by == "geometry"

    distribution = tools.analyze_distribution(buildings.layer_id, fields=["height_m", "use"])
    assert distribution.data["statistics"]["height_m"]["missing"] == 0
    assert distribution.data["statistics"]["use"]["top_values"]["feature_code_2100"] == 357

    listing = tools.list_layers()
    assert len(listing.data["layers"]) == 2


def test_crs_buffer_spatial_filter_and_export(registry, register_scenario_layer):
    buildings = register_scenario_layer("02-river-building-query", "buildings")
    rivers = register_scenario_layer("02-river-building-query", "rivers")
    tools = GeoTools(registry)

    metric = tools.transform_crs(rivers.layer_id, "EPSG:32618", step_id="metric")
    assert registry.metadata(metric.outputs[0]).crs == "EPSG:32618"
    buffer = tools.create_buffer(metric.outputs[0], 500, output_name="river_buffer", step_id="buffer")
    assert buffer.success
    assert buffer.parameters["distance_m"] == 500
    candidates = tools.spatial_filter(
        buildings.layer_id,
        mask_layer=buffer.outputs[0],
        predicate="intersects",
        output_name="candidate_buildings",
        step_id="filter",
    )
    assert candidates.data["selected_count"] == 132
    assert registry.metadata(candidates.outputs[0]).parents == [buildings.layer_id, buffer.outputs[0]]

    exported = tools.export_layer(candidates.outputs[0], format="geojson", file_name="river-candidates")
    export_path = registry.root / exported.data["path"]
    assert export_path.is_file()
    assert len(json.loads(export_path.read_text(encoding="utf-8"))["features"]) == 132


def test_spatial_join_aggregation_and_clip(registry, register_scenario_layer):
    buildings = register_scenario_layer("03-building-statistics-by-district", "buildings")
    districts = register_scenario_layer("03-building-statistics-by-district", "districts")
    tools = GeoTools(registry)

    calculated = tools.calculate_geometry(buildings.layer_id, output_name="buildings_geometry")
    joined = tools.spatial_join(calculated.outputs[0], districts.layer_id, predicate="within", output_name="buildings_with_district")
    joined_frame = registry.get(joined.outputs[0])
    assert len(joined_frame) == 360
    assert set(joined_frame["district_id"]) == {"MN-101", "MN-102", "MN-103"}

    aggregated = tools.aggregate_by_region(
        calculated.outputs[0],
        districts.layer_id,
        "district_id",
        output_name="district_statistics",
    )
    assert {row["district_id"]: row["feature_count"] for row in aggregated.data["groups"]} == {
        "MN-101": 162,
        "MN-102": 40,
        "MN-103": 158,
    }
    assert all(row["area_sum_m2"] > 0 for row in aggregated.data["groups"])

    west = tools.spatial_filter(
        districts.layer_id,
        where={"district_id": "MN-101"},
        output_name="west_district",
    )
    clipped = tools.clip_layer(buildings.layer_id, west.outputs[0], output_name="west_buildings")
    assert clipped.data["feature_count"] == 162


def test_nearest_features_and_structured_failure(registry, register_scenario_layer):
    buildings = register_scenario_layer("04-road-accessibility", "buildings")
    roads = register_scenario_layer("04-road-accessibility", "roads")
    tools = GeoTools(registry)

    nearest = tools.nearest_features(buildings.layer_id, roads.layer_id, output_name="nearest_roads")
    assert nearest.success
    assert nearest.data["matched_count"] == 360
    assert nearest.data["minimum_distance_m"] >= 0
    assert nearest.data["maximum_distance_m"] > nearest.data["minimum_distance_m"]

    layer_count = len(registry.list_layers())
    failure = tools.execute("create_buffer", input_layer=roads.layer_id, distance=-1)
    assert not failure.success
    assert failure.outputs == []
    assert "greater than zero" in failure.summary
    assert len(registry.list_layers()) == layer_count

    unknown = tools.execute("not_a_geo_tool")
    assert not unknown.success
    assert "Unknown Geo Tool" in unknown.summary


def test_multi_constraint_workflow_produces_real_candidates(registry, register_scenario_layer):
    buildings = register_scenario_layer("06-multi-constraint-selection", "buildings")
    roads = register_scenario_layer("06-multi-constraint-selection", "roads")
    rivers = register_scenario_layer("06-multi-constraint-selection", "rivers")
    tools = GeoTools(registry)

    major = tools.spatial_filter(roads.layer_id, where={"road_class": "major"}, output_name="major_roads")
    road_buffer = tools.create_buffer(major.outputs[0], 300, output_name="major_road_buffer")
    near_roads = tools.spatial_filter(buildings.layer_id, mask_layer=road_buffer.outputs[0], output_name="near_roads")
    river_buffer = tools.create_buffer(rivers.layer_id, 800, output_name="river_exclusion_buffer")
    candidates = tools.spatial_filter(
        near_roads.outputs[0],
        mask_layer=river_buffer.outputs[0],
        predicate="disjoint",
        output_name="candidate_buildings",
    )
    assert near_roads.data["selected_count"] == 249
    assert candidates.data["selected_count"] == 27
