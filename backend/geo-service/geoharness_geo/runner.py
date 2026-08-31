from __future__ import annotations

import json
import sys
from pathlib import Path
from typing import Any

from .operations import GeoTools
from .imports import import_capabilities, import_uploaded_layer
from .models import DatasetCatalog
from .regression import ScenarioRegression
from .registry import LayerRegistry
from .results import build_result_center, read_result_asset
from .workspace import WorkspaceStore


PROJECTION_GEOJSON_BYTES = 3 * 1024 * 1024
PROJECTION_GEOJSON_FEATURES = 10_000


def _load_scenario(
    registry: LayerRegistry,
    scenario_root: Path,
    scenario_id: str,
    *,
    reset: bool = False,
) -> dict[str, Any]:
    scenario_path = (scenario_root / scenario_id).resolve()
    if not scenario_path.is_relative_to(scenario_root) or not scenario_path.is_dir():
        raise ValueError(f"Unknown or unsafe Scenario id: {scenario_id}")
    manifest = json.loads((scenario_path / "scenario.json").read_text(encoding="utf-8"))
    if manifest.get("id") != scenario_id:
        raise ValueError(f"Scenario manifest id mismatch: {scenario_id}")
    if reset:
        registry.clear()
    if not registry.list_layers():
        before = {item.layer_id for item in registry.list_layers()}
        try:
            for relative_path in manifest["data"]:
                source_path = (scenario_path / relative_path).resolve()
                if not source_path.is_relative_to(scenario_path):
                    raise ValueError(f"Unsafe Scenario data path: {relative_path}")
                registry.register_file(source_path, name=source_path.stem, source="scenario")
        except Exception:
            registry.discard_layers(
                item.layer_id for item in registry.list_layers() if item.layer_id not in before
            )
            raise
    return {
        "scenario_id": scenario_id,
        "prompt": (scenario_path / manifest["prompt"]).read_text(encoding="utf-8").strip(),
        "layers": [item.model_dump(mode="json") for item in registry.list_layers()],
    }


def _load_dataset(
    registry: LayerRegistry,
    dataset_root: Path,
    dataset_id: str,
    *,
    reset: bool = False,
) -> dict[str, Any]:
    dataset_path = (dataset_root / dataset_id).resolve()
    examples_root = dataset_root.parent.resolve()
    if not dataset_path.is_relative_to(dataset_root) or not dataset_path.is_dir():
        raise ValueError(f"Unknown or unsafe Dataset id: {dataset_id}")
    manifest = DatasetCatalog.model_validate_json((dataset_path / "dataset.json").read_text(encoding="utf-8"))
    if manifest.id != dataset_id:
        raise ValueError(f"Dataset manifest id mismatch: {dataset_id}")
    if reset:
        registry.clear()
    if not registry.list_layers():
        before = {item.layer_id for item in registry.list_layers()}
        try:
            for layer in manifest.layers:
                source_path = (dataset_path / layer.path).resolve()
                if not source_path.is_relative_to(examples_root):
                    raise ValueError(f"Unsafe Dataset layer path: {layer.path}")
                registry.register_file(source_path, name=layer.name, source="scenario")
        except Exception:
            registry.discard_layers(
                item.layer_id for item in registry.list_layers() if item.layer_id not in before
            )
            raise
    return {
        "dataset_id": dataset_id,
        "title": manifest.title,
        "description": manifest.description,
        "layers": [item.model_dump(mode="json") for item in registry.list_layers()],
    }


