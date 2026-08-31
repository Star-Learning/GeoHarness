from __future__ import annotations

import json
from pathlib import Path

import geopandas as gpd
from shapely.geometry import Point

from geoharness_geo import LayerRegistry, WorkspaceStore


def point_frame(name: str) -> gpd.GeoDataFrame:
    return gpd.GeoDataFrame(
        {"name": [name]},
        geometry=[Point(-74.01, 40.71)],
        crs="EPSG:4326",
    )


def test_workspace_manifest_indexes_layers_exports_and_runs_and_restores(tmp_path: Path):
    root = tmp_path / "workspaces" / "session-a"
    registry = LayerRegistry(root)
    workspace = WorkspaceStore(root, workspace_id="session-a", session_id="session:a")

    source = registry.register("source", point_frame("source"), source="upload")
    derived = registry.register(
        "derived",
        point_frame("derived"),
        source="derived",
        generated_by="transform",
        parents=[source.layer_id],
    )
    workspace.sync_layers(registry.list_layers())

    exported = registry.exports_root / "derived.geojson"
    exported.write_text('{"type":"FeatureCollection","features":[]}\n', encoding="utf-8")
    workspace.record_export(
        layer_id=derived.layer_id,
        format="geojson",
        relative_path="exports/derived.geojson",
        feature_count=1,
    )
    workspace.record_run("run-001", {"status": "success", "goal": "inspect the uploaded point"})

    restored = WorkspaceStore(root, workspace_id="session-a", session_id="session:a").manifest()
    assert restored.schema_version == "1.0"
    assert restored.workspace_id == "session-a"
    assert restored.session_id == "session:a"
    assert [item.layer_id for item in restored.input_layers] == [source.layer_id]
    assert [item.layer_id for item in restored.derived_layers] == [derived.layer_id]
    assert restored.exports[0].path == "exports/derived.geojson"
    assert restored.exports[0].size_bytes == exported.stat().st_size
    assert restored.runs[0].path == "runs/run-001.json"
    assert json.loads((root / restored.runs[0].path).read_text(encoding="utf-8"))["goal"] == "inspect the uploaded point"
    assert list(root.glob(".workspace.json.*.tmp")) == []


def test_workspace_reset_is_bounded_to_one_resolved_session(tmp_path: Path):
    workspaces = tmp_path / "workspaces"
    root = workspaces / "session-a"
    sibling = workspaces / "session-b"
    sibling.mkdir(parents=True)
    sentinel = sibling / "keep.txt"
    sentinel.write_text("keep", encoding="utf-8")

    registry = LayerRegistry(root)
    registry.register("source", point_frame("source"), source="upload")
    workspace = WorkspaceStore(root, workspace_id="session-a", session_id="session-a")
    workspace.sync_layers(registry.list_layers())
    (workspace.imports_root / "nested").mkdir()
    (workspace.imports_root / "nested" / "upload.geojson").write_text("{}", encoding="utf-8")
    workspace.record_run("run-001", {"status": "failed"})

    registry.clear()
    reset = workspace.reset_assets()

    assert sentinel.read_text(encoding="utf-8") == "keep"
    assert list(workspace.imports_root.iterdir()) == []
    assert list(workspace.runs_root.iterdir()) == []
    assert reset.input_layers == []
    assert reset.derived_layers == []
    assert reset.exports == []
    assert reset.runs == []
    assert WorkspaceStore(root, workspace_id="session-a", session_id="session-a").manifest() == reset


def test_workspace_identity_mismatch_is_rejected(tmp_path: Path):
    root = tmp_path / "same-safe-segment"
    WorkspaceStore(root, workspace_id="same-safe-segment", session_id="session:a")

    try:
        WorkspaceStore(root, workspace_id="same-safe-segment", session_id="session/a")
    except ValueError as error:
        assert "identity mismatch" in str(error)
    else:
        raise AssertionError("A colliding Session id must not expose the existing workspace")


def test_layer_preferences_and_import_removal_are_persistent_and_bounded(tmp_path: Path):
    root = tmp_path / "workspaces" / "session-layer-workbench"
    registry = LayerRegistry(root)
    workspace = WorkspaceStore(
        root,
        workspace_id="session-layer-workbench",
        session_id="session-layer-workbench",
    )
    layer = registry.register("uploaded", point_frame("uploaded"), source="upload")
    workspace.sync_layers(registry.list_layers())
    import_root = workspace.imports_root / "import_testasset"
    import_root.mkdir()
    source = import_root / "uploaded.geojson"
    source.write_text('{"type":"FeatureCollection","features":[]}', encoding="utf-8")
    workspace.record_import(
        asset_id="import_testasset",
        file_name=source.name,
        format="geojson",
        relative_path=source.relative_to(root).as_posix(),
        size_bytes=source.stat().st_size,
        layer_id=layer.layer_id,
        source_layer=None,
        warnings=[],
    )

    workspace.set_layer_preference(layer.layer_id, visible=False)
    workspace.set_layer_preference(layer.layer_id, opacity=0.4)
    restored = WorkspaceStore(
        root,
        workspace_id="session-layer-workbench",
        session_id="session-layer-workbench",
    )
    assert restored.manifest().layer_preferences[layer.layer_id].model_dump() == {
        "visible": False,
        "opacity": 0.4,
    }

    removed = restored.remove_layer_assets(layer.layer_id)
    assert removed.imports == []
    assert layer.layer_id not in removed.layer_preferences
    assert not import_root.exists()
    assert root.exists()


def test_agent_run_manifest_validates_unicode_session_and_restores(tmp_path: Path):
    root = tmp_path / "workspaces" / "native-run"
    workspace = WorkspaceStore(root, workspace_id="native-run", session_id="native-run")
    run = workspace.record_agent_run({
        "schema_version": "1.0",
        "run_id": "run-turn-0001",
        "session_id": "native-run",
        "turn": 1,
        "user_goal": "把距离改成 200 米。",
        "user_event_seq": 0,
        "started_at": "2026-08-31T04:00:00+00:00",
        "finished_at": "2026-08-31T04:00:01+00:00",
        "status": "success",
        "provider": "test",
        "model": "test-model",
        "max_event_seq": 5,
        "tool_calls": [],
        "input_layers": [],
        "output_layers": [],
        "reused_layers": [],
        "final_answer": {"event_seq": 4, "text": "已经重新计算。"},
        "errors": [],
        "retries": [],
    })
    assert run.final_answer is not None
    assert run.final_answer.text == "已经重新计算。"
    restored = WorkspaceStore(root, workspace_id="native-run", session_id="native-run").agent_runs()
    assert restored == [run]

    invalid = run.model_dump(mode="json")
    invalid["session_id"] = "another-session"
    try:
        workspace.record_agent_run(invalid)
    except ValueError as error:
        assert "does not match" in str(error)
    else:
        raise AssertionError("A Run from another Session must be rejected")
