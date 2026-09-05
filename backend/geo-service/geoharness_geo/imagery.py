from __future__ import annotations

import base64
import io
import json
import math
import os
import tempfile
import urllib.parse
import urllib.request
import uuid
from pathlib import Path
from typing import Any, Callable

import numpy as np
from PIL import Image, ImageDraw

from .models import ToolResult
from .workspace import atomic_write_json, utc_now


ESRI_TILE_ROOT = "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile"
ESRI_GEOCODE_ROOT = "https://geocode.arcgis.com/arcgis/rest/services/World/GeocodeServer/findAddressCandidates"
NOMINATIM_SEARCH_ROOT = "https://nominatim.openstreetmap.org/search"
ESRI_ATTRIBUTION = "Esri, Maxar, Earthstar Geographics, and the GIS User Community"
OSM_BOUNDARY_ATTRIBUTION = "OpenStreetMap contributors"
SUPPORTED_CATEGORIES = ("water", "vegetation", "built_up", "bare_ground")
COLOURS = {
    "water": (56, 189, 248, 166),
    "vegetation": (34, 197, 94, 166),
    "built_up": (167, 139, 250, 154),
    "bare_ground": (251, 146, 60, 166),
}
MAX_TILES = 16
MAX_OUTPUT_DIMENSION = 768
MAX_ASSET_BYTES = 4 * 1024 * 1024
MAX_BOUNDARY_BYTES = 2 * 1024 * 1024
MAX_BOUNDARY_COORDINATES = 50_000
DEFAULT_OVERLAY_OPACITY = 0.72
MAX_NAMED_VIEW_LONGITUDE_SPAN = 0.32
MAX_NAMED_VIEW_LATITUDE_SPAN = 0.24


def _imagery_root(workspace_root: Path) -> Path:
    root = (workspace_root / "imagery").resolve()
    if root.parent != workspace_root.resolve():
        raise ValueError("Unsafe imagery workspace path")
    root.mkdir(parents=True, exist_ok=True)
    return root


def _validated_bbox(value: Any) -> list[float]:
    if not isinstance(value, list) or len(value) != 4:
        raise ValueError("Imagery view bbox must contain west, south, east and north")
    bbox = [float(item) for item in value]
    if not all(math.isfinite(item) for item in bbox):
        raise ValueError("Imagery view bbox must be finite")
    west, south, east, north = bbox
    if not (-180 <= west < east <= 180 and -85.05112878 <= south < north <= 85.05112878):
        raise ValueError("Imagery view bbox is outside Web Mercator bounds")
    return bbox


def save_imagery_view(workspace_root: Path, value: dict[str, Any]) -> dict[str, Any]:
    bbox = _validated_bbox(value.get("bbox"))
    zoom = int(value.get("zoom", 0))
    if not 0 <= zoom <= 19:
        raise ValueError("Imagery view zoom must be between 0 and 19")
    payload = {
        "schema_version": "1.0",
        "source": "esri-world-imagery",
        "bbox": bbox,
        "zoom": zoom,
        "updated_at": utc_now(),
    }
    atomic_write_json(_imagery_root(workspace_root) / "view.json", payload)
    return payload


def _load_view(workspace_root: Path) -> dict[str, Any]:
    path = _imagery_root(workspace_root) / "view.json"
    if not path.is_file():
        raise ValueError("No current satellite map view is available; open the GeoHarness map first")
    value = json.loads(path.read_text(encoding="utf-8"))
    return {
        "schema_version": "1.0",
        "source": "esri-world-imagery",
        "bbox": _validated_bbox(value.get("bbox")),
        "zoom": int(value.get("zoom", 0)),
        "updated_at": str(value.get("updated_at", "")),
    }


def _save_imagery_target(workspace_root: Path, value: dict[str, Any]) -> dict[str, Any]:
    payload = {
        "schema_version": "1.0",
        **value,
        "updated_at": utc_now(),
    }
    atomic_write_json(_imagery_root(workspace_root) / "target.json", payload)
    return payload


def latest_imagery_target(workspace_root: Path) -> dict[str, Any] | None:
    root = (workspace_root / "imagery").resolve()
    if root.parent != workspace_root.resolve():
        raise ValueError("Unsafe imagery workspace path")
    path = root / "target.json"
    if not path.is_file():
        return None
    if path.stat().st_size > MAX_BOUNDARY_BYTES:
        raise ValueError("Imagery target exceeds the 2 MB bound")
    value = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(value, dict) or value.get("schema_version") != "1.0":
        raise ValueError("Imagery target is invalid")
    bbox = value.get("bbox")
    if bbox is not None:
        value["bbox"] = _validated_bbox(bbox)
    progress = float(value.get("progress", 0))
    if not math.isfinite(progress) or not 0 <= progress <= 1:
        raise ValueError("Imagery target progress is invalid")
    value["progress"] = progress
    return value


