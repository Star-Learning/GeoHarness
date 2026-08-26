from __future__ import annotations

import re
from pathlib import Path
from typing import Any, Callable

import geopandas as gpd
import pandas as pd

from ..models import LayerMetadata, ToolResult
from ..registry import LayerRegistry


METRIC_CRS = "EPSG:32618"
TOOL_NAMES = (
    "inspect_dataset",
    "list_layers",
    "transform_crs",
    "create_buffer",
    "spatial_filter",
    "spatial_join",
    "clip_layer",
    "aggregate_by_region",
    "calculate_geometry",
    "nearest_features",
    "analyze_distribution",
    "export_layer",
)


class GeoTools:
    def __init__(self, registry: LayerRegistry):
        self.registry = registry

    def _success(
        self,
        tool: str,
        *,
        step_id: str | None,
        inputs: list[str] | None = None,
        parameters: dict[str, Any] | None = None,
        outputs: list[str] | None = None,
        summary: str,
        warnings: list[str] | None = None,
        data: dict[str, Any] | None = None,
    ) -> ToolResult:
        return ToolResult(
            success=True,
            tool=tool,
            step_id=step_id,
            inputs=inputs or [],
            parameters=parameters or {},
            outputs=outputs or [],
            summary=summary,
            warnings=warnings or [],
            data=data or {},
        )

    def _derived(
        self,
        name: str,
        frame: gpd.GeoDataFrame,
        *,
        step_id: str | None,
        parents: list[str],
        parameters: dict[str, Any],
    ) -> LayerMetadata:
        return self.registry.register(
            name,
            frame,
            source="derived",
            generated_by=step_id,
            parents=parents,
            parameters=parameters,
        )

    def execute(self, tool: str, *, step_id: str | None = None, **parameters: Any) -> ToolResult:
        if tool not in TOOL_NAMES:
            return ToolResult(
                success=False,
                tool=tool,
                step_id=step_id,
                parameters=parameters,
                summary=f"Unknown Geo Tool: {tool}",
                warnings=[f"Available tools: {', '.join(TOOL_NAMES)}"],
            )
        method: Callable[..., ToolResult] = getattr(self, tool)
        try:
            return method(step_id=step_id, **parameters)
        except Exception as error:  # Structured boundary for Harness/API consumers.
            inputs = [
                value for key, value in parameters.items()
                if "layer" in key and isinstance(value, str)
            ]
            return ToolResult(
                success=False,
                tool=tool,
                step_id=step_id,
                inputs=inputs,
                parameters=parameters,
                summary=f"{type(error).__name__}: {error}",
                warnings=["The operation failed without registering an output layer."],
            )

    def inspect_dataset(self, input_layer: str, *, step_id: str | None = None) -> ToolResult:
        frame = self.registry.get(input_layer)
        geometry_types = sorted(set(frame.geom_type.dropna().tolist()))
        missing = {column: int(frame[column].isna().sum()) for column in frame.columns if column != frame.geometry.name}
        data: dict[str, Any] = {
            "feature_count": len(frame),
            "geometry_types": geometry_types,
            "crs": frame.crs.to_string() if frame.crs is not None else None,
            "fields": [column for column in frame.columns if column != frame.geometry.name],
            "missing_values": missing,
            "invalid_geometry_count": int((~frame.geometry.is_valid).sum()),
            "empty_geometry_count": int(frame.geometry.is_empty.sum()),
            "bounds": [] if frame.empty else [float(value) for value in frame.total_bounds],
        }
        if any("Polygon" in geometry for geometry in geometry_types) and not frame.empty:
            metric = frame.to_crs(METRIC_CRS)
            areas = metric.geometry.area
            data["area_m2"] = {
                "min": float(areas.min()),
                "max": float(areas.max()),
                "mean": float(areas.mean()),
                "sum": float(areas.sum()),
            }
        return self._success(
            "inspect_dataset",
            step_id=step_id,
            inputs=[input_layer],
            summary=f"Inspected {len(frame)} features in {self.registry.metadata(input_layer).name}.",
            data=data,
        )

    def list_layers(self, *, step_id: str | None = None) -> ToolResult:
        layers = [item.model_dump(mode="json") for item in self.registry.list_layers()]
        return self._success(
            "list_layers",
            step_id=step_id,
            summary=f"Layer Registry contains {len(layers)} layers.",
            data={"layers": layers},
        )

    def transform_crs(
        self,
        input_layer: str,
        target_crs: str,
        *,
        output_name: str | None = None,
        step_id: str | None = None,
    ) -> ToolResult:
        frame = self.registry.get(input_layer)
        transformed = frame.to_crs(target_crs)
        parameters = {"target_crs": target_crs}
        output = self._derived(
            output_name or f"{self.registry.metadata(input_layer).name}_transformed",
            transformed,
            step_id=step_id,
            parents=[input_layer],
            parameters=parameters,
        )
        return self._success(
            "transform_crs",
            step_id=step_id,
            inputs=[input_layer],
            parameters=parameters,
            outputs=[output.layer_id],
            summary=f"Transformed {len(transformed)} features to {output.crs}.",
        )

    def create_buffer(
        self,
        input_layer: str,
        distance: float,
        *,
        unit: str = "meter",
        metric_crs: str = METRIC_CRS,
        dissolve: bool = True,
        output_name: str | None = None,
        step_id: str | None = None,
    ) -> ToolResult:
        if distance <= 0:
            raise ValueError("Buffer distance must be greater than zero")
        if unit not in {"meter", "meters", "m", "kilometer", "kilometers", "km"}:
            raise ValueError(f"Unsupported distance unit: {unit}")
        distance_m = distance * 1000 if unit in {"kilometer", "kilometers", "km"} else distance
        frame = self.registry.get(input_layer).to_crs(metric_crs)
        buffered = frame.copy()
        buffered.geometry = frame.geometry.buffer(distance_m)
        if dissolve:
            buffered = gpd.GeoDataFrame(
                {"distance_m": [float(distance_m)]},
                geometry=[buffered.geometry.union_all()],
                crs=metric_crs,
            )
        parameters = {
            "distance": distance,
            "unit": unit,
            "distance_m": float(distance_m),
            "metric_crs": metric_crs,
            "dissolve": dissolve,
        }
        output = self._derived(
            output_name or f"{self.registry.metadata(input_layer).name}_buffer",
            buffered,
            step_id=step_id,
            parents=[input_layer],
            parameters=parameters,
        )
        return self._success(
            "create_buffer",
            step_id=step_id,
            inputs=[input_layer],
            parameters=parameters,
            outputs=[output.layer_id],
            summary=f"Created a {distance:g} {unit} buffer.",
        )

    def spatial_filter(
        self,
        input_layer: str,
        *,
        mask_layer: str | None = None,
        predicate: str = "intersects",
        where: dict[str, Any] | None = None,
        output_name: str | None = None,
        step_id: str | None = None,
    ) -> ToolResult:
        frame = self.registry.get(input_layer)
        selected = frame.copy()
        if where:
            for field, expected in where.items():
                if field not in selected.columns:
                    raise ValueError(f"Unknown attribute field: {field}")
                selected = selected[selected[field].isin(expected) if isinstance(expected, list) else selected[field].eq(expected)]
        inputs = [input_layer]
        if mask_layer is not None:
            mask = self.registry.get(mask_layer)
            if mask.crs != selected.crs:
                mask = mask.to_crs(selected.crs)
            geometry = mask.geometry.union_all()
            predicates = {
                "intersects": selected.geometry.intersects,
                "within": selected.geometry.within,
                "contains": selected.geometry.contains,
                "disjoint": selected.geometry.disjoint,
                "touches": selected.geometry.touches,
            }
            if predicate not in predicates:
                raise ValueError(f"Unsupported spatial predicate: {predicate}")
            selected = selected[predicates[predicate](geometry)]
            inputs.append(mask_layer)
        parameters = {"predicate": predicate, "where": where}
        output = self._derived(
            output_name or f"{self.registry.metadata(input_layer).name}_filtered",
            selected,
            step_id=step_id,
            parents=inputs,
            parameters=parameters,
        )
        return self._success(
            "spatial_filter",
            step_id=step_id,
            inputs=inputs,
            parameters=parameters,
            outputs=[output.layer_id],
            summary=f"Selected {len(selected)} of {len(frame)} input features.",
            data={"selected_count": len(selected), "input_count": len(frame)},
        )

    def spatial_join(
        self,
        left_layer: str,
        right_layer: str,
        *,
        predicate: str = "within",
        how: str = "left",
        output_name: str | None = None,
        step_id: str | None = None,
    ) -> ToolResult:
        left = self.registry.get(left_layer)
        right = self.registry.get(right_layer)
        if right.crs != left.crs:
            right = right.to_crs(left.crs)
        joined = gpd.sjoin(left, right, how=how, predicate=predicate, lsuffix="input", rsuffix="region")
        if "index_region" in joined.columns:
            joined = joined.drop(columns=["index_region"])
        parameters = {"predicate": predicate, "how": how}
        output = self._derived(
            output_name or f"{self.registry.metadata(left_layer).name}_joined",
            joined,
            step_id=step_id,
            parents=[left_layer, right_layer],
            parameters=parameters,
        )
        return self._success(
            "spatial_join",
            step_id=step_id,
            inputs=[left_layer, right_layer],
            parameters=parameters,
            outputs=[output.layer_id],
            summary=f"Spatial join produced {len(joined)} rows.",
            data={"row_count": len(joined)},
        )

    def clip_layer(
        self,
        input_layer: str,
        clip_layer: str,
        *,
        output_name: str | None = None,
        step_id: str | None = None,
    ) -> ToolResult:
        frame = self.registry.get(input_layer)
        mask = self.registry.get(clip_layer)
        if mask.crs != frame.crs:
            mask = mask.to_crs(frame.crs)
        clipped = gpd.clip(frame, mask)
        output = self._derived(
            output_name or f"{self.registry.metadata(input_layer).name}_clipped",
            clipped,
            step_id=step_id,
            parents=[input_layer, clip_layer],
            parameters={},
        )
        return self._success(
            "clip_layer",
            step_id=step_id,
            inputs=[input_layer, clip_layer],
            outputs=[output.layer_id],
            summary=f"Clipped the input to {len(clipped)} features.",
            data={"feature_count": len(clipped)},
        )

    def aggregate_by_region(
        self,
        input_layer: str,
        regions_layer: str,
        group_field: str,
        *,
        area_field: str = "area_m2",
        output_name: str = "region_statistics",
        step_id: str | None = None,
    ) -> ToolResult:
        frame = self.registry.get(input_layer)
        regions = self.registry.get(regions_layer)
        if group_field not in regions.columns:
            raise ValueError(f"Unknown region group field: {group_field}")
        if regions.crs != frame.crs:
            regions = regions.to_crs(frame.crs)
        if area_field not in frame.columns:
            frame = frame.copy()
            frame[area_field] = frame.to_crs(METRIC_CRS).geometry.area.to_numpy()
        joined = gpd.sjoin(
            frame,
            regions[[group_field, regions.geometry.name]],
            how="left",
            predicate="within",
        )
        statistics = joined.groupby(group_field, dropna=False).agg(
            feature_count=(group_field, "size"),
            area_sum_m2=(area_field, "sum"),
        ).reset_index()
        result = regions.merge(statistics, on=group_field, how="left")
        result["feature_count"] = result["feature_count"].fillna(0).astype(int)
        result["area_sum_m2"] = result["area_sum_m2"].fillna(0.0)
        parameters = {"group_field": group_field, "area_field": area_field}
        output = self._derived(
            output_name,
            result,
            step_id=step_id,
            parents=[input_layer, regions_layer],
            parameters=parameters,
        )
        rows = result[[group_field, "feature_count", "area_sum_m2"]].to_dict(orient="records")
        return self._success(
            "aggregate_by_region",
            step_id=step_id,
            inputs=[input_layer, regions_layer],
            parameters=parameters,
            outputs=[output.layer_id],
            summary=f"Aggregated {len(frame)} features into {len(result)} regions.",
            data={"groups": rows},
        )

    def calculate_geometry(
        self,
        input_layer: str,
        *,
        metric_crs: str = METRIC_CRS,
        area_field: str = "area_m2",
        length_field: str = "length_m",
        output_name: str | None = None,
        step_id: str | None = None,
    ) -> ToolResult:
        frame = self.registry.get(input_layer)
        metric = frame.to_crs(metric_crs)
        result = frame.copy()
        result[area_field] = metric.geometry.area.to_numpy()
        result[length_field] = metric.geometry.length.to_numpy()
        parameters = {"metric_crs": metric_crs, "area_field": area_field, "length_field": length_field}
        output = self._derived(
            output_name or f"{self.registry.metadata(input_layer).name}_geometry",
            result,
            step_id=step_id,
            parents=[input_layer],
            parameters=parameters,
        )
        return self._success(
            "calculate_geometry",
            step_id=step_id,
            inputs=[input_layer],
            parameters=parameters,
            outputs=[output.layer_id],
            summary=f"Calculated geometry metrics for {len(result)} features.",
            data={"area_sum_m2": float(result[area_field].sum()), "length_sum_m": float(result[length_field].sum())},
        )

    def nearest_features(
        self,
        input_layer: str,
        target_layer: str,
        *,
        max_distance: float | None = None,
        metric_crs: str = METRIC_CRS,
        output_name: str | None = None,
        step_id: str | None = None,
    ) -> ToolResult:
        source = self.registry.get(input_layer)
        target = self.registry.get(target_layer)
        source_metric = source.to_crs(metric_crs)
        target_metric = target.to_crs(metric_crs)
        joined = gpd.sjoin_nearest(
            source_metric,
            target_metric,
            how="left",
            max_distance=max_distance,
            distance_col="distance_m",
            lsuffix="input",
            rsuffix="target",
        ).to_crs(source.crs)
        parameters = {"max_distance": max_distance, "metric_crs": metric_crs}
        output = self._derived(
            output_name or f"{self.registry.metadata(input_layer).name}_nearest",
            joined,
            step_id=step_id,
            parents=[input_layer, target_layer],
            parameters=parameters,
        )
        distances = joined["distance_m"].dropna()
        return self._success(
            "nearest_features",
            step_id=step_id,
            inputs=[input_layer, target_layer],
            parameters=parameters,
            outputs=[output.layer_id],
            summary=f"Calculated nearest targets for {int(distances.count())} features.",
            data={
                "matched_count": int(distances.count()),
                "minimum_distance_m": None if distances.empty else float(distances.min()),
                "maximum_distance_m": None if distances.empty else float(distances.max()),
            },
        )

    def analyze_distribution(
        self,
        input_layer: str,
        *,
        fields: list[str] | None = None,
        step_id: str | None = None,
    ) -> ToolResult:
        frame = self.registry.get(input_layer)
        available = [column for column in frame.columns if column != frame.geometry.name]
        selected_fields = fields or available
        statistics: dict[str, Any] = {}
        for field in selected_fields:
            if field not in frame.columns:
                raise ValueError(f"Unknown distribution field: {field}")
            series = frame[field]
            if pd.api.types.is_numeric_dtype(series):
                clean = series.dropna()
                statistics[field] = {
                    "count": int(clean.count()),
                    "missing": int(series.isna().sum()),
                    "min": None if clean.empty else float(clean.min()),
                    "max": None if clean.empty else float(clean.max()),
                    "mean": None if clean.empty else float(clean.mean()),
                    "sum": None if clean.empty else float(clean.sum()),
                }
            else:
                counts = series.fillna("<missing>").astype(str).value_counts().head(20)
                statistics[field] = {
                    "count": int(series.notna().sum()),
                    "missing": int(series.isna().sum()),
                    "top_values": {str(key): int(value) for key, value in counts.items()},
                }
        return self._success(
            "analyze_distribution",
            step_id=step_id,
            inputs=[input_layer],
            parameters={"fields": selected_fields},
            summary=f"Analyzed {len(selected_fields)} fields across {len(frame)} features.",
            data={"statistics": statistics},
        )

    def export_layer(
        self,
        input_layer: str,
        *,
        format: str = "geojson",
        file_name: str | None = None,
        step_id: str | None = None,
    ) -> ToolResult:
        frame = self.registry.get(input_layer)
        normalized_format = format.lower()
        extensions = {"geojson": ".geojson", "gpkg": ".gpkg", "csv": ".csv"}
        if normalized_format not in extensions:
            raise ValueError(f"Unsupported export format: {format}")
        base_name = file_name or self.registry.metadata(input_layer).name
        safe_name = re.sub(r"[^A-Za-z0-9._-]+", "-", Path(base_name).stem).strip(".-") or input_layer
        destination = self.registry.exports_root / f"{safe_name}{extensions[normalized_format]}"
        if normalized_format == "geojson":
            exported = frame.to_crs("EPSG:4326") if frame.crs is not None and not frame.crs.is_geographic else frame
            exported.to_file(destination, driver="GeoJSON", engine="pyogrio")
        elif normalized_format == "gpkg":
            frame.to_file(destination, layer="data", driver="GPKG", engine="pyogrio")
        else:
            table = frame.drop(columns=[frame.geometry.name]).copy()
            table.to_csv(destination, index=False)
        relative = destination.relative_to(self.registry.root).as_posix()
        return self._success(
            "export_layer",
            step_id=step_id,
            inputs=[input_layer],
            parameters={"format": normalized_format, "file_name": safe_name},
            summary=f"Exported {len(frame)} features to {relative}.",
            data={"path": relative, "feature_count": len(frame), "format": normalized_format},
        )
