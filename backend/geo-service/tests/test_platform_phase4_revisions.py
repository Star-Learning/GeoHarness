from __future__ import annotations

from pathlib import Path

import geopandas as gpd
import pandas as pd

from geoharness_geo import GeoTools


def test_five_revision_classes_match_independent_geopandas_oracles(registry, scenarios_root: Path):
    data_root = scenarios_root / "06-multi-constraint-selection" / "data"
    source_frames = {
        name: gpd.read_file(data_root / f"{name}.geojson", engine="pyogrio")
        for name in ("buildings", "roads", "rivers")
    }
    layers = {
        name: registry.register_file(data_root / f"{name}.geojson", name=name, source="upload")
        for name in source_frames
    }
    tools = GeoTools(registry)

    major = tools.spatial_filter(
        layers["roads"].layer_id,
        where={"road_class": "major"},
        output_name="major roads",
    )
    metric = tools.transform_crs(major.outputs[0], "EPSG:32618", output_name="major roads metric")
    buffer_275 = tools.create_buffer(metric.outputs[0], 275, output_name="major roads 275m")
    within_275 = tools.spatial_filter(
        layers["buildings"].layer_id,
        mask_layer=buffer_275.outputs[0],
        predicate="within",
        output_name="buildings within 275m",
    )
    buffer_200 = tools.create_buffer(metric.outputs[0], 200, output_name="major roads 200m")
    within_200 = tools.spatial_filter(
        layers["buildings"].layer_id,
        mask_layer=buffer_200.outputs[0],
        predicate="within",
        output_name="buildings within 200m",
    )
    intersects_200 = tools.spatial_filter(
        layers["buildings"].layer_id,
        mask_layer=buffer_200.outputs[0],
        predicate="intersects",
        output_name="buildings intersecting 200m",
    )
    other_roads = tools.spatial_filter(
        layers["roads"].layer_id,
        where={"road_class": "other_four_plus_lane"},
        output_name="other four plus lane roads",
    )
    csv_export = tools.export_layer(
        intersects_200.outputs[0],
        format="csv",
        file_name="buildings-intersecting-200m.csv",
    )
    river_metric = tools.transform_crs(
        layers["rivers"].layer_id,
        "EPSG:32618",
        output_name="rivers metric",
    )
    river_buffer = tools.create_buffer(river_metric.outputs[0], 800, output_name="river exclusion 800m")
    appended = tools.spatial_filter(
        intersects_200.outputs[0],
        mask_layer=river_buffer.outputs[0],
        predicate="disjoint",
        output_name="road candidates outside river 800m",
    )

    buildings_metric = source_frames["buildings"].to_crs("EPSG:32618")
    major_metric = source_frames["roads"].loc[
        source_frames["roads"]["road_class"].eq("major")
    ].to_crs("EPSG:32618")
    road_275_geometry = major_metric.geometry.union_all().buffer(275)
    road_200_geometry = major_metric.geometry.union_all().buffer(200)
    expected_within_275 = buildings_metric.loc[buildings_metric.geometry.within(road_275_geometry)]
    expected_within_200 = buildings_metric.loc[buildings_metric.geometry.within(road_200_geometry)]
    expected_intersects_200 = buildings_metric.loc[buildings_metric.geometry.intersects(road_200_geometry)]
    river_geometry = source_frames["rivers"].to_crs("EPSG:32618").geometry.union_all().buffer(800)
    expected_appended = expected_intersects_200.loc[expected_intersects_200.geometry.disjoint(river_geometry)]

    assert within_275.data["selected_count"] == len(expected_within_275)
    assert within_200.data["selected_count"] == len(expected_within_200)
    assert intersects_200.data["selected_count"] == len(expected_intersects_200)
    assert len(expected_within_275) == 228
    assert len(expected_within_200) == 188
    assert len(expected_intersects_200) == 205
    assert within_275.data["selected_count"] > within_200.data["selected_count"]
    assert intersects_200.data["selected_count"] >= within_200.data["selected_count"]
    assert other_roads.data["selected_count"] == int(
        source_frames["roads"]["road_class"].eq("other_four_plus_lane").sum()
    ) == 242
    assert appended.data["selected_count"] == len(expected_appended)
    assert len(expected_appended) == 14
    assert appended.data["selected_count"] < intersects_200.data["selected_count"]

    csv_path = registry.root / csv_export.data["path"]
    assert csv_export.data["format"] == "csv"
    assert csv_path.is_file()
    assert len(pd.read_csv(csv_path)) == len(expected_intersects_200)