def geocode_place(
    place_name: str,
    *,
    fetch: Callable[[str], bytes] | None = None,
) -> dict[str, Any]:
    query = place_name.strip()
    if not query or len(query) > 160:
        raise ValueError("place_name must contain 1 to 160 characters")
    query_parameters = urllib.parse.urlencode({
        'SingleLine': query,
        'f': 'json',
        'outFields': 'LongLabel',
        'maxLocations': 1,
        'forStorage': 'false',
    })
    url = f"{ESRI_GEOCODE_ROOT}?{query_parameters}"
    if fetch is None:
        request = urllib.request.Request(url, headers={"User-Agent": "GeoHarness/1.0 visual-inspection"})
        with urllib.request.urlopen(request, timeout=15.0) as response:
            content_type = response.headers.get_content_type()
            payload = response.read(256 * 1024 + 1)
        if content_type not in {"application/json", "text/plain"} or len(payload) > 256 * 1024:
            raise ValueError("Esri geocoder returned an invalid bounded response")
    else:
        payload = fetch(url)
        if len(payload) > 256 * 1024:
            raise ValueError("Esri geocoder returned an oversized response")
    value = json.loads(payload.decode("utf-8"))
    candidates = value.get("candidates")
    if not isinstance(candidates, list) or not candidates:
        raise ValueError(f"Esri could not resolve place_name: {query}")
    candidate = candidates[0]
    score = float(candidate.get("score", 0))
    extent = candidate.get("extent")
    if score < 70 or not isinstance(extent, dict):
        raise ValueError(f"Esri returned no sufficiently precise extent for: {query}")
    candidate_extent = _validated_bbox([
        extent.get("xmin"), extent.get("ymin"), extent.get("xmax"), extent.get("ymax"),
    ])
    location = candidate.get("location") if isinstance(candidate.get("location"), dict) else {}
    center_x = float(location.get("x", (candidate_extent[0] + candidate_extent[2]) / 2))
    center_y = float(location.get("y", (candidate_extent[1] + candidate_extent[3]) / 2))
    if not math.isfinite(center_x) or not math.isfinite(center_y):
        raise ValueError(f"Esri returned an invalid candidate location for: {query}")
    longitude_span = min(candidate_extent[2] - candidate_extent[0], MAX_NAMED_VIEW_LONGITUDE_SPAN)
    latitude_span = min(candidate_extent[3] - candidate_extent[1], MAX_NAMED_VIEW_LATITUDE_SPAN)
    west = max(-180.0, center_x - longitude_span / 2)
    east = min(180.0, center_x + longitude_span / 2)
    south = max(-85.05112878, center_y - latitude_span / 2)
    north = min(85.05112878, center_y + latitude_span / 2)
    bbox = _validated_bbox([west, south, east, north])
    return {
        "query": query,
        "label": str(candidate.get("address") or candidate.get("attributes", {}).get("LongLabel") or query),
        "score": round(score, 3),
        "bbox": bbox,
        "candidate_location": [center_x, center_y],
        "candidate_extent": candidate_extent,
        "coverage": "bounded map view centred on the Esri candidate; not an official administrative boundary",
        "source": "Esri World Geocoding Service",
    }


def _boundary_positions(value: Any, positions: list[tuple[float, float]]) -> None:
    if not isinstance(value, list):
        raise ValueError("Administrative boundary coordinates must be arrays")
    if len(value) >= 2 and isinstance(value[0], (int, float)) and isinstance(value[1], (int, float)):
        longitude = float(value[0])
        latitude = float(value[1])
        if not math.isfinite(longitude) or not math.isfinite(latitude):
            raise ValueError("Administrative boundary coordinates must be finite")
        if not -180 <= longitude <= 180 or not -85.05112878 <= latitude <= 85.05112878:
            raise ValueError("Administrative boundary coordinates are outside Web Mercator bounds")
        positions.append((longitude, latitude))
        if len(positions) > MAX_BOUNDARY_COORDINATES:
            raise ValueError("Administrative boundary contains too many coordinates")
        return
    for child in value:
        _boundary_positions(child, positions)


