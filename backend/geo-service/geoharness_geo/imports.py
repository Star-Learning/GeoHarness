from __future__ import annotations

import base64
import binascii
import re
import shutil
import stat
import uuid
import zipfile
from pathlib import Path, PurePosixPath
from typing import Any

import geopandas as gpd
import pandas as pd
import pyogrio

from .registry import LayerRegistry
from .workspace import WorkspaceStore


DEFAULT_UPLOAD_BYTES = 20 * 1024 * 1024
HARD_UPLOAD_BYTES = 100 * 1024 * 1024
MAX_ARCHIVE_FILES = 512
MAX_ARCHIVE_RATIO = 200
SAFE_FILE_NAME = re.compile(r'^[^<>:"/\\|?*\x00-\x1f]{1,180}$')
WINDOWS_RESERVED_NAMES = {"CON", "PRN", "AUX", "NUL", *(f"COM{index}" for index in range(1, 10)), *(f"LPT{index}" for index in range(1, 10))}
SHAPEFILE_EXTENSIONS = {
    ".shp", ".shx", ".dbf", ".prj", ".cpg", ".qix", ".sbn", ".sbx", ".shp.xml",
}


def import_capabilities(max_upload_bytes: int = DEFAULT_UPLOAD_BYTES) -> dict[str, Any]:
    return {
        "schema_version": "1.0",
        "max_file_bytes": max_upload_bytes,
        "hard_max_file_bytes": HARD_UPLOAD_BYTES,
        "formats": ["geojson", "shapefile_zip", "gpkg", "csv_lon_lat"],
        "extensions": [".geojson", ".json", ".zip", ".gpkg", ".csv"],
    }


def _validate_file_name(file_name: str) -> str:
    if (
        SAFE_FILE_NAME.fullmatch(file_name) is None
        or file_name in {".", ".."}
        or file_name != file_name.strip(" .")
        or file_name.split(".", 1)[0].upper() in WINDOWS_RESERVED_NAMES
    ):
        raise ValueError("Upload file_name must be a plain safe filename")
    extension = Path(file_name).suffix.lower()
    if extension not in {".geojson", ".json", ".zip", ".gpkg", ".csv"}:
        raise ValueError(f"Unsupported upload extension: {extension or '<none>'}")
    return extension


