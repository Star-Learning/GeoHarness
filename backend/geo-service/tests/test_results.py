from __future__ import annotations

import base64
import csv
import hashlib
import io
import json
from pathlib import Path

import geopandas as gpd
import pytest

from geoharness_geo import GeoTools, WorkspaceStore, build_result_center, read_result_asset


def test_result_center_projects_real_tools_layers_statistics_and_three_exports(
    registry,
    register_scenario_layer,
):
    buildings = register_scenario_layer("02-river-building-query", "buildings")
    rivers = register_scenario_layer("02-river-building-query", "rivers")
    tools = GeoTools(registry)
    workspace = WorkspaceStore(registry.root, workspace_id="phase5", session_id="phase5")
    workspace.activate_scenario("02-river-building-query")

    metric = tools.transform_crs(rivers.layer_id, "EPSG:32618", step_id="metric")
    buffer = tools.create_buffer(metric.outputs[0], 500, unit="meter", step_id="buffer")
    candidates = tools.spatial_filter(
        buildings.layer_id,
        mask_layer=buffer.outputs[0],
        predicate="intersects",
        output_name="phase5 candidates",
        step_id="candidates",
    )
    distribution = tools.analyze_distribution(candidates.outputs[0], fields=["height_m"], step_id="statistics")
    exports = [
        tools.export_layer(candidates.outputs[0], format=format_name, file_name="phase5-result", step_id=f"export-{format_name}")
        for format_name in ["geojson", "gpkg", "csv"]
    ]
    workspace.sync_layers(registry.list_layers())
    for exported in exports:
        workspace.record_export(
            layer_id=exported.inputs[0],
            format=exported.data["format"],
            relative_path=exported.data["path"],
            feature_count=exported.data["feature_count"],
        )

    tool_results = [metric, buffer, candidates, distribution, *exports]
    arguments = [
        {"input_layer": rivers.layer_id, "target_crs": "EPSG:32618"},
        {"input_layer": metric.outputs[0], "distance": 500, "unit": "meter"},
        {"input_layer": buildings.layer_id, "mask_layer": buffer.outputs[0], "predicate": "intersects"},
        {"input_layer": candidates.outputs[0], "fields": ["height_m"]},
        *[
            {"input_layer": candidates.outputs[0], "format": format_name, "file_name": f"phase5-result.{format_name}"}
            for format_name in ["geojson", "gpkg", "csv"]
        ],
    ]
    tool_calls = []
    for index, (result, call_arguments) in enumerate(zip(tool_results, arguments, strict=True), start=1):
        tool_calls.append({
            "call_id": f"call-{index}",
            "name": result.tool,
            "status": "success",
            "event_seq": index * 2,
            "result_event_seq": index * 2 + 1,
            "arguments": call_arguments,
            "input_layers": result.inputs,
            "output_layers": result.outputs,
            "summary": result.summary,
            "warnings": result.warnings,
            "result_data": result.data,
        })
    workspace.record_agent_run({
        "schema_version": "1.0",
        "run_id": "run-turn-0001",
        "session_id": "phase5",
        "turn": 1,
        "user_goal": "找出河流 500 米内的建筑，统计高度并导出三种格式。",
        "user_event_seq": 0,
        "started_at": "2026-08-31T08:00:00+00:00",
        "finished_at": "2026-08-31T08:00:01+00:00",
        "status": "success",
        "provider": "test-provider",
        "model": "test-model",
        "max_event_seq": 20,
        "tool_calls": tool_calls,
        "input_layers": list(dict.fromkeys(layer for result in tool_results for layer in result.inputs)),
        "output_layers": list(dict.fromkeys(layer for result in tool_results for layer in result.outputs)),
        "reused_layers": [buildings.layer_id, rivers.layer_id],
        "final_answer": {"event_seq": 19, "text": "真实结果为 132 栋建筑，三种格式均已导出。"},
        "errors": [],
        "retries": [],
    })

    center = build_result_center(workspace, registry)
    assert center is not None
    assert center.final_answer == "真实结果为 132 栋建筑，三种格式均已导出。"
    assert center.tools.model_dump() == {"total": 7, "success": 7, "failed": 0, "running": 0}
    assert {layer.layer_id for layer in center.input_layers} == {buildings.layer_id, rivers.layer_id}
    assert [layer.layer_id for layer in center.output_layers] == [candidates.outputs[0]]
    assert center.output_layers[0].feature_count == 132
    assert "EPSG:32618" in center.crs
    assert center.units == ["meter"]
    assert {source.detail for source in center.sources} == {"02-river-building-query"}
    selected = next(item for item in center.statistics if item.tool == "spatial_filter")
    assert selected.data["selected_count"] == 132
    height = next(item for item in center.statistics if item.tool == "analyze_distribution")
    assert height.data["statistics"]["height_m"]["count"] == 132
    assert {asset.format for asset in center.assets} == {"geojson", "gpkg", "csv", "json"}

    by_format = {asset.format: asset for asset in center.assets}
    geojson_download = read_result_asset(workspace, asset_type="export", asset_id=by_format["geojson"].asset_id)
    geojson_bytes = base64.b64decode(geojson_download["content_base64"])
    assert len(json.loads(geojson_bytes)["features"]) == 132
    assert hashlib.sha256(geojson_bytes).hexdigest() == geojson_download["sha256"]

    csv_download = read_result_asset(workspace, asset_type="export", asset_id=by_format["csv"].asset_id)
    csv_rows = list(csv.DictReader(io.StringIO(base64.b64decode(csv_download["content_base64"]).decode("utf-8"))))
    assert len(csv_rows) == 132

    gpkg_asset = next(item for item in workspace.manifest().exports if item.asset_id == by_format["gpkg"].asset_id)
    assert len(gpd.read_file(registry.root / gpkg_asset.path, engine="pyogrio")) == 132

    run_download = read_result_asset(workspace, asset_type="run", asset_id="run-turn-0001")
    assert json.loads(base64.b64decode(run_download["content_base64"]))["run_id"] == "run-turn-0001"


def test_result_download_is_indexed_bounded_and_workspace_scoped(tmp_path: Path):
    root = tmp_path / "workspace"
    workspace = WorkspaceStore(root, workspace_id="safe", session_id="safe")
    outside = tmp_path / "outside.geojson"
    outside.write_text("secret", encoding="utf-8")

    with pytest.raises(ValueError, match="safe 1-120"):
        read_result_asset(workspace, asset_type="export", asset_id="../outside")
    with pytest.raises(ValueError, match="Unknown export"):
        read_result_asset(workspace, asset_type="export", asset_id="export_missing")
    with pytest.raises(ValueError, match="export or run"):
        read_result_asset(workspace, asset_type="import", asset_id="asset")
    assert outside.read_text(encoding="utf-8") == "secret"