def _validated_boundary_geometry(value: Any) -> tuple[dict[str, Any], list[float], int]:
    if not isinstance(value, dict) or value.get("type") not in {"Polygon", "MultiPolygon"}:
        raise ValueError("Administrative boundary must be a Polygon or MultiPolygon")
    coordinates = value.get("coordinates")
    positions: list[tuple[float, float]] = []
    _boundary_positions(coordinates, positions)
    if len(positions) < 4:
        raise ValueError("Administrative boundary is empty")
    longitudes = [item[0] for item in positions]
    latitudes = [item[1] for item in positions]
    bbox = _validated_bbox([min(longitudes), min(latitudes), max(longitudes), max(latitudes)])
    return {"type": value["type"], "coordinates": coordinates}, bbox, len(positions)


def resolve_administrative_boundary(
    place_name: str,
    *,
    fetch: Callable[[str], bytes] | None = None,
) -> dict[str, Any] | None:
    query = place_name.strip()
    if not query or len(query) > 160:
        raise ValueError("place_name must contain 1 to 160 characters")
    query_parameters = urllib.parse.urlencode({
        "q": query,
        "format": "geojson",
        "polygon_geojson": 1,
        "polygon_threshold": 0.0005,
        "addressdetails": 1,
        "namedetails": 1,
        "limit": 5,
    })
    url = f"{NOMINATIM_SEARCH_ROOT}?{query_parameters}"
    if fetch is None:
        request = urllib.request.Request(url, headers={
            "User-Agent": "GeoHarness/1.0 administrative-boundary",
            "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.6",
        })
        with urllib.request.urlopen(request, timeout=20.0) as response:
            content_type = response.headers.get_content_type()
            payload = response.read(MAX_BOUNDARY_BYTES + 1)
        if content_type not in {"application/json", "application/geo+json", "text/plain"}:
            raise ValueError("OpenStreetMap boundary service returned an invalid response")
    else:
        payload = fetch(url)
    if len(payload) > MAX_BOUNDARY_BYTES:
        raise ValueError("OpenStreetMap boundary response exceeds the 2 MB bound")
    value = json.loads(payload.decode("utf-8"))
    features = value.get("features") if isinstance(value, dict) else None
    if not isinstance(features, list):
        raise ValueError("OpenStreetMap boundary response is not a FeatureCollection")
    ranked = sorted(
        (feature for feature in features if isinstance(feature, dict)),
        key=lambda feature: (
            0 if feature.get("properties", {}).get("category") == "boundary" else 1,
            0 if feature.get("properties", {}).get("type") == "administrative" else 1,
        ),
    )
    for feature in ranked:
        try:
            geometry, bbox, coordinate_count = _validated_boundary_geometry(feature.get("geometry"))
        except ValueError:
            continue
        properties = feature.get("properties") if isinstance(feature.get("properties"), dict) else {}
        if properties.get("category") != "boundary" and properties.get("type") != "administrative":
            continue
        return {
            "label": str(properties.get("display_name") or query),
            "bbox": bbox,
            "geometry": geometry,
            "coordinate_count": coordinate_count,
            "category": str(properties.get("category") or "boundary"),
            "type": str(properties.get("type") or "administrative"),
            "addresstype": str(properties.get("addresstype") or ""),
            "osm_type": str(properties.get("osm_type") or ""),
            "osm_id": int(properties["osm_id"]) if isinstance(properties.get("osm_id"), (int, float)) else None,
            "source": "OpenStreetMap Nominatim",
            "attribution": OSM_BOUNDARY_ATTRIBUTION,
            "license": "Open Data Commons Open Database License (ODbL) 1.0",
            "license_url": "https://www.openstreetmap.org/copyright",
        }
    return None


def load_cached_place(workspace_root: Path, query: str) -> dict[str, Any] | None:
    """Only use an explicitly imported, session-local public place cache.

    No cross-session discovery and no cached imagery or classification results.
    Missing queries still use the normal online path.
    """
    root = _imagery_root(workspace_root)
    path = root / "place-cache.json"
    if not path.is_file():
        return None
    if path.resolve().parent != root or path.stat().st_size > MAX_BOUNDARY_BYTES:
        raise ValueError("Unsafe or oversized place cache")
    cache = json.loads(path.read_text(encoding="utf-8"))
    if cache.get("schema_version") != "1.0" or not isinstance(cache.get("places"), list):
        raise ValueError("Invalid place cache schema")
    for entry in cache["places"]:
        if entry.get("query") != query.strip():
            continue
        place = entry["resolved_place"]
        _validated_bbox(place["candidate_extent"])
        boundary = place["administrative_boundary"]
        geometry, bbox, count = _validated_boundary_geometry(boundary["geometry"])
        if place.get("source") != "Esri World Geocoding Service" or boundary.get("source") != "OpenStreetMap Nominatim":
            raise ValueError("Place cache must retain its original public sources")
        if not entry.get("captured_at") or not entry.get("source_session"):
            raise ValueError("Place cache is missing provenance")
        place["administrative_boundary"] = {**boundary, "geometry": geometry, "bbox": bbox, "coordinate_count": count}
        place["cache_provenance"] = {
            "mode": "explicit-session-cache",
            "captured_at": entry["captured_at"],
            "source_session": entry["source_session"],
            "note": "地名与行政边界使用历史真实缓存；影像重新请求，分类重新计算。",
        }
        place["bbox"] = bbox
        return place
    return None


