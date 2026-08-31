from __future__ import annotations

import base64
from pathlib import Path

import geopandas as gpd
import pandas as pd
import pytest

from geoharness_geo.runner import dispatch


def _payload(workspace_root: Path, session_id: str, action: str, **values):
    return {
        "workspace_root": str(workspace_root),
        "workspace_id": session_id,
        "session_id": session_id,
        "action": action,
        **values,
    }


def _upload(workspace_root: Path, session_id: str, source: Path, name: str) -> dict:
    return dispatch(_payload(
        workspace_root,
        session_id,
        "import_upload",
        file_name=source.name,
        content_base64=base64.b64encode(source.read_bytes()).decode("ascii"),
        name=name,
    ))


def _tool(
    workspace_root: Path,
    session_id: str,
    request_id: str,
    tool: str,
    **parameters,
) -> dict:
    return dispatch(_payload(
        workspace_root,
        session_id,
        "tool",
        tool=tool,
        step_id=request_id,
        request_id=request_id,
        parameters=parameters,
    ))


def test_uploaded_buildings_are_inspected_without_a_scenario(
    tmp_path: Path,
    scenarios_root: Path,
):
    source = scenarios_root / "07-official-nyc-building-inspection" / "data" / "buildings.geojson"
    workspace = tmp_path / "quality-workspace"
    session = "acceptance-upload-quality"
    oracle = gpd.read_file(source, engine="pyogrio")

    uploaded = _upload(workspace, session, source, "User uploaded NYC buildings")
    layer_id = uploaded["metadata"]["layer_id"]
    details = dispatch(_payload(workspace, session, "layer_details", layer_id=layer_id, limit=100))
    inspected = _tool(workspace, session, "inspect-upload", "inspect_dataset", input_layer=layer_id)
    projection = dispatch(_payload(workspace, session, "projection"))
    manifest = dispatch(_payload(workspace, session, "workspace_manifest"))

    assert manifest["active_scenario"] is None
    assert manifest["active_dataset"] is None
    assert [item["layer_id"] for item in manifest["input_layers"]] == [layer_id]
    assert uploaded["metadata"]["source"] == "upload"
    assert uploaded["metadata"]["feature_count"] == len(oracle) == 133
    assert details["preview"]["total_rows"] == len(oracle)
    assert [field["name"] for field in details["fields"]] == [
        column for column in oracle.columns if column != oracle.geometry.name
    ]
    assert len(details["rows"]) == 100
    assert inspected["success"] is True
    assert inspected["data"]["feature_count"] == len(oracle)
    assert inspected["data"]["invalid_geometry_count"] == int((~oracle.geometry.is_valid).sum())
    assert inspected["data"]["empty_geometry_count"] == int(oracle.geometry.is_empty.sum())
    assert inspected["data"]["bounds"] == pytest.approx(oracle.total_bounds.tolist())
    assert projection[0]["metadata"]["layer_id"] == layer_id
    assert projection[0]["geojson"]["geoharness"]["total_features"] == len(oracle)


def test_uploaded_roads_and_buildings_honor_an_arbitrary_275_meter_request(
    tmp_path: Path,
    scenarios_root: Path,
):
    data_root = scenarios_root / "06-multi-constraint-selection" / "data"
    workspace = tmp_path / "buffer-workspace"
    session = "acceptance-upload-buffer-275"
    building_source = data_root / "buildings.geojson"
    road_source = data_root / "roads.geojson"
    buildings = gpd.read_file(building_source, engine="pyogrio")
    roads = gpd.read_file(road_source, engine="pyogrio")

    building_layer = _upload(workspace, session, building_source, "Uploaded buildings")["metadata"]["layer_id"]
    road_layer = _upload(workspace, session, road_source, "Uploaded roads")["metadata"]["layer_id"]
    major = _tool(
        workspace,
        session,
        "select-major-roads",
        "spatial_filter",
        input_layer=road_layer,
        where={"road_class": "major"},
        output_name="major roads",
    )
    metric = _tool(
        workspace,
        session,
        "project-major-roads",
        "transform_crs",
        input_layer=major["outputs"][0],
        target_crs="EPSG:32618",
        output_name="major roads metric",
    )
    buffered = _tool(
        workspace,
        session,
        "buffer-major-roads-275",
        "create_buffer",
        input_layer=metric["outputs"][0],
        distance=275,
        unit="meter",
        output_name="major roads 275m",
    )
    selected = _tool(
        workspace,
        session,
        "select-buildings-275",
        "spatial_filter",
        input_layer=building_layer,
        mask_layer=buffered["outputs"][0],
        predicate="intersects",
        output_name="buildings intersecting 275m",
    )

    major_oracle = roads.loc[roads["road_class"].eq("major")].to_crs("EPSG:32618")
    buffer_oracle = major_oracle.geometry.union_all().buffer(275)
    selected_oracle = buildings.to_crs("EPSG:32618").loc[
        lambda frame: frame.geometry.intersects(buffer_oracle)
    ]
    output = gpd.read_file(
        workspace / "layers" / f"{selected['outputs'][0]}.gpkg",
        engine="pyogrio",
    )

    assert buffered["parameters"]["distance"] == 275
    assert buffered["parameters"]["distance_m"] == 275.0
    assert selected["data"]["selected_count"] == len(selected_oracle) == 241
    assert len(output) == len(selected_oracle)
    assert set(output["building_id"]) == set(selected_oracle["building_id"])
    manifest = dispatch(_payload(workspace, session, "workspace_manifest"))
    assert manifest["active_scenario"] is None
    assert len(manifest["input_layers"]) == 2
    assert len(manifest["derived_layers"]) == 4


