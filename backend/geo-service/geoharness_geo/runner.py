from __future__ import annotations

import json
import sys
from pathlib import Path
from typing import Any

from .operations import GeoTools
from .registry import LayerRegistry


def _load_scenario(registry: LayerRegistry, scenario_root: Path, scenario_id: str) -> dict[str, Any]:
    scenario_path = (scenario_root / scenario_id).resolve()
    if not scenario_path.is_relative_to(scenario_root) or not scenario_path.is_dir():
        raise ValueError(f"Unknown or unsafe Scenario id: {scenario_id}")
    manifest = json.loads((scenario_path / "scenario.json").read_text(encoding="utf-8"))
    if manifest.get("id") != scenario_id:
        raise ValueError(f"Scenario manifest id mismatch: {scenario_id}")
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


def dispatch(payload: dict[str, Any]) -> Any:
    workspace_root = Path(payload["workspace_root"]).resolve()
    registry = LayerRegistry(workspace_root)
    action = payload.get("action")
    if action == "load_scenario":
        return _load_scenario(
            registry,
            Path(payload["scenario_root"]).resolve(),
            str(payload["scenario_id"]),
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