def _boundary_polygons(geometry: dict[str, Any]) -> list[list[Any]]:
    coordinates = geometry["coordinates"]
    return [coordinates] if geometry["type"] == "Polygon" else coordinates


def rasterize_boundary_mask(
    geometry: dict[str, Any],
    bbox: list[float],
    size: tuple[int, int],
) -> Image.Image:
    geometry, _, _ = _validated_boundary_geometry(geometry)
    west, south, east, north = _validated_bbox(bbox)
    width, height = size
    if width < 1 or height < 1:
        raise ValueError("Administrative boundary mask requires a positive image size")
    antialias = 2
    left = _longitude_tile(west, 0)
    right = _longitude_tile(east, 0)
    top = _latitude_tile(north, 0)
    bottom = _latitude_tile(south, 0)
    mask = Image.new("L", (width * antialias, height * antialias), 0)
    draw = ImageDraw.Draw(mask)

    def projected_ring(ring: Any) -> list[tuple[float, float]]:
        if not isinstance(ring, list):
            return []
        projected: list[tuple[float, float]] = []
        for item in ring:
            if not isinstance(item, list) or len(item) < 2:
                continue
            longitude, latitude = float(item[0]), float(item[1])
            x = (_longitude_tile(longitude, 0) - left) / max(right - left, 1e-12) * width * antialias
            y = (_latitude_tile(latitude, 0) - top) / max(bottom - top, 1e-12) * height * antialias
            projected.append((x, y))
        return projected

    for polygon in _boundary_polygons(geometry):
        if not isinstance(polygon, list) or not polygon:
            continue
        exterior = projected_ring(polygon[0])
        if len(exterior) >= 3:
            draw.polygon(exterior, fill=255)
        for hole in polygon[1:]:
            projected_hole = projected_ring(hole)
            if len(projected_hole) >= 3:
                draw.polygon(projected_hole, fill=0)
    mask = mask.resize((width, height), Image.Resampling.LANCZOS)
    if not np.asarray(mask, dtype=np.uint8).any():
        raise ValueError("Administrative boundary produced an empty imagery mask")
    return mask


def _overlay_layer(inspection_id: str, value: Any = None) -> dict[str, Any]:
    current = value if isinstance(value, dict) else {}
    visible = current.get("visible", True)
    opacity = current.get("opacity", DEFAULT_OVERLAY_OPACITY)
    return {
        "layer_id": f"raster_{inspection_id}",
        "name": "Satellite visual screening mask",
        "layer_type": "raster-overlay",
        "source": "derived",
        "visible": visible if isinstance(visible, bool) else True,
        "opacity": float(opacity) if isinstance(opacity, (int, float)) and not isinstance(opacity, bool)
        and math.isfinite(float(opacity)) and 0 <= float(opacity) <= 1 else DEFAULT_OVERLAY_OPACITY,
    }


def _longitude_tile(longitude: float, zoom: int) -> float:
    return (longitude + 180.0) / 360.0 * (2**zoom)


def _latitude_tile(latitude: float, zoom: int) -> float:
    clamped = max(-85.05112878, min(85.05112878, latitude))
    radians = math.radians(clamped)
    return (1.0 - math.asinh(math.tan(radians)) / math.pi) / 2.0 * (2**zoom)


def _tile_window(bbox: list[float], requested_zoom: int) -> tuple[int, float, float, float, float, int, int, int, int]:
    west, south, east, north = bbox
    zoom = requested_zoom
    while True:
        left = _longitude_tile(west, zoom)
        right = _longitude_tile(east, zoom)
        top = _latitude_tile(north, zoom)
        bottom = _latitude_tile(south, zoom)
        x0, x1 = math.floor(left), max(math.floor(left), math.ceil(right) - 1)
        y0, y1 = math.floor(top), max(math.floor(top), math.ceil(bottom) - 1)
        if (x1 - x0 + 1) * (y1 - y0 + 1) <= MAX_TILES or zoom == 0:
            return zoom, left, top, right, bottom, x0, y0, x1, y1
        zoom -= 1