def _decode(content_base64: str, max_upload_bytes: int) -> bytes:
    if not 1 <= max_upload_bytes <= HARD_UPLOAD_BYTES:
        raise ValueError("Upload byte limit is outside the supported safety bounds")
    if len(content_base64) > ((max_upload_bytes + 2) // 3) * 4 + 4:
        raise ValueError(f"Upload exceeds the configured {max_upload_bytes} byte limit")
    try:
        content = base64.b64decode(content_base64, validate=True)
    except (binascii.Error, ValueError) as error:
        raise ValueError("Upload content_base64 is invalid") from error
    if len(content) == 0:
        raise ValueError("Upload file is empty")
    if len(content) > max_upload_bytes:
        raise ValueError(f"Upload exceeds the configured {max_upload_bytes} byte limit")
    return content


def _zip_member_path(name: str) -> PurePosixPath:
    normalized = name.replace("\\", "/")
    path = PurePosixPath(normalized)
    if path.is_absolute() or not path.parts or any(part in {"", ".", ".."} for part in path.parts):
        raise ValueError(f"Unsafe ZIP member path: {name}")
    if ":" in path.parts[0]:
        raise ValueError(f"Unsafe ZIP member path: {name}")
    return path


def _extract_shapefile(source: Path, destination: Path, source_layer: str | None, max_bytes: int) -> tuple[Path, str]:
    with zipfile.ZipFile(source) as archive:
        members = archive.infolist()
        if len(members) == 0 or len(members) > MAX_ARCHIVE_FILES:
            raise ValueError(f"Shapefile ZIP must contain 1-{MAX_ARCHIVE_FILES} entries")
        total_size = 0
        selected_members: list[tuple[zipfile.ZipInfo, PurePosixPath]] = []
        for info in members:
            path = _zip_member_path(info.filename)
            mode = info.external_attr >> 16
            if stat.S_ISLNK(mode):
                raise ValueError(f"ZIP symbolic links are not allowed: {info.filename}")
            if info.is_dir():
                continue
            lower_name = path.name.lower()
            extension = ".shp.xml" if lower_name.endswith(".shp.xml") else Path(lower_name).suffix
            if extension not in SHAPEFILE_EXTENSIONS:
                raise ValueError(f"Unsupported file in Shapefile ZIP: {info.filename}")
            total_size += info.file_size
            if total_size > min(max_bytes * 5, HARD_UPLOAD_BYTES * 2):
                raise ValueError("Shapefile ZIP expands beyond the configured safety limit")
            if info.file_size > 0 and (info.compress_size == 0 or info.file_size / info.compress_size > MAX_ARCHIVE_RATIO):
                raise ValueError(f"Suspicious ZIP compression ratio: {info.filename}")
            selected_members.append((info, path))
        for info, path in selected_members:
            target = (destination / Path(*path.parts)).resolve()
            if not target.is_relative_to(destination.resolve()):
                raise ValueError(f"Unsafe ZIP extraction target: {info.filename}")
            target.parent.mkdir(parents=True, exist_ok=True)
            with archive.open(info) as reader, target.open("wb") as writer:
                shutil.copyfileobj(reader, writer)

    shape_files = sorted(destination.rglob("*.shp")) + sorted(destination.rglob("*.SHP"))
    unique_shapes = list(dict.fromkeys(path.resolve() for path in shape_files))
    if source_layer is not None:
        requested = source_layer.replace("\\", "/").lower()
        candidates = [path for path in unique_shapes if path.name.lower() == requested or path.stem.lower() == requested]
        if len(candidates) != 1:
            raise ValueError(f"Shapefile layer {source_layer!r} was not found uniquely in the ZIP")
        selected = candidates[0]
    elif len(unique_shapes) == 1:
        selected = unique_shapes[0]
    else:
        names = ", ".join(path.name for path in unique_shapes) or "none"
        raise ValueError(f"Shapefile ZIP requires one explicit source_layer; available: {names}")
    return selected, selected.name


def _read_csv(
    source: Path,
    longitude_field: str | None,
    latitude_field: str | None,
    crs: str | None,
) -> tuple[gpd.GeoDataFrame, list[str], str]:
    table = pd.read_csv(source)
    longitude = longitude_field or next((name for name in ("longitude", "lon", "lng", "x") if name in table.columns), None)
    latitude = latitude_field or next((name for name in ("latitude", "lat", "y") if name in table.columns), None)
    if longitude is None or latitude is None or longitude not in table.columns or latitude not in table.columns:
        raise ValueError("CSV import requires valid longitude_field and latitude_field columns")
    x = pd.to_numeric(table[longitude], errors="coerce")
    y = pd.to_numeric(table[latitude], errors="coerce")
    valid = x.between(-180, 180) & y.between(-90, 90)
    dropped = int((~valid).sum())
    warnings = [] if dropped == 0 else [f"Dropped {dropped} rows with missing or out-of-range coordinates."]
    table = table.loc[valid].copy()
    if table.empty:
        raise ValueError("CSV contains no valid longitude/latitude rows")
    frame = gpd.GeoDataFrame(
        table,
        geometry=gpd.points_from_xy(x.loc[valid], y.loc[valid]),
        crs=crs or "EPSG:4326",
    )
    return frame, warnings, f"{longitude},{latitude}"


def _read_vector(
    source: Path,
    extension: str,
    extraction_root: Path,
    *,
    source_layer: str | None,
    longitude_field: str | None,
    latitude_field: str | None,
    crs: str | None,
    max_upload_bytes: int,
) -> tuple[gpd.GeoDataFrame, str, str | None, list[str]]:
    warnings: list[str] = []
    selected_layer = source_layer
    if extension in {".geojson", ".json"}:
        frame = gpd.read_file(source, engine="pyogrio")
        format_name = "geojson"
    elif extension == ".gpkg":
        available = [str(item[0]) for item in pyogrio.list_layers(source)]
        if selected_layer is None and len(available) == 1:
            selected_layer = available[0]
        if selected_layer is None or selected_layer not in available:
            raise ValueError(f"GeoPackage requires source_layer; available: {', '.join(available) or 'none'}")
        frame = gpd.read_file(source, layer=selected_layer, engine="pyogrio")
        format_name = "gpkg"
    elif extension == ".zip":
        selected, selected_layer = _extract_shapefile(source, extraction_root, selected_layer, max_upload_bytes)
        frame = gpd.read_file(selected, engine="pyogrio")
        format_name = "shapefile"
    else:
        frame, csv_warnings, selected_layer = _read_csv(source, longitude_field, latitude_field, crs)
        warnings.extend(csv_warnings)
        format_name = "csv"
    if frame.empty:
        raise ValueError("Imported vector layer contains no features")
    if frame.crs is None:
        raise ValueError("Imported vector layer has no CRS; provide source metadata before importing")
    null_geometry = int(frame.geometry.isna().sum())
    empty_geometry = int(frame.geometry.is_empty.sum())
    invalid_geometry = int((~frame.geometry.is_valid & frame.geometry.notna()).sum())
    if null_geometry:
        warnings.append(f"Layer contains {null_geometry} null geometries.")
    if empty_geometry:
        warnings.append(f"Layer contains {empty_geometry} empty geometries.")
    if invalid_geometry:
        warnings.append(f"Layer contains {invalid_geometry} invalid geometries.")
    return frame, format_name, selected_layer, warnings


def import_uploaded_layer(
    registry: LayerRegistry,
    workspace: WorkspaceStore,
    *,
    file_name: str,
    content_base64: str,
    name: str | None = None,
    source_layer: str | None = None,
    longitude_field: str | None = None,
    latitude_field: str | None = None,
    crs: str | None = None,
    max_upload_bytes: int = DEFAULT_UPLOAD_BYTES,
) -> dict[str, Any]:
    extension = _validate_file_name(file_name)
    content = _decode(content_base64, max_upload_bytes)
    if name is not None and (not name.strip() or len(name.strip()) > 120 or any(ord(char) < 32 for char in name)):
        raise ValueError("Imported Layer name must be 1-120 printable characters")
    for label, value, limit in (
        ("source_layer", source_layer, 180),
        ("longitude_field", longitude_field, 120),
        ("latitude_field", latitude_field, 120),
        ("crs", crs, 80),
    ):
        if value is not None and (not value.strip() or len(value.strip()) > limit):
            raise ValueError(f"{label} is outside the supported length")
    asset_id = f"import_{uuid.uuid4().hex}"
    staging = workspace.imports_root / f".{asset_id}.staging"
    final = workspace.imports_root / asset_id
    metadata = None
    try:
        staging.mkdir(parents=False, exist_ok=False)
        source = staging / file_name
        source.write_bytes(content)
        extraction = staging / "shapefile"
        frame, format_name, selected_layer, warnings = _read_vector(
            source,
            extension,
            extraction,
            source_layer=source_layer,
            longitude_field=longitude_field,
            latitude_field=latitude_field,
            crs=crs,
            max_upload_bytes=max_upload_bytes,
        )
        final_name = name.strip() if isinstance(name, str) and name.strip() else Path(file_name).stem
        staging.replace(final)
        metadata = registry.register(final_name, frame, source="upload")
        final_source = final / file_name
        workspace.sync_layers(registry.list_layers())
        workspace.record_import(
            asset_id=asset_id,
            file_name=file_name,
            format=format_name,
            relative_path=final_source.relative_to(workspace.root).as_posix(),
            size_bytes=len(content),
            layer_id=metadata.layer_id,
            source_layer=selected_layer,
            warnings=warnings,
        )
        fields = [
            {"name": column, "type": str(frame[column].dtype)}
            for column in frame.columns
            if column != frame.geometry.name
        ]
        import_asset = next(item for item in workspace.manifest().imports if item.asset_id == asset_id)
        return {
            "schema_version": "1.0",
            "metadata": metadata.model_dump(mode="json"),
            "format": format_name,
            "source_layer": selected_layer,
            "fields": fields,
            "warnings": warnings,
            "import_asset": import_asset.model_dump(mode="json"),
        }
    except Exception:
        if metadata is not None:
            registry.remove(metadata.layer_id)
            workspace.sync_layers(registry.list_layers())
        shutil.rmtree(final, ignore_errors=True)
        raise
    finally:
        shutil.rmtree(staging, ignore_errors=True)
