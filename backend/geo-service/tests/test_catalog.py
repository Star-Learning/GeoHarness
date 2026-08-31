from __future__ import annotations

import json
from pathlib import Path

import pytest
from pydantic import ValidationError

from geoharness_geo.models import DatasetCatalog
from geoharness_geo.operations import TOOL_NAMES


def test_python_runtime_accepts_the_versioned_dataset_catalog(scenarios_root: Path):
    repository_root = scenarios_root.parents[1]
    path = repository_root / "examples" / "datasets" / "nyc-core-official" / "dataset.json"
    catalog = DatasetCatalog.model_validate_json(path.read_text(encoding="utf-8"))
    assert catalog.schema_version == "1.0"
    assert catalog.id == "nyc-core-official"
    assert [layer.name for layer in catalog.layers] == [
        "buildings", "roads", "rivers", "districts", "lower_manhattan_buildings"
    ]
    assert catalog.schema_ref is not None


def test_python_tool_implementations_match_the_host_manifest(scenarios_root: Path):
    repository_root = scenarios_root.parents[1]
    path = repository_root / "bundle" / "geoharness-bundle" / "catalog" / "builtin-tools.json"
    manifest = json.loads(path.read_text(encoding="utf-8"))
    host_backend_tools = [
        tool["name"] for tool in manifest["tools"] if tool["name"] != "discover_datasets"
    ]
    assert host_backend_tools == list(TOOL_NAMES)
    assert all(tool["output"]["contract"] == "ToolResult@1.0" for tool in manifest["tools"])


def test_dataset_schema_version_and_unknown_fields_fail_closed(scenarios_root: Path):
    repository_root = scenarios_root.parents[1]
    path = repository_root / "examples" / "datasets" / "nyc-core-official" / "dataset.json"
    value = json.loads(path.read_text(encoding="utf-8"))
    value["schema_version"] = "2.0"
    with pytest.raises(ValidationError, match="Input should be '1.0'"):
        DatasetCatalog.model_validate(value)
    value["schema_version"] = "1.0"
    value["unexpected"] = "not allowed"
    with pytest.raises(ValidationError, match="Extra inputs are not permitted"):
        DatasetCatalog.model_validate(value)