def _download_tile(url: str, timeout: float = 15.0) -> bytes:
    request = urllib.request.Request(url, headers={"User-Agent": "GeoHarness/1.0 visual-inspection"})
    with urllib.request.urlopen(request, timeout=timeout) as response:
        content_type = response.headers.get_content_type()
        content = response.read(1024 * 1024 + 1)
    if not content_type.startswith("image/") or len(content) > 1024 * 1024:
        raise ValueError("Satellite tile response is not a bounded image")
    return content


def acquire_current_view(
    bbox: list[float],
    requested_zoom: int,
    *,
    fetch: Callable[[str], bytes] = _download_tile,
) -> tuple[Image.Image, dict[str, Any]]:
    zoom, left, top, right, bottom, x0, y0, x1, y1 = _tile_window(bbox, requested_zoom)
    mosaic = Image.new("RGB", ((x1 - x0 + 1) * 256, (y1 - y0 + 1) * 256))
    tile_urls: list[str] = []
    for tile_y in range(y0, y1 + 1):
        for tile_x in range(x0, x1 + 1):
            source_x = tile_x % (2**zoom)
            url = f"{ESRI_TILE_ROOT}/{zoom}/{tile_y}/{source_x}"
            tile_urls.append(url)
            with Image.open(io.BytesIO(fetch(url))) as tile:
                mosaic.paste(tile.convert("RGB").resize((256, 256)), ((tile_x - x0) * 256, (tile_y - y0) * 256))
    crop = (
        max(0, int(round((left - x0) * 256))),
        max(0, int(round((top - y0) * 256))),
        min(mosaic.width, int(round((right - x0) * 256))),
        min(mosaic.height, int(round((bottom - y0) * 256))),
    )
    if crop[2] <= crop[0] or crop[3] <= crop[1]:
        raise ValueError("Current map view produced an empty satellite crop")
    image = mosaic.crop(crop)
    scale = min(1.0, MAX_OUTPUT_DIMENSION / max(image.size))
    if scale < 1:
        image = image.resize((max(1, round(image.width * scale)), max(1, round(image.height * scale))), Image.Resampling.LANCZOS)
    return image, {
        "tile_zoom": zoom,
        "tile_count": len(tile_urls),
        "pixel_width": image.width,
        "pixel_height": image.height,
        "tile_urls": tile_urls,
    }


