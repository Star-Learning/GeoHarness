from __future__ import annotations

import base64
import io
import json
from pathlib import Path

from PIL import Image
import pytest

from geoharness_geo.imagery import (
    classify_rgb_image,
    inspect_satellite_view,
    latest_imagery_inspection,
    latest_imagery_target,
    load_cached_place,
    rasterize_boundary_mask,
    resolve_administrative_boundary,
    save_imagery_view,
    set_imagery_preference,
)


def synthetic_scene(size: int = 256) -> Image.Image:
    image = Image.new("RGB", (size, size))
    half = size // 2
    image.paste((30, 70, 130), (0, 0, half, half))
    image.paste((40, 120, 45), (half, 0, size, half))
    image.paste((150, 115, 70), (0, half, half, size))
    image.paste((145, 145, 145), (half, half, size, size))
    return image


def encoded_scene() -> bytes:
    output = io.BytesIO()
    synthetic_scene().save(output, format="JPEG", quality=100)
    return output.getvalue()


def test_rgb_visual_screening_returns_four_bounded_pixel_classes():
    overlay, statistics, classified = classify_rgb_image(synthetic_scene())
    assert overlay.mode == "RGBA"
    assert classified == 1.0
    assert [item["category"] for item in statistics] == [
        "water", "vegetation", "built_up", "bare_ground"
    ]
    ratios = {item["category"]: item["pixel_ratio"] for item in statistics}
    assert 0.24 <= ratios["water"] <= 0.26
    assert 0.24 <= ratios["vegetation"] <= 0.26
    assert 0.24 <= ratios["bare_ground"] <= 0.26
    assert 0.24 <= ratios["built_up"] <= 0.26


def test_current_view_inspection_persists_real_preview_overlay_and_limitations(tmp_path: Path):
    save_imagery_view(tmp_path, {
        "bbox": [-74.02, 40.70, -73.98, 40.73],
        "zoom": 12,
    })
    payload = encoded_scene()
    requested: list[str] = []

    def fetch(url: str) -> bytes:
        requested.append(url)
        return payload

    result = inspect_satellite_view(tmp_path, step_id="visual-check", fetch=fetch)
    assert result.success is True
    assert result.tool == "inspect_satellite_view"
    assert result.outputs == []
    assert 1 <= result.data["tile_count"] <= 16
    assert requested and all(url.startswith("https://server.arcgisonline.com/") for url in requested)
    assert result.warnings and "Visual screening only" in result.warnings[0]

    latest = latest_imagery_inspection(tmp_path)
    assert latest is not None
    assert latest["inspection_id"] == result.data["inspection_id"]
    assert latest["bbox"] == [-74.02, 40.70, -73.98, 40.73]
    assert latest["overlay_layer"]["layer_type"] == "raster-overlay"
    assert latest["overlay_layer"]["visible"] is True
    assert latest["overlay_layer"]["opacity"] == 0.72
    assert base64.b64decode(latest["preview_base64"]).startswith(b"\xff\xd8")
    assert base64.b64decode(latest["overlay_base64"]).startswith(b"\x89PNG")


