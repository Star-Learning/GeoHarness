from __future__ import annotations

import base64
import io
import json
import zipfile
from pathlib import Path

import geopandas as gpd
import pytest
from shapely.geometry import Point

from geoharness_geo.imports import import_uploaded_layer
from geoharness_geo.models import ToolResult
from geoharness_geo.operations import GeoTools
from geoharness_geo.registry import LayerRegistry
from geoharness_geo.runner import dispatch
from geoharness_geo.workspace import WorkspaceStore


def points(count: int, *, text_size: int = 0) -> gpd.GeoDataFrame:
    return gpd.GeoDataFrame(
        {
            "value": list(range(count)),
            "note": ["x" * text_size for _ in range(count)],
        },
        geometry=[Point(-74 + index / 10_000, 40.7) for index in range(count)],
        crs="EPSG:4326",
    )


def payload(root: Path, **values: object) -> dict[str, object]:
    return {
        "workspace_root": str(root),
        "workspace_id": root.name,
        "session_id": root.name,
        "scenario_root": str(root.parent / "scenarios"),
        "dataset_root": str(root.parent / "datasets"),
        **values,
    }


def test_layer_limits_and_paged_geojson_are_enforced_without_partial_assets(tmp_path: Path):
    registry = LayerRegistry(tmp_path / "bounded", max_layer_features=5)
    layer = registry.register("five", points(5), source="upload")

    page = registry.geojson(layer.layer_id, offset=1, limit=2, max_bytes=1024)
    assert len(page["features"]) == 2
    assert page["geoharness"] == {
        **page["geoharness"],
        "offset": 1,
        "returned_features": 2,
        "total_features": 5,
        "truncated": True,
        "next_offset": 3,
    }
    assert len(json.dumps(page, separators=(",", ":")).encode("utf-8")) <= 1024

    details = registry.details(layer.layer_id, offset=2, limit=2)
    assert [row["__row_index"] for row in details["rows"]] == [2, 3]
    assert details["preview"]["offset"] == 2
    assert details["preview"]["rows_truncated"] is True

    with pytest.raises(ValueError, match="contains 6 features; limit is 5"):
        registry.register("too-many", points(6), source="upload")
    assert [item.layer_id for item in registry.list_layers()] == [layer.layer_id]
    assert not list(registry.layers_root.glob(".*.gpkg"))

    byte_registry = LayerRegistry(tmp_path / "byte-bounded", max_layer_bytes=1024)
    with pytest.raises(ValueError, match="Layer snapshot is .* limit is 1024"):
        byte_registry.register("too-large", points(1), source="upload")
    assert byte_registry.list_layers() == []
    assert list(byte_registry.layers_root.iterdir()) == []


def test_malicious_zip_and_failed_export_leave_no_files_or_layers(tmp_path: Path, monkeypatch):
    root = tmp_path / "secure"
    workspace = WorkspaceStore(root, workspace_id="secure", session_id="secure")
    registry = LayerRegistry(root)
    archive_bytes = io.BytesIO()
    with zipfile.ZipFile(archive_bytes, "w") as archive:
        archive.writestr("../escape.shp", b"not-a-shapefile")
    with pytest.raises(ValueError, match="Unsafe ZIP member path"):
        import_uploaded_layer(
            registry,
            workspace,
            file_name="malicious.zip",
            content_base64=base64.b64encode(archive_bytes.getvalue()).decode("ascii"),
        )
    assert registry.list_layers() == []
    assert list(workspace.imports_root.iterdir()) == []
    assert not (tmp_path / "escape.shp").exists()

    source = registry.register("source", points(2), source="upload")
    original_to_file = gpd.GeoDataFrame.to_file

    def fail_after_write(self, filename, *args, **kwargs):
        Path(filename).write_bytes(b"partial")
        raise RuntimeError("simulated writer failure")

    monkeypatch.setattr(gpd.GeoDataFrame, "to_file", fail_after_write)
    result = GeoTools(registry).execute(
        "export_layer", input_layer=source.layer_id, format="geojson", step_id="failed-export"
    )
    monkeypatch.setattr(gpd.GeoDataFrame, "to_file", original_to_file)
    assert result.success is False
    assert list(registry.exports_root.iterdir()) == []


def test_runner_rolls_back_failed_outputs_and_replays_duplicate_tool_calls(tmp_path: Path, monkeypatch):
    root = tmp_path / "runner-session"
    registry = LayerRegistry(root)
    source = registry.register("source", points(2), source="upload")

    original_execute = GeoTools.execute

    def partial_failure(self, tool, *, step_id=None, **parameters):
        frame = self.registry.get(parameters["input_layer"])
        created = self.registry.register(
            "partial",
            frame,
            source="derived",
            generated_by=step_id,
            parents=[parameters["input_layer"]],
            parameters=parameters,
        )
        return ToolResult(
            success=False,
            tool=tool,
            step_id=step_id,
            inputs=[parameters["input_layer"]],
            outputs=[created.layer_id],
            summary="simulated structured failure",
        )

    monkeypatch.setattr(GeoTools, "execute", partial_failure)
    failed = dispatch(payload(
        root,
        action="tool",
        tool="transform_crs",
        step_id="partial-failure",
        parameters={"input_layer": source.layer_id, "target_crs": "EPSG:3857"},
    ))
    monkeypatch.setattr(GeoTools, "execute", original_execute)
    assert failed["success"] is False
    assert [item.layer_id for item in LayerRegistry(root).list_layers()] == [source.layer_id]

    request = payload(
        root,
        action="tool",
        tool="transform_crs",
        step_id="idempotent-transform",
        parameters={"input_layer": source.layer_id, "target_crs": "EPSG:32618"},
    )
    first = dispatch(request)
    second = dispatch(request)
    assert first == second
    assert len(LayerRegistry(root).list_layers()) == 2

    conflicting = {**request, "parameters": {**request["parameters"], "target_crs": "EPSG:3857"}}
    with pytest.raises(ValueError, match="Tool idempotency conflict"):
        dispatch(conflicting)
    assert len(LayerRegistry(root).list_layers()) == 2