def classify_rgb_image(
    image: Image.Image,
    categories: list[str] | None = None,
    analysis_mask: Image.Image | None = None,
) -> tuple[Image.Image, list[dict[str, Any]], float]:
    selected = list(dict.fromkeys(categories or SUPPORTED_CATEGORIES))
    if not selected or any(category not in SUPPORTED_CATEGORIES for category in selected):
        raise ValueError(f"focus_categories must use: {', '.join(SUPPORTED_CATEGORIES)}")
    values = np.asarray(image.convert("RGB"), dtype=np.int16)
    red, green, blue = values[..., 0], values[..., 1], values[..., 2]
    brightness = (red + green + blue) / 3.0
    saturation = values.max(axis=2) - values.min(axis=2)
    grey = (red * 0.299 + green * 0.587 + blue * 0.114)
    edge = np.zeros_like(grey)
    edge[:, 1:] += np.abs(grey[:, 1:] - grey[:, :-1])
    edge[1:, :] += np.abs(grey[1:, :] - grey[:-1, :])

    active = np.ones((image.height, image.width), dtype=bool) if analysis_mask is None else (
        np.asarray(analysis_mask.convert("L").resize(image.size), dtype=np.uint8) >= 128
    )
    active_count = int(active.sum())
    if active_count < 1:
        raise ValueError("Visual inspection mask contains no active pixels")
    masks: dict[str, np.ndarray] = {}
    masks["vegetation"] = (green - red > 10) & (green - blue > 5) & (green > 48)
    masks["water"] = (~masks["vegetation"]) & (blue - red > 7) & (blue - green > 2) & (brightness < 170)
    masks["bare_ground"] = (~masks["vegetation"]) & (~masks["water"]) & (red - blue > 16) & (green - blue > 7) & (brightness > 72) & (saturation > 18)
    masks["built_up"] = (~masks["vegetation"]) & (~masks["water"]) & (~masks["bare_ground"]) & (brightness > 58) & (brightness < 235) & ((saturation < 38) | (edge > 25))
    masks = {category: mask & active for category, mask in masks.items()}

    overlay = np.zeros((image.height, image.width, 4), dtype=np.uint8)
    statistics: list[dict[str, Any]] = []
    classified = np.zeros((image.height, image.width), dtype=bool)
    for category in selected:
        mask = masks[category]
        classified |= mask
        count = int(mask.sum())
        if category == "vegetation":
            margin = np.maximum(0, green - np.maximum(red, blue))[mask]
        elif category == "water":
            margin = np.maximum(0, blue - np.maximum(red, green))[mask]
        elif category == "bare_ground":
            margin = np.maximum(0, red - blue)[mask]
        else:
            margin = np.maximum(0, edge)[mask]
        confidence = 0.0 if count == 0 else min(0.84, 0.5 + float(np.mean(margin)) / 160.0)
        overlay[mask] = COLOURS[category]
        statistics.append({
            "category": category,
            "pixel_count": count,
            "pixel_ratio": round(count / active_count, 6),
            "heuristic_confidence": round(confidence, 3),
        })
    if analysis_mask is not None:
        edge_alpha = np.asarray(analysis_mask.convert("L").resize(image.size), dtype=np.uint16)
        overlay[..., 3] = ((overlay[..., 3].astype(np.uint16) * edge_alpha) // 255).astype(np.uint8)
    return Image.fromarray(overlay, mode="RGBA"), statistics, round(float(classified.sum()) / active_count, 6)


def _atomic_save_image(path: Path, image: Image.Image, format_name: str, **options: Any) -> None:
    temporary: Path | None = None
    try:
        with tempfile.NamedTemporaryFile(dir=path.parent, prefix=f".{path.name}.", suffix=".tmp", delete=False) as handle:
            temporary = Path(handle.name)
        image.save(temporary, format=format_name, **options)
        os.replace(temporary, path)
    finally:
        if temporary is not None:
            temporary.unlink(missing_ok=True)


def inspect_satellite_view(
    workspace_root: Path,
    *,
    step_id: str | None,
    focus_categories: list[str] | None = None,
    place_name: str | None = None,
    fetch: Callable[[str], bytes] = _download_tile,
    geocode_fetch: Callable[[str], bytes] | None = None,
    boundary_fetch: Callable[[str], bytes] | None = None,
) -> ToolResult:
    target_id = f"target-{uuid.uuid4().hex[:16]}"
    if place_name is not None:
        _save_imagery_target(workspace_root, {
            "target_id": target_id,
            "step_id": str(step_id or "inspect_satellite_view"),
            "query": place_name.strip(),
            "status": "resolving",
            "phase": "resolving-place",
            "progress": 0.08,
            "message": "正在解析目标位置与行政区边界",
            "bbox": None,
            "resolved_place": None,
        })
    cached_place = load_cached_place(workspace_root, place_name) if place_name is not None else None
    resolved_place = cached_place or (geocode_place(place_name, fetch=geocode_fetch) if place_name is not None else None)
    cached_boundary = None if cached_place is None else cached_place.pop("administrative_boundary")
    boundary_error: str | None = None
    if resolved_place is not None:
        _save_imagery_target(workspace_root, {
            "target_id": target_id,
            "step_id": str(step_id or "inspect_satellite_view"),
            "query": place_name.strip(),
            "status": "resolving",
            "phase": "resolving-boundary",
            "progress": 0.18,
            "message": "地址已定位，正在查询行政区边界" if cached_place is None else "已读取地名缓存，正在校验真实行政边界缓存",
            "bbox": resolved_place["bbox"],
            "resolved_place": resolved_place,
        })
        try:
            boundary = cached_boundary if cached_place is not None else resolve_administrative_boundary(place_name or resolved_place["query"], fetch=boundary_fetch)
        except Exception as error:
            boundary = None
            boundary_error = str(error)[:300]
        resolved_place["administrative_boundary"] = boundary
        resolved_place["boundary_resolution_error"] = boundary_error
        if boundary is not None:
            resolved_place["bbox"] = boundary["bbox"]
            resolved_place["coverage"] = (
                "imagery, overlay and pixel statistics clipped to the OpenStreetMap administrative boundary"
            )
    view = _load_view(workspace_root) if resolved_place is None else {
        "schema_version": "1.0",
        "source": "esri-world-geocoding",
        "bbox": resolved_place["bbox"],
        "zoom": 12,
        "updated_at": utc_now(),
    }
    _save_imagery_target(workspace_root, {
        "target_id": target_id,
        "step_id": str(step_id or "inspect_satellite_view"),
        "query": None if place_name is None else place_name.strip(),
        "status": "ready",
        "phase": "acquiring-imagery",
        "progress": 0.3,
        "message": "已锁定分析区域，正在获取卫星影像",
        "bbox": view["bbox"],
        "resolved_place": resolved_place,
    })
    image, acquisition = acquire_current_view(view["bbox"], view["zoom"], fetch=fetch)
    _save_imagery_target(workspace_root, {
        "target_id": target_id,
        "step_id": str(step_id or "inspect_satellite_view"),
        "query": None if place_name is None else place_name.strip(),
        "status": "ready",
        "phase": "classifying-pixels",
        "progress": 0.7,
        "message": "影像获取完成，正在进行区内像素巡检",
        "bbox": view["bbox"],
        "resolved_place": resolved_place,
        "tile_count": acquisition["tile_count"],
        "tile_zoom": acquisition["tile_zoom"],
    })
    administrative_boundary = None if resolved_place is None else resolved_place.get("administrative_boundary")
    boundary_mask = None if administrative_boundary is None else rasterize_boundary_mask(
        administrative_boundary["geometry"], view["bbox"], image.size,
    )
    overlay, statistics, classified_ratio = classify_rgb_image(image, focus_categories, boundary_mask)
    analysis_pixel_count = image.width * image.height if boundary_mask is None else int(
        (np.asarray(boundary_mask, dtype=np.uint8) >= 128).sum()
    )
    root = _imagery_root(workspace_root)
    inspection_id = f"inspection-{uuid.uuid4().hex[:16]}"
    overlay_layer = _overlay_layer(inspection_id)
    _save_imagery_target(workspace_root, {
        "target_id": target_id,
        "step_id": str(step_id or "inspect_satellite_view"),
        "query": None if place_name is None else place_name.strip(),
        "status": "ready",
        "phase": "finalizing-result",
        "progress": 0.9,
        "message": "巡检计算完成，正在生成蒙版与统计结果",
        "bbox": view["bbox"],
        "resolved_place": resolved_place,
        "tile_count": acquisition["tile_count"],
        "tile_zoom": acquisition["tile_zoom"],
    })
    preview_path = root / f"{inspection_id}-preview.jpg"
    overlay_path = root / f"{inspection_id}-overlay.png"
    _atomic_save_image(preview_path, image, "JPEG", quality=88, optimize=True)
    _atomic_save_image(overlay_path, overlay, "PNG", optimize=True)
    if preview_path.stat().st_size > MAX_ASSET_BYTES or overlay_path.stat().st_size > MAX_ASSET_BYTES:
        preview_path.unlink(missing_ok=True)
        overlay_path.unlink(missing_ok=True)
        raise ValueError("Visual inspection asset exceeds the 4 MB bound")
    record = {
        "schema_version": "1.0",
        "inspection_id": inspection_id,
        "target_id": target_id,
        "target_step_id": str(step_id or "inspect_satellite_view"),
        "created_at": utc_now(),
        "source": "Esri World Imagery display tiles",
        "attribution": ESRI_ATTRIBUTION,
        "bbox": view["bbox"],
        "requested_zoom": view["zoom"],
        **{key: value for key, value in acquisition.items() if key != "tile_urls"},
        "preview_path": preview_path.name,
        "overlay_path": overlay_path.name,
        "overlay_layer": overlay_layer,
        "resolved_place": resolved_place,
        "analysis_scope": {
            "type": "administrative-boundary" if administrative_boundary is not None else "map-view",
            "boundary_clipped": administrative_boundary is not None,
            "analysis_pixel_count": analysis_pixel_count,
            "boundary_source": None if administrative_boundary is None else administrative_boundary["source"],
            "boundary_label": None if administrative_boundary is None else administrative_boundary["label"],
        },
        "categories": statistics,
        "classified_pixel_ratio": classified_ratio,
        "method": "bounded RGB colour-dominance and edge heuristics",
        "limitations": [
            *([] if cached_place is None else [
                f"地名与行政边界来自 {cached_place['cache_provenance']['captured_at']} 的真实历史缓存；本次重新请求影像并重新计算分类，不代表在线边界更新。"
            ]),
            "Visual screening only: the RGB basemap is not radiometrically calibrated source imagery.",
            "Tile acquisition date and sensor may vary within the view; results are not change detection.",
            "Pixel ratios are display-pixel shares, not geodesic area measurements.",
            *([] if resolved_place is None else [(
                "Named-place imagery and statistics are clipped to the OpenStreetMap administrative boundary; "
                "verify against the responsible authority for legal or official use."
                if administrative_boundary is not None else
                "No polygonal administrative boundary was available; named-place coverage uses a bounded Esri candidate-centred map view."
            )]),
            *([] if boundary_error is None else [f"Administrative boundary lookup failed: {boundary_error}"]),
        ],
    }
    atomic_write_json(root / "latest.json", record)
    _save_imagery_target(workspace_root, {
        "target_id": target_id,
        "step_id": str(step_id or "inspect_satellite_view"),
        "query": None if place_name is None else place_name.strip(),
        "status": "complete",
        "phase": "complete",
        "progress": 1.0,
        "message": "巡检完成，结果已加载到地图",
        "bbox": view["bbox"],
        "resolved_place": resolved_place,
        "tile_count": acquisition["tile_count"],
        "tile_zoom": acquisition["tile_zoom"],
        "inspection_id": inspection_id,
    })
    retained = sorted(root.glob("inspection-*-overlay.png"), key=lambda path: path.stat().st_mtime, reverse=True)
    for stale in retained[6:]:
        stale.unlink(missing_ok=True)
        stale.with_name(stale.name.replace("-overlay.png", "-preview.jpg")).unlink(missing_ok=True)
    return ToolResult(
        success=True,
        tool="inspect_satellite_view",
        step_id=step_id,
        inputs=[],
        parameters={
            "focus_categories": focus_categories or list(SUPPORTED_CATEGORIES),
            "place_name": place_name,
            "bbox": view["bbox"],
            "zoom": view["zoom"],
        },
        outputs=[],
        summary=(
            f"Inspected {analysis_pixel_count} in-boundary RGB pixels from {resolved_place['label']}; "
            f"{classified_ratio:.1%} received a preliminary visual class."
            if administrative_boundary is not None and resolved_place is not None else
            f"Inspected {image.width}×{image.height} RGB pixels from {resolved_place['label'] if resolved_place is not None else 'the current satellite view'}; {classified_ratio:.1%} received a preliminary visual class."
        ),
        warnings=record["limitations"],
        data={
            "inspection_id": inspection_id,
            "target_id": target_id,
            "bbox": view["bbox"],
            "tile_zoom": acquisition["tile_zoom"],
            "tile_count": acquisition["tile_count"],
            "pixel_width": image.width,
            "pixel_height": image.height,
            "analysis_pixel_count": analysis_pixel_count,
            "boundary_clipped": administrative_boundary is not None,
            "classified_pixel_ratio": classified_ratio,
            "categories": statistics,
            "method": record["method"],
            "source": record["source"],
            "attribution": record["attribution"],
            "resolved_place": None if resolved_place is None else {
                **resolved_place,
                "administrative_boundary": None if administrative_boundary is None else {
                    key: value for key, value in administrative_boundary.items() if key != "geometry"
                },
            },
            "overlay_layer": overlay_layer,
        },
    )


def latest_imagery_inspection(workspace_root: Path) -> dict[str, Any] | None:
    root = _imagery_root(workspace_root)
    path = root / "latest.json"
    if not path.is_file():
        return None
    record = json.loads(path.read_text(encoding="utf-8"))
    record["overlay_layer"] = _overlay_layer(str(record.get("inspection_id", "inspection-unknown")), record.get("overlay_layer"))
    assets: dict[str, str] = {}
    for kind, key in (("preview", "preview_path"), ("overlay", "overlay_path")):
        asset = (root / str(record.get(key, ""))).resolve()
        if not asset.is_relative_to(root) or not asset.is_file() or asset.stat().st_size > MAX_ASSET_BYTES:
            raise ValueError(f"Imagery {kind} asset is unsafe or missing")
        assets[f"{kind}_mime_type"] = "image/jpeg" if kind == "preview" else "image/png"
        assets[f"{kind}_base64"] = base64.b64encode(asset.read_bytes()).decode("ascii")
    return {**record, **assets}


def set_imagery_preference(
    workspace_root: Path,
    *,
    inspection_id: str,
    visible: bool | None = None,
    opacity: float | None = None,
) -> dict[str, Any]:
    root = _imagery_root(workspace_root)
    path = root / "latest.json"
    if not path.is_file():
        raise ValueError("No satellite inspection overlay is available")
    record = json.loads(path.read_text(encoding="utf-8"))
    if record.get("inspection_id") != inspection_id:
        raise ValueError("Satellite inspection overlay is not the current Session layer")
    if visible is None and opacity is None:
        raise ValueError("Imagery preference requires visible and/or opacity")
    if visible is not None and not isinstance(visible, bool):
        raise ValueError("Imagery overlay visibility must be boolean")
    if opacity is not None and (isinstance(opacity, bool) or not math.isfinite(float(opacity)) or not 0 <= float(opacity) <= 1):
        raise ValueError("Imagery overlay opacity must be between 0 and 1")
    layer = _overlay_layer(inspection_id, record.get("overlay_layer"))
    if visible is not None:
        layer["visible"] = visible
    if opacity is not None:
        layer["opacity"] = float(opacity)
    record["overlay_layer"] = layer
    atomic_write_json(path, record)
    return layer


def clear_imagery(workspace_root: Path) -> None:
    root = _imagery_root(workspace_root)
    for child in root.iterdir():
        if not child.is_file() or child.is_symlink():
            raise ValueError(f"Unexpected imagery workspace asset: {child}")
        child.unlink()