def test_named_place_uses_real_geocoder_extent_and_persists_raster_layer_preferences(tmp_path: Path):
    geocoder = json.dumps({
        "candidates": [{
            "address": "洪山区, 武汉市, 湖北省",
            "score": 99.2,
            "extent": {"xmin": 114.260, "ymin": 30.430, "xmax": 114.610, "ymax": 30.610},
            "location": {"x": 114.435, "y": 30.520},
            "attributes": {"LongLabel": "洪山区, 武汉市, 湖北省, CHN"},
        }],
    }).encode("utf-8")
    boundary = json.dumps({
        "type": "FeatureCollection",
        "features": [{
            "type": "Feature",
            "properties": {
                "display_name": "洪山区, 武汉市, 湖北省, 中国",
                "category": "boundary",
                "type": "administrative",
                "addresstype": "city",
                "osm_type": "relation",
                "osm_id": 3080399,
            },
            "geometry": {
                "type": "Polygon",
                "coordinates": [[
                    [114.18, 30.52], [114.38, 30.38], [114.64, 30.53],
                    [114.42, 30.70], [114.18, 30.52],
                ]],
            },
        }],
    }).encode("utf-8")
    requested: list[str] = []
    target_during_acquisition: list[dict] = []
    target_before_boundary: list[dict] = []

    def boundary_fetch(url: str) -> bytes:
        current = latest_imagery_target(tmp_path)
        assert current is not None
        target_before_boundary.append(current)
        return boundary

    def tile_fetch(url: str) -> bytes:
        requested.append(url)
        if not target_during_acquisition:
            current = latest_imagery_target(tmp_path)
            assert current is not None
            target_during_acquisition.append(current)
        return encoded_scene()

    result = inspect_satellite_view(
        tmp_path,
        step_id="hongshan-visual-check",
        place_name="武汉市洪山区",
        fetch=tile_fetch,
        geocode_fetch=lambda _: geocoder,
        boundary_fetch=boundary_fetch,
    )
    assert result.success is True
    # Address becomes visible before the potentially slow boundary request.
    assert target_before_boundary[0]["status"] == "resolving"
    assert target_before_boundary[0]["phase"] == "resolving-boundary"
    assert target_before_boundary[0]["bbox"] == [114.275, 30.43, 114.595, 30.61]
    assert target_before_boundary[0]["resolved_place"]["candidate_extent"] == [114.26, 30.43, 114.61, 30.61]
    assert "administrative_boundary" not in target_before_boundary[0]["resolved_place"]
    assert result.parameters["place_name"] == "武汉市洪山区"
    assert result.parameters["bbox"] == [114.18, 30.38, 114.64, 30.7]
    assert result.data["resolved_place"]["source"] == "Esri World Geocoding Service"
    assert "clipped to the OpenStreetMap administrative boundary" in result.data["resolved_place"]["coverage"]
    assert result.data["resolved_place"]["administrative_boundary"]["osm_id"] == 3080399
    assert "geometry" not in result.data["resolved_place"]["administrative_boundary"]
    assert result.data["boundary_clipped"] is True
    assert 0 < result.data["analysis_pixel_count"] < result.data["pixel_width"] * result.data["pixel_height"]
    assert 1 <= len(requested) <= 16
    assert target_during_acquisition[0]["status"] == "ready"
    assert target_during_acquisition[0]["phase"] == "acquiring-imagery"
    assert target_during_acquisition[0]["resolved_place"]["administrative_boundary"]["osm_id"] == 3080399

    target = latest_imagery_target(tmp_path)
    assert target is not None
    assert target["target_id"] == result.data["target_id"]
    assert target["status"] == "complete"
    assert target["progress"] == 1.0
    assert target["bbox"] == [114.18, 30.38, 114.64, 30.7]

    inspection_id = result.data["inspection_id"]
    preference = set_imagery_preference(
        tmp_path,
        inspection_id=inspection_id,
        visible=False,
        opacity=0.35,
    )
    assert preference["visible"] is False
    assert preference["opacity"] == 0.35
    latest = latest_imagery_inspection(tmp_path)
    assert latest is not None
    assert latest["overlay_layer"]["layer_id"] == f"raster_{inspection_id}"
    assert latest["overlay_layer"]["visible"] is False
    assert latest["overlay_layer"]["opacity"] == 0.35
    assert latest["analysis_scope"]["boundary_clipped"] is True
    assert latest["resolved_place"]["administrative_boundary"]["geometry"]["type"] == "Polygon"
    with Image.open(io.BytesIO(base64.b64decode(latest["overlay_base64"]))) as overlay:
        assert overlay.convert("RGBA").getpixel((0, 0))[3] == 0