def test_uploaded_regions_are_aggregated_and_exported_against_an_independent_oracle(
    tmp_path: Path,
    scenarios_root: Path,
):
    data_root = scenarios_root / "03-building-statistics-by-district" / "data"
    workspace = tmp_path / "aggregation-workspace"
    session = "acceptance-upload-aggregation"
    building_source = data_root / "buildings.geojson"
    district_source = data_root / "districts.geojson"
    buildings = gpd.read_file(building_source, engine="pyogrio")
    districts = gpd.read_file(district_source, engine="pyogrio")

    building_layer = _upload(workspace, session, building_source, "Uploaded buildings")["metadata"]["layer_id"]
    district_layer = _upload(workspace, session, district_source, "Uploaded districts")["metadata"]["layer_id"]
    measured = _tool(
        workspace,
        session,
        "measure-buildings",
        "calculate_geometry",
        input_layer=building_layer,
        metric_crs="EPSG:32618",
        area_field="area_m2",
        output_name="measured buildings",
    )
    aggregated = _tool(
        workspace,
        session,
        "aggregate-districts",
        "aggregate_by_region",
        input_layer=measured["outputs"][0],
        regions_layer=district_layer,
        group_field="district_id",
        area_field="area_m2",
        output_name="district statistics",
    )
    exported = _tool(
        workspace,
        session,
        "export-district-statistics",
        "export_layer",
        input_layer=aggregated["outputs"][0],
        format="csv",
        file_name="district-statistics.csv",
    )

    oracle_buildings = buildings.copy()
    oracle_buildings["area_m2"] = buildings.to_crs("EPSG:32618").geometry.area.to_numpy()
    oracle_districts = districts.to_crs(buildings.crs)
    oracle_join = gpd.sjoin(
        oracle_buildings,
        oracle_districts[["district_id", oracle_districts.geometry.name]],
        how="left",
        predicate="within",
    )
    oracle = oracle_join.groupby("district_id", dropna=False).agg(
        feature_count=("district_id", "size"),
        area_sum_m2=("area_m2", "sum"),
    ).reset_index()
    expected = {row["district_id"]: row for row in oracle.to_dict(orient="records")}
    actual = {row["district_id"]: row for row in aggregated["data"]["groups"]}

    assert actual.keys() == expected.keys()
    for district_id, row in expected.items():
        assert actual[district_id]["feature_count"] == row["feature_count"]
        assert actual[district_id]["area_sum_m2"] == pytest.approx(row["area_sum_m2"], rel=1e-9)
    assert sum(row["feature_count"] for row in actual.values()) == len(buildings) == 360

    exported_table = pd.read_csv(workspace / exported["data"]["path"])
    assert len(exported_table) == len(districts) == 3
    assert set(exported_table["district_id"]) == set(districts["district_id"])
    assert exported["data"]["feature_count"] == len(districts)
    manifest = dispatch(_payload(workspace, session, "workspace_manifest"))
    assert manifest["active_scenario"] is None
    assert len(manifest["imports"]) == 2
    assert len(manifest["exports"]) == 1
