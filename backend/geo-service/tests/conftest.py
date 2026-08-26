from __future__ import annotations

import sys
from pathlib import Path

import pytest

SERVICE_ROOT = Path(__file__).resolve().parents[1]
REPOSITORY_ROOT = SERVICE_ROOT.parents[1]
SCENARIOS_ROOT = REPOSITORY_ROOT / "examples" / "scenarios"
sys.path.insert(0, str(SERVICE_ROOT))

from geoharness_geo import LayerRegistry  # noqa: E402


@pytest.fixture
def registry(tmp_path: Path) -> LayerRegistry:
    return LayerRegistry(tmp_path / "workspace")


@pytest.fixture
def scenarios_root() -> Path:
    return SCENARIOS_ROOT


def scenario_data(scenarios_root: Path, scenario_id: str, name: str) -> Path:
    return scenarios_root / scenario_id / "data" / f"{name}.geojson"


@pytest.fixture
def register_scenario_layer(registry: LayerRegistry, scenarios_root: Path):
    def register(scenario_id: str, name: str):
        return registry.register_file(scenario_data(scenarios_root, scenario_id, name), name=name, source="scenario")

    return register