def test_administrative_boundary_response_is_validated_and_rasterized():
    payload = json.dumps({
        "type": "FeatureCollection",
        "features": [{
            "type": "Feature",
            "properties": {
                "display_name": "Test district",
                "category": "boundary",
                "type": "administrative",
                "osm_type": "relation",
                "osm_id": 42,
            },
            "geometry": {
                "type": "Polygon",
                "coordinates": [[
                    [0.1, 0.5], [0.5, 0.1], [0.9, 0.5], [0.5, 0.9], [0.1, 0.5],
                ]],
            },
        }],
    }).encode("utf-8")
    boundary = resolve_administrative_boundary("Test district", fetch=lambda _: payload)
    assert boundary is not None
    assert boundary["source"] == "OpenStreetMap Nominatim"
    assert boundary["bbox"] == [0.1, 0.1, 0.9, 0.9]
    mask = rasterize_boundary_mask(boundary["geometry"], boundary["bbox"], (100, 100))
    values = list(mask.get_flattened_data())
    assert mask.getpixel((50, 50)) == 255
    assert mask.getpixel((0, 0)) < 128
    assert 4000 < sum(value >= 128 for value in values) < 6000


def test_explicit_real_boundary_cache_recomputes_results_from_new_tiles(tmp_path: Path):
    source = Path(__file__).resolve().parents[3] / "examples/topics/03-satellite-visual-inspection/data/hongshan-place-cache.json"
    root = tmp_path / "imagery"
    root.mkdir()
    (root / "place-cache.json").write_bytes(source.read_bytes())
    calls: list[str] = []
    payload = encoded_scene()

    def fetch(url: str) -> bytes:
        calls.append(url)
        return payload

    def unexpected_lookup(url: str) -> bytes:
        pytest.fail("Explicit public cache should not claim a fresh online lookup")

    first = inspect_satellite_view(tmp_path, step_id="cached-first", place_name="武汉市洪山区", fetch=fetch,
                                   geocode_fetch=unexpected_lookup, boundary_fetch=unexpected_lookup)
    assert first.success and first.data["boundary_clipped"]
    assert first.data["resolved_place"]["administrative_boundary"]["osm_id"] == 3080399
    assert first.data["resolved_place"]["administrative_boundary"]["coordinate_count"] == 702
    assert first.data["resolved_place"]["cache_provenance"]["mode"] == "explicit-session-cache"
    assert any("缓存" in text for text in first.warnings)
    assert len(calls) == first.data["tile_count"]
    previous_calls = len(calls)
    output = io.BytesIO()
    Image.new("RGB", (256, 256), (40, 120, 45)).save(output, format="JPEG")
    payload = output.getvalue()
    second = inspect_satellite_view(tmp_path, step_id="cached-second", place_name="武汉市洪山区", fetch=fetch,
                                    geocode_fetch=unexpected_lookup, boundary_fetch=unexpected_lookup)
    assert len(calls) - previous_calls == second.data["tile_count"]
    assert second.data["inspection_id"] != first.data["inspection_id"]
    assert second.data["categories"] != first.data["categories"]
    assert load_cached_place(tmp_path, "江苏省苏州市吴中区") is None
    with Image.open(io.BytesIO(base64.b64decode(latest_imagery_inspection(tmp_path)["overlay_base64"]))) as overlay:
        assert overlay.convert("RGBA").getpixel((0, 0))[3] == 0


def test_cache_requires_provenance_and_valid_geometry(tmp_path: Path):
    source = Path(__file__).resolve().parents[3] / "examples/topics/03-satellite-visual-inspection/data/hongshan-place-cache.json"
    cache = json.loads(source.read_text(encoding="utf-8"))
    root = tmp_path / "imagery"
    root.mkdir()
    cache["places"][0]["captured_at"] = ""
    (root / "place-cache.json").write_text(json.dumps(cache), encoding="utf-8")
    with pytest.raises(ValueError, match="provenance"):
        load_cached_place(tmp_path, "武汉市洪山区")
