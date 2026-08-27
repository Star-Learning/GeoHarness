from __future__ import annotations

from pathlib import Path

from fastapi.testclient import TestClient

from geoharness_geo import TOOL_NAMES, create_app


def test_geo_service_health_import_layer_tool_and_geojson(tmp_path: Path, scenarios_root: Path):
    app = create_app(tmp_path / "api-workspace", allowed_import_roots=[scenarios_root])
    client = TestClient(app)

    health = client.get("/health")
    assert health.status_code == 200
    assert health.json()["status"] == "ok"
    assert health.json()["tools"] == list(TOOL_NAMES)

    forbidden = client.post("/layers/import", json={"path": str(tmp_path / "outside.geojson")})
    assert forbidden.status_code == 403

    source = scenarios_root / "01-building-data-inspection" / "data" / "buildings.geojson"
    imported = client.post("/layers/import", json={"path": str(source), "name": "buildings"})
    assert imported.status_code == 200
    layer_id = imported.json()["layer_id"]

    inspected = client.post(
        "/tools/inspect_dataset",
        json={"step_id": "api-inspect", "parameters": {"input_layer": layer_id}},
    )
    assert inspected.status_code == 200
    assert inspected.json()["success"] is True
    assert inspected.json()["data"]["feature_count"] == 360

    geojson = client.get(f"/layers/{layer_id}/geojson")
    assert geojson.status_code == 200
    assert len(geojson.json()["features"]) == 360
    assert client.get("/layers/layer_missing").status_code == 404

    unknown = client.post("/tools/no_such_tool", json={"parameters": {}})
    assert unknown.status_code == 200
    assert unknown.json()["success"] is False
