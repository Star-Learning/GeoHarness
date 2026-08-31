from __future__ import annotations

import copy
import importlib.util
from pathlib import Path

import pytest
from shapely.affinity import translate
from shapely.geometry import mapping, shape


REPOSITORY_ROOT = Path(__file__).resolve().parents[3]
SCRIPT_PATH = REPOSITORY_ROOT / "scripts" / "build_scenarios" / "prepare-official-data.py"
SPEC = importlib.util.spec_from_file_location("geoharness_prepare_official_data", SCRIPT_PATH)
assert SPEC is not None and SPEC.loader is not None
PREPARATION = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(PREPARATION)


def test_official_scenario_freshness_is_spatially_strict_but_cross_platform():
    collections, statistics = PREPARATION.build_payloads(PREPARATION.read_sources())
    PREPARATION.verify_derived_payloads(collections, statistics)

    changed_statistics = {**statistics, "road_300m_candidate_count": 0}
    with pytest.raises(ValueError, match="statistics.json"):
        PREPARATION.verify_derived_payloads(collections, changed_statistics)

    changed_collections = copy.deepcopy(collections)
    changed_collections["buildings"]["features"][0]["properties"]["name"] = "changed"
    with pytest.raises(ValueError, match="stale properties"):
        PREPARATION.verify_derived_payloads(changed_collections, statistics)

    changed_geometry = copy.deepcopy(collections)
    feature = changed_geometry["buildings"]["features"][0]
    feature["geometry"] = mapping(translate(shape(feature["geometry"]), xoff=0.001))
    with pytest.raises(ValueError, match="stale geometry coordinates"):
        PREPARATION.verify_derived_payloads(changed_geometry, statistics)
