from __future__ import annotations

import json
import math
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterable

import geopandas as gpd

from .models import LayerMetadata


class LayerNotFoundError(KeyError):
    pass


class LayerRegistry:
    """Disk-backed canonical vector Layer Registry for one GeoHarness workspace."""

    def __init__(self, root: str | Path):
        self.root = Path(root).resolve()
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

        layer_id = self._next_layer_id()
        storage = self.layers_root / f"{layer_id}.gpkg"
        snapshot = frame.copy()
        snapshot.to_file(storage, layer="data", driver="GPKG", engine="pyogrio")
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
        self._persist()
        return metadata

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

    def geojson(self, layer_id: str) -> dict[str, Any]:
        frame = self.get(layer_id)
        if frame.crs is not None and not frame.crs.is_geographic:
            frame = frame.to_crs("EPSG:4326")
        # GeoPandas leaves datetime-like attributes as pandas Timestamp values in
        # its feature dictionaries. The standard JSON encoder cannot serialize
        # them, so preserve real source dates as readable strings at the canonical
        # GeoJSON boundary instead of dropping the field.
        return json.loads(frame.to_json(drop_id=True, default=str))