def dispatch(payload: dict[str, Any]) -> Any:
    workspace_root = Path(payload["workspace_root"]).resolve()
    workspace = WorkspaceStore(
        workspace_root,
        workspace_id=str(payload.get("workspace_id", workspace_root.name)),
        session_id=str(payload.get("session_id", payload.get("workspace_id", workspace_root.name))),
    )
    registry = LayerRegistry(
        workspace_root,
        max_layer_features=int(payload.get("max_layer_features", 100_000)),
        max_layer_bytes=int(payload.get("max_layer_bytes", 256 * 1024 * 1024)),
    )
    workspace.sync_layers(registry.list_layers())
    action = payload.get("action")
    if action == "load_scenario":
        if bool(payload.get("reset", False)):
            registry.clear()
            workspace.reset_assets()
        value = _load_scenario(
            registry,
            Path(payload["scenario_root"]).resolve(),
            str(payload["scenario_id"]),
            reset=False,
        )
        workspace.activate_scenario(str(payload["scenario_id"]))
        workspace.sync_layers(registry.list_layers())
        return value
    if action == "load_dataset":
        if bool(payload.get("reset", False)):
            registry.clear()
            workspace.reset_assets()
        value = _load_dataset(
            registry,
            Path(payload["dataset_root"]).resolve(),
            str(payload["dataset_id"]),
            reset=False,
        )
        workspace.activate_dataset(str(payload["dataset_id"]))
        workspace.sync_layers(registry.list_layers())
        return value
    if action == "tool":
        tool = str(payload["tool"])
        step_id = payload.get("step_id")
        request_id = payload.get("request_id", step_id)
        parameters = dict(payload.get("parameters", {}))
        replay = workspace.replay_tool_execution(
            step_id=request_id,
            tool=tool,
            parameters=parameters,
        )
        if replay is not None:
            return replay.result.model_dump(mode="json")
        before = {item.layer_id for item in registry.list_layers()}
        try:
            result = GeoTools(registry).execute(tool, step_id=step_id, **parameters)
            created = [
                item.layer_id for item in registry.list_layers() if item.layer_id not in before
            ]
            if not result.success and created:
                registry.discard_layers(created)
            workspace.sync_layers(registry.list_layers())
            if result.success and result.tool == "export_layer":
                workspace.record_export(
                    layer_id=result.inputs[0],
                    format=str(result.data["format"]),
                    relative_path=str(result.data["path"]),
                    feature_count=int(result.data["feature_count"]),
                )
            workspace.record_tool_execution(
                step_id=request_id,
                tool=tool,
                parameters=parameters,
                result=result,
            )
            return result.model_dump(mode="json")
        except Exception:
            created = [
                item.layer_id for item in registry.list_layers() if item.layer_id not in before
            ]
            registry.discard_layers(created)
            workspace.sync_layers(registry.list_layers())
            raise
    if action == "import_capabilities":
        return import_capabilities(int(payload.get("max_upload_bytes", 20 * 1024 * 1024)))
    if action == "import_upload":
        return import_uploaded_layer(
            registry,
            workspace,
            file_name=str(payload["file_name"]),
            content_base64=str(payload["content_base64"]),
            name=payload.get("name"),
            source_layer=payload.get("source_layer"),
            longitude_field=payload.get("longitude_field"),
            latitude_field=payload.get("latitude_field"),
            crs=payload.get("crs"),
            max_upload_bytes=int(payload.get("max_upload_bytes", 20 * 1024 * 1024)),
        )
    if action == "workspace_manifest":
        return workspace.sync_layers(registry.list_layers()).model_dump(mode="json")
    if action == "workspace_record_run":
        run = dict(payload.get("run", {}))
        return workspace.record_run(str(payload["run_id"]), run).model_dump(mode="json")
    if action == "workspace_record_agent_run":
        return workspace.record_agent_run(dict(payload.get("run", {}))).model_dump(mode="json")
    if action == "workspace_runs":
        return [run.model_dump(mode="json") for run in workspace.agent_runs()]
    if action == "workspace_result":
        result = build_result_center(workspace, registry, run_id=payload.get("run_id"))
        return None if result is None else result.model_dump(mode="json")
    if action == "workspace_download":
        return read_result_asset(
            workspace,
            asset_type=str(payload["asset_type"]),
            asset_id=str(payload["asset_id"]),
        )
    if action == "workspace_reset":
        registry.clear()
        workspace.reset_assets()
        return workspace.manifest().model_dump(mode="json")
    if action == "layer_details":
        value = registry.details(
            str(payload["layer_id"]),
            offset=int(payload.get("offset", 0)),
            limit=int(payload.get("limit", 100)),
        )
        import_warnings = [
            warning
            for asset in workspace.manifest().imports
            if asset.layer_id == str(payload["layer_id"])
            for warning in asset.warnings
        ]
        value["warnings"] = list(dict.fromkeys([*import_warnings, *value["warnings"]]))
        return value
    if action == "layer_rename":
        metadata = registry.rename(str(payload["layer_id"]), str(payload["name"]))
        workspace.sync_layers(registry.list_layers())
        return metadata.model_dump(mode="json")
    if action == "layer_remove":
        layer_id = str(payload["layer_id"])
        registry.remove(layer_id)
        workspace.remove_layer_assets(layer_id)
        workspace.sync_layers(registry.list_layers())
        return workspace.manifest().model_dump(mode="json")
    if action == "layer_preference":
        layer_id = str(payload["layer_id"])
        registry.metadata(layer_id)
        return workspace.set_layer_preference(
            layer_id,
            visible=payload.get("visible"),
            opacity=payload.get("opacity"),
        ).model_dump(mode="json")
    if action == "layers":
        return [item.model_dump(mode="json") for item in registry.list_layers()]
    if action == "geojson":
        return registry.geojson(
            str(payload["layer_id"]),
            offset=int(payload.get("offset", 0)),
            limit=int(payload.get("limit", 10_000)),
            max_bytes=int(payload.get("max_bytes", 2 * 1024 * 1024)),
        )
    if action == "projection":
        layers = registry.list_layers()
        layer_budget = max(1024, PROJECTION_GEOJSON_BYTES // max(1, len(layers)))
        return [
            {
                "metadata": item.model_dump(mode="json"),
                "geojson": registry.geojson(
                    item.layer_id,
                    limit=PROJECTION_GEOJSON_FEATURES,
                    max_bytes=layer_budget,
                ),
            }
            for item in layers
        ]
    if action == "regression":
        return ScenarioRegression(
            registry,
            {str(key): str(value) for key, value in dict(payload["layer_aliases"]).items()},
        ).validate(str(payload["scenario_id"]))
    raise ValueError(f"Unknown runner action: {action}")


def main() -> None:
    try:
        payload = json.loads(sys.stdin.buffer.read().decode("utf-8"))
        value = dispatch(payload)
        response = json.dumps({"ok": True, "value": value}, ensure_ascii=False, separators=(",", ":"))
        sys.stdout.buffer.write(f"{response}\n".encode("utf-8"))
    except Exception as error:
        response = json.dumps({
            "ok": False,
            "error": {"type": type(error).__name__, "message": str(error)},
        }, ensure_ascii=False, separators=(",", ":"))
        sys.stdout.buffer.write(f"{response}\n".encode("utf-8", errors="backslashreplace"))
        raise SystemExit(1)


if __name__ == "__main__":
    main()
