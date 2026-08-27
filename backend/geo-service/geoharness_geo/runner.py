from __future__ import annotations

import json
import sys
from pathlib import Path
from typing import Any

from .operations import GeoTools
from .regression import ScenarioRegression
from .registry import LayerRegistry


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
        for relative_path in manifest["data"]:
            source_path = (scenario_path / relative_path).resolve()
            if not source_path.is_relative_to(scenario_path):
                raise ValueError(f"Unsafe Scenario data path: {relative_path}")
            registry.register_file(source_path, name=source_path.stem, source="scenario")
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
    manifest = json.loads((dataset_path / "dataset.json").read_text(encoding="utf-8"))
    if manifest.get("id") != dataset_id:
        raise ValueError(f"Dataset manifest id mismatch: {dataset_id}")
    if reset:
        registry.clear()
    if not registry.list_layers():
        for layer in manifest["layers"]:
            source_path = (dataset_path / str(layer["path"])).resolve()
            if not source_path.is_relative_to(examples_root):
                raise ValueError(f"Unsafe Dataset layer path: {layer['path']}")
            registry.register_file(source_path, name=str(layer["name"]), source="scenario")
    return {
        "dataset_id": dataset_id,
        "title": manifest["title"],
        "description": manifest["description"],
        "layers": [item.model_dump(mode="json") for item in registry.list_layers()],
    }


def dispatch(payload: dict[str, Any]) -> Any:
    workspace_root = Path(payload["workspace_root"]).resolve()
    registry = LayerRegistry(workspace_root)
    action = payload.get("action")
    if action == "load_scenario":
        return _load_scenario(
            registry,
            Path(payload["scenario_root"]).resolve(),
            str(payload["scenario_id"]),
            reset=bool(payload.get("reset", False)),
        )
    if action == "load_dataset":
        return _load_dataset(
            registry,
            Path(payload["dataset_root"]).resolve(),
            str(payload["dataset_id"]),
            reset=bool(payload.get("reset", False)),
        )
    if action == "tool":
        result = GeoTools(registry).execute(
            str(payload["tool"]),
            step_id=payload.get("step_id"),
            **dict(payload.get("parameters", {})),
        )
        return result.model_dump(mode="json")
    if action == "layers":
        return [item.model_dump(mode="json") for item in registry.list_layers()]
    if action == "geojson":
        return registry.geojson(str(payload["layer_id"]))
    if action == "projection":
        return [
            {
                "metadata": item.model_dump(mode="json"),
                "geojson": registry.geojson(item.layer_id),
            }
            for item in registry.list_layers()
        ]
    if action == "regression":
        return ScenarioRegression(
            registry,
            {str(key): str(value) for key, value in dict(payload["layer_aliases"]).items()},
        ).validate(str(payload["scenario_id"]))
    raise ValueError(f"Unknown runner action: {action}")


def main() -> None:
    try:
        payload = json.load(sys.stdin)
        value = dispatch(payload)
        print(json.dumps({"ok": True, "value": value}, ensure_ascii=False, separators=(",", ":")))
    except Exception as error:
        print(json.dumps({
            "ok": False,
            "error": {"type": type(error).__name__, "message": str(error)},
        }, ensure_ascii=False, separators=(",", ":")))
        raise SystemExit(1)


if __name__ == "__main__":
    main()
