from __future__ import annotations

import json
import math
import os
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterable

import geopandas as gpd

from .models import LayerMetadata


DEFAULT_MAX_LAYER_FEATURES = 100_000
HARD_MAX_LAYER_FEATURES = 2_000_000
DEFAULT_MAX_LAYER_BYTES = 256 * 1024 * 1024
HARD_MAX_LAYER_BYTES = 1024 * 1024 * 1024
DEFAULT_GEOJSON_FEATURES = 10_000
HARD_GEOJSON_FEATURES = 100_000
DEFAULT_GEOJSON_BYTES = 2 * 1024 * 1024
HARD_GEOJSON_BYTES = 8 * 1024 * 1024
MAX_WORKSPACE_LAYERS = 128


class LayerNotFoundError(KeyError):
    pass


class LayerRegistry:
    """Disk-backed canonical vector Layer Registry for one GeoHarness workspace."""

    def __init__(
        self,
        root: str | Path,
        *,
        max_layer_features: int = DEFAULT_MAX_LAYER_FEATURES,
        max_layer_bytes: int = DEFAULT_MAX_LAYER_BYTES,
    ):
        self.root = Path(root).resolve()
        if not 1 <= max_layer_features <= HARD_MAX_LAYER_FEATURES:
            raise ValueError(
                f"Layer feature limit must be between 1 and {HARD_MAX_LAYER_FEATURES}"
            )
        if not 1024 <= max_layer_bytes <= HARD_MAX_LAYER_BYTES:
            raise ValueError(
                f"Layer storage limit must be between 1024 and {HARD_MAX_LAYER_BYTES} bytes"
            )
        self.max_layer_features = max_layer_features
        self.max_layer_bytes = max_layer_bytes
        self.layers_root = self.root / "layers"
        self.exports_root = self.root / "exports"
        self.registry_path = self.root / "registry.json"
        self.layers_root.mkdir(parents=True, exist_ok=True)
        self.exports_root.mkdir(parents=True, exist_ok=True)
        self._metadata: dict[str, LayerMetadata] = {}
        self._load()

    def _load(self) -> None:
        if not self.registry_path.exists():
            return
        payload = json.loads(self.registry_path.read_text(encoding="utf-8"))
        for raw in payload.get("layers", []):
            metadata = LayerMetadata.model_validate(raw)
            self._metadata[metadata.layer_id] = metadata

    def _persist(self) -> None:
        payload = {
            "schema_version": "1.0",
            "layers": [item.model_dump(mode="json") for item in self.list_layers()],
        }
        temporary = self.registry_path.with_suffix(".json.tmp")
        temporary.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        temporary.replace(self.registry_path)

    def _next_layer_id(self) -> str:
        indexes = [int(layer_id.removeprefix("layer_")) for layer_id in self._metadata]
        return f"layer_{max(indexes, default=0) + 1:04d}"

    def clear(self) -> None:
        """Reset this one already-resolved workspace without touching any parent path."""
        for directory in (self.layers_root, self.exports_root):
            resolved_directory = directory.resolve()
            if resolved_directory == self.root or not resolved_directory.is_relative_to(self.root):
                raise ValueError(f"Unsafe Geo workspace asset directory: {directory}")
            for child in resolved_directory.iterdir():
                if not child.is_file():
                    raise ValueError(f"Unexpected non-file in Geo workspace: {child}")
                child.unlink()
        self.registry_path.unlink(missing_ok=True)
        self._metadata.clear()

    def register(
        self,
        name: str,
        frame: gpd.GeoDataFrame,
        *,
        source: str,
        generated_by: str | None = None,
        parents: Iterable[str] = (),
        parameters: dict[str, Any] | None = None,
    ) -> LayerMetadata:
        if not isinstance(frame, gpd.GeoDataFrame):
            raise TypeError("Layer Registry only accepts GeoDataFrame values")
        if frame.crs is None:
            raise ValueError("Cannot register a vector layer without a CRS")
        if not name.strip():
            raise ValueError("Layer name must not be empty")
        if len(self._metadata) >= MAX_WORKSPACE_LAYERS:
            raise ValueError(f"Workspace Layer limit is {MAX_WORKSPACE_LAYERS}")
        if len(frame) > self.max_layer_features:
            raise ValueError(
                f"Layer contains {len(frame)} features; limit is {self.max_layer_features}"
            )

        layer_id = self._next_layer_id()
        storage = self.layers_root / f"{layer_id}.gpkg"
        temporary_storage = self.layers_root / f".{layer_id}.{uuid.uuid4().hex}.gpkg"
        snapshot = frame.copy()
        try:
            snapshot.to_file(temporary_storage, layer="data", driver="GPKG", engine="pyogrio")
            storage_bytes = temporary_storage.stat().st_size
            if storage_bytes > self.max_layer_bytes:
                raise ValueError(
                    f"Layer snapshot is {storage_bytes} bytes; limit is {self.max_layer_bytes}"
                )
            os.replace(temporary_storage, storage)
        finally:
            temporary_storage.unlink(missing_ok=True)
        geometry_types = sorted(set(snapshot.geom_type.dropna().tolist()))
        bounds = [] if snapshot.empty else [
            float(value) for value in snapshot.total_bounds.tolist() if math.isfinite(float(value))
        ]
        metadata = LayerMetadata(
            layer_id=layer_id,
            name=name.strip(),
            geometry=geometry_types[0] if len(geometry_types) == 1 else f"Mixed ({', '.join(geometry_types)})",
            crs=snapshot.crs.to_string(),
            feature_count=len(snapshot),
            source=source,
            generated_by=generated_by,
            parents=list(parents),
            parameters=parameters,
            storage_path=storage.relative_to(self.root).as_posix(),
            created_at=datetime.now(timezone.utc).isoformat(),
            bbox=bounds,
        )
        self._metadata[layer_id] = metadata
        try:
            self._persist()
        except Exception:
            self._metadata.pop(layer_id, None)
            storage.unlink(missing_ok=True)
            raise
        return metadata

    def discard_layers(self, layer_ids: Iterable[str]) -> None:
        """Rollback only newly-created Layer assets after a failed Tool boundary."""
        discarded = []
        for layer_id in layer_ids:
            metadata = self._metadata.pop(layer_id, None)
            if metadata is None:
                continue
            storage = (self.root / metadata.storage_path).resolve()
            if not storage.is_relative_to(self.layers_root.resolve()):
                self._metadata[layer_id] = metadata
                raise ValueError(f"Unsafe rollback path for Layer {layer_id}")
            discarded.append(metadata)
        if discarded:
            try:
                self._persist()
            except Exception:
                for metadata in discarded:
                    self._metadata[metadata.layer_id] = metadata
                raise
            for metadata in discarded:
                (self.root / metadata.storage_path).resolve().unlink(missing_ok=True)

    def remove(self, layer_id: str) -> None:
        metadata = self.metadata(layer_id)
        dependents = [item.layer_id for item in self.list_layers() if layer_id in item.parents]
        if dependents:
            raise ValueError(
                f"Cannot remove {layer_id}; derived Layers depend on it: {', '.join(dependents)}"
            )
        storage = (self.root / metadata.storage_path).resolve()
        if not storage.is_relative_to(self.layers_root.resolve()):
            raise ValueError(f"Unsafe storage path for layer {layer_id}")
        self._metadata.pop(layer_id)
        try:
            self._persist()
        except Exception:
            self._metadata[layer_id] = metadata
            raise
        storage.unlink(missing_ok=True)

    def rename(self, layer_id: str, name: str) -> LayerMetadata:
        normalized = name.strip()
        if not normalized or len(normalized) > 120 or any(ord(character) < 32 for character in normalized):
            raise ValueError("Layer name must be 1-120 printable characters")
        metadata = self.metadata(layer_id)
        previous = metadata.name
        metadata.name = normalized
        try:
            self._persist()
        except Exception:
            metadata.name = previous
            raise
        return metadata

    def details(self, layer_id: str, *, offset: int = 0, limit: int = 100) -> dict[str, Any]:
        if not 0 <= offset <= 10_000_000:
            raise ValueError("Layer preview offset must be between 0 and 10000000")
        if not 1 <= limit <= 100:
            raise ValueError("Layer preview limit must be between 1 and 100")
        metadata = self.metadata(layer_id)
        frame = self.get(layer_id).reset_index(drop=True)
        attribute_columns = [column for column in frame.columns if column != frame.geometry.name]
        preview_columns = attribute_columns[:200]
        preview = frame.loc[:, preview_columns].iloc[offset:offset + limit]
        rows = json.loads(preview.to_json(orient="records", date_format="iso", default_handler=str))
        for index, row in enumerate(rows, start=offset):
            row["__row_index"] = index
            for key, value in list(row.items()):
                if isinstance(value, str) and len(value) > 500:
                    row[key] = f"{value[:500]}…"
        fields = [{
            "name": column,
            "type": str(frame[column].dtype),
            "null_count": int(frame[column].isna().sum()),
        } for column in preview_columns]
        null_geometry = int(frame.geometry.isna().sum())
        empty_geometry = int(frame.geometry.is_empty.sum())
        invalid_geometry = int((~frame.geometry.is_valid & ~frame.geometry.isna() & ~frame.geometry.is_empty).sum())
        warnings = []
        if len(attribute_columns) > len(preview_columns):
            warnings.append(f"Field preview is limited to 200 of {len(attribute_columns)} fields.")
        if offset > 0 or offset + len(rows) < len(frame):
            warnings.append(
                f"Attribute preview is limited to the first {limit} of {len(frame)} features."
                if offset == 0
                else f"Attribute preview returns rows {offset + 1}-{offset + len(rows)} of {len(frame)} features."
            )
        if null_geometry:
            warnings.append(f"Layer contains {null_geometry} null geometries.")
        if empty_geometry:
            warnings.append(f"Layer contains {empty_geometry} empty geometries.")
        if invalid_geometry:
            warnings.append(f"Layer contains {invalid_geometry} invalid geometries.")
        return {
            "schema_version": "1.0",
            "metadata": metadata.model_dump(mode="json"),
            "fields": fields,
            "rows": rows,
            "preview": {
                "limit": limit,
                "offset": offset,
                "returned_rows": len(rows),
                "total_rows": len(frame),
                "total_fields": len(attribute_columns),
                "fields_truncated": len(attribute_columns) > len(preview_columns),
                "rows_truncated": offset > 0 or offset + len(rows) < len(frame),
            },
            "quality": {
                "missing_crs": frame.crs is None,
                "null_geometry_count": null_geometry,
                "empty_geometry_count": empty_geometry,
                "invalid_geometry_count": invalid_geometry,
            },
            "warnings": warnings,
        }

    def register_file(self, path: str | Path, *, name: str | None = None, source: str = "scenario") -> LayerMetadata:
        source_path = Path(path).resolve()
        if not source_path.is_file():
            raise FileNotFoundError(source_path)
        frame = gpd.read_file(source_path, engine="pyogrio")
        return self.register(name or source_path.stem, frame, source=source)

    def metadata(self, layer_id: str) -> LayerMetadata:
        try:
            return self._metadata[layer_id]
        except KeyError as error:
            raise LayerNotFoundError(f"Unknown layer: {layer_id}") from error

    def get(self, layer_id: str) -> gpd.GeoDataFrame:
        metadata = self.metadata(layer_id)
        storage = (self.root / metadata.storage_path).resolve()
        if not storage.is_relative_to(self.root):
            raise ValueError(f"Unsafe storage path for layer {layer_id}")
        return gpd.read_file(storage, layer="data", engine="pyogrio")

    def list_layers(self) -> list[LayerMetadata]:
        return sorted(self._metadata.values(), key=lambda item: item.layer_id)

    def geojson(
        self,
        layer_id: str,
        *,
        offset: int = 0,
        limit: int = DEFAULT_GEOJSON_FEATURES,
        max_bytes: int = DEFAULT_GEOJSON_BYTES,
    ) -> dict[str, Any]:
        if not 0 <= offset <= 10_000_000:
            raise ValueError("GeoJSON offset must be between 0 and 10000000")
        if not 1 <= limit <= HARD_GEOJSON_FEATURES:
            raise ValueError(f"GeoJSON feature limit must be between 1 and {HARD_GEOJSON_FEATURES}")
        if not 1024 <= max_bytes <= HARD_GEOJSON_BYTES:
            raise ValueError(f"GeoJSON byte limit must be between 1024 and {HARD_GEOJSON_BYTES}")
        frame = self.get(layer_id)
        if frame.crs is not None and not frame.crs.is_geographic:
            frame = frame.to_crs("EPSG:4326")
        total = len(frame)
        stop = min(total, offset + limit)
        requested = frame.iloc[offset:stop]
        bounds = [] if frame.empty else [
            float(value) for value in frame.total_bounds.tolist() if math.isfinite(float(value))
        ]

        def page(count: int, *, skipped_oversize: bool = False) -> dict[str, Any]:
            # Preserve real source dates as strings at the canonical JSON boundary.
            payload = json.loads(requested.iloc[:count].to_json(drop_id=True, default=str))
            returned = len(payload["features"])
            consumed = returned if returned > 0 else (1 if skipped_oversize else 0)
            next_offset = offset + consumed
            payload["geoharness"] = {
                "schema_version": "1.0",
                "offset": offset,
                "limit": limit,
                "returned_features": returned,
                "total_features": total,
                "truncated": offset > 0 or next_offset < total,
                "next_offset": next_offset if next_offset < total else None,
                "byte_limit": max_bytes,
                "bbox": bounds,
                "skipped_oversize_feature": skipped_oversize,
            }
            return payload

        low = 0
        high = len(requested)
        selected = page(0)
        while low <= high:
            middle = (low + high) // 2
            candidate = page(middle)
            encoded = json.dumps(candidate, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
            if len(encoded) + 32 <= max_bytes:
                selected = candidate
                low = middle + 1
            else:
                high = middle - 1
        if selected["geoharness"]["returned_features"] == 0 and len(requested) > 0:
            selected = page(0, skipped_oversize=True)
        selected["geoharness"]["size_bytes"] = 0
        for _ in range(4):
            encoded_size = len(json.dumps(
                selected, ensure_ascii=False, separators=(",", ":")
            ).encode("utf-8"))
            if selected["geoharness"]["size_bytes"] == encoded_size:
                break
            selected["geoharness"]["size_bytes"] = encoded_size
        return selected
