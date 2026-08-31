from __future__ import annotations

import base64
import hashlib
import re
from pathlib import Path
from typing import Any

from .models import (
    AgentRunManifest,
    ResultAsset,
    ResultCenter,
    ResultLayerSnapshot,
    ResultSource,
    ResultStatistic,
    ResultToolCounts,
)
from .registry import LayerNotFoundError, LayerRegistry
from .workspace import RUN_ID, WorkspaceStore


MAX_RESULT_DOWNLOAD_BYTES = 20 * 1024 * 1024
MIME_TYPES = {
    "geojson": "application/geo+json",
    "gpkg": "application/geopackage+sqlite3",
    "csv": "text/csv;charset=utf-8",
    "json": "application/json;charset=utf-8",
}


def _quality_warnings(registry: LayerRegistry, layer_id: str) -> list[str]:
    details = registry.details(layer_id, limit=1)
    return [
        warning
        for warning in details["warnings"]
        if not warning.startswith("Attribute preview") and not warning.startswith("Field preview")
    ]


def _layer_snapshot(
    registry: LayerRegistry,
    layer_id: str,
    role: str,
) -> ResultLayerSnapshot:
    metadata = registry.metadata(layer_id)
    return ResultLayerSnapshot(
        layer_id=metadata.layer_id,
        name=metadata.name,
        role=role,
        source=metadata.source,
        geometry=metadata.geometry,
        crs=metadata.crs,
        feature_count=metadata.feature_count,
        generated_by=metadata.generated_by,
        parents=metadata.parents,
        warnings=_quality_warnings(registry, layer_id),
    )


def _terminal_output_ids(run: AgentRunManifest) -> list[str]:
    produced = list(dict.fromkeys(run.output_layers))
    consumed = {
        layer_id
        for call in run.tool_calls
        for layer_id in call.input_layers
        if call.name != "export_layer"
    }
    terminal = [layer_id for layer_id in produced if layer_id not in consumed]
    for call in run.tool_calls:
        if call.name == "export_layer" and call.status == "success":
            for layer_id in call.input_layers:
                if layer_id not in terminal:
                    terminal.append(layer_id)
    return terminal


def _safe_export_stem(value: str) -> str:
    return re.sub(r"[^A-Za-z0-9._-]+", "-", Path(value).stem).strip(".-")


def _run_exports(workspace: WorkspaceStore, run: AgentRunManifest) -> list[ResultAsset]:
    manifest = workspace.manifest()
    calls = [call for call in run.tool_calls if call.name == "export_layer" and call.status == "success"]
    matched = []
    for asset in manifest.exports:
        for call in calls:
            requested_format = str(call.arguments.get("format", "geojson")).lower()
            requested_file = call.arguments.get("file_name")
            requested_stem = _safe_export_stem(str(requested_file)) if requested_file else None
            asset_stem = Path(asset.path).stem
            if asset.layer_id != (call.input_layers[0] if call.input_layers else None):
                continue
            if asset.format != requested_format:
                continue
            if requested_stem and requested_stem != asset_stem:
                continue
            matched.append(ResultAsset(
                asset_type="export",
                asset_id=asset.asset_id,
                file_name=Path(asset.path).name,
                format=asset.format,
                layer_id=asset.layer_id,
                feature_count=asset.feature_count,
                size_bytes=asset.size_bytes,
                created_at=asset.created_at,
                downloadable=asset.size_bytes <= MAX_RESULT_DOWNLOAD_BYTES,
            ))
            break
    return matched


def _run_asset(workspace: WorkspaceStore, run: AgentRunManifest) -> ResultAsset:
    indexed = next((item for item in workspace.manifest().runs if item.run_id == run.run_id), None)
    if indexed is None:
        raise ValueError(f"Run asset is not indexed: {run.run_id}")
    source = (workspace.root / indexed.path).resolve()
    if not source.is_relative_to(workspace.runs_root) or not source.is_file():
        raise ValueError(f"Unsafe or missing Run asset: {run.run_id}")
    size = source.stat().st_size
    return ResultAsset(
        asset_type="run",
        asset_id=run.run_id,
        file_name=source.name,
        format="json",
        size_bytes=size,
        created_at=indexed.created_at,
        downloadable=size <= MAX_RESULT_DOWNLOAD_BYTES,
    )


def _units(run: AgentRunManifest) -> list[str]:
    units: list[str] = []
    for call in run.tool_calls:
        explicit = call.arguments.get("unit")
        if isinstance(explicit, str) and explicit and explicit not in units:
            units.append(explicit)
        if any(
            key.endswith("_m") and isinstance(value, (int, float))
            for key, value in call.arguments.items()
        ) and "meter" not in units:
            units.append("meter")
    return units


def build_result_center(
    workspace: WorkspaceStore,
    registry: LayerRegistry,
    *,
    run_id: str | None = None,
) -> ResultCenter | None:
    runs = workspace.agent_runs()
    if not runs:
        return None
    run = runs[-1] if run_id is None else next((item for item in runs if item.run_id == run_id), None)
    if run is None:
        raise ValueError(f"Unknown Agent Run: {run_id}")

    warnings = list(dict.fromkeys(
        warning
        for call in run.tool_calls
        for warning in call.warnings
    ))
    produced = set(run.output_layers)
    input_ids = [layer_id for layer_id in run.input_layers if layer_id not in produced]
    output_ids = _terminal_output_ids(run)
    input_layers: list[ResultLayerSnapshot] = []
    output_layers: list[ResultLayerSnapshot] = []
    for role, layer_ids, destination in [
        ("input", input_ids, input_layers),
        ("output", output_ids, output_layers),
    ]:
        for layer_id in layer_ids:
            try:
                snapshot = _layer_snapshot(registry, layer_id, role)
            except LayerNotFoundError:
                warnings.append(f"Referenced Layer is no longer available: {layer_id}")
                continue
            destination.append(snapshot)
            warnings.extend(snapshot.warnings)

    manifest = workspace.manifest()
    imports = {asset.layer_id: asset for asset in manifest.imports}
    sources: list[ResultSource] = []
    for layer in input_layers:
        imported = imports.get(layer.layer_id)
        if imported is not None:
            detail = f"workspace import: {imported.file_name}"
        elif layer.source == "scenario":
            detail = manifest.active_dataset or manifest.active_scenario or "configured deployment data"
        else:
            detail = f"derived by {layer.generated_by or 'Geo Tool'} from {', '.join(layer.parents) or 'canonical Layers'}"
        sources.append(ResultSource(
            layer_id=layer.layer_id,
            kind=layer.source,
            name=layer.name,
            detail=detail,
        ))

    statistics = [
        ResultStatistic(
            call_id=call.call_id,
            tool=call.name,
            summary=call.summary,
            data=call.result_data,
        )
        for call in run.tool_calls
        if call.result_data
    ]
    statuses = [call.status for call in run.tool_calls]
    crs_values: list[str] = []
    for layer_id in dict.fromkeys([*run.input_layers, *run.output_layers]):
        try:
            crs = registry.metadata(layer_id).crs
        except LayerNotFoundError:
            continue
        if crs and crs not in crs_values:
            crs_values.append(crs)
    assets = [*_run_exports(workspace, run), _run_asset(workspace, run)]
    return ResultCenter(
        run_id=run.run_id,
        session_id=run.session_id,
        turn=run.turn,
        status=run.status,
        user_goal=run.user_goal,
        final_answer=run.final_answer.text if run.final_answer is not None else None,
        provider=run.provider,
        model=run.model,
        tools=ResultToolCounts(
            total=len(statuses),
            success=statuses.count("success"),
            failed=statuses.count("failed"),
            running=statuses.count("running"),
        ),
        input_layers=input_layers,
        output_layers=output_layers,
        statistics=statistics,
        crs=crs_values,
        units=_units(run),
        sources=sources,
        warnings=list(dict.fromkeys(warnings)),
        assets=assets,
    )


def read_result_asset(
    workspace: WorkspaceStore,
    *,
    asset_type: str,
    asset_id: str,
    max_bytes: int = MAX_RESULT_DOWNLOAD_BYTES,
) -> dict[str, Any]:
    if not 1 <= max_bytes <= MAX_RESULT_DOWNLOAD_BYTES:
        raise ValueError("Invalid Result download size limit")
    if RUN_ID.fullmatch(asset_id) is None:
        raise ValueError("Result asset id must be a safe 1-120 character identifier")
    manifest = workspace.manifest()
    if asset_type == "export":
        asset = next((item for item in manifest.exports if item.asset_id == asset_id), None)
        if asset is None:
            raise ValueError(f"Unknown export asset: {asset_id}")
        source = (workspace.root / asset.path).resolve()
        root = (workspace.root / "exports").resolve()
        format_name = asset.format
        expected_size = asset.size_bytes
    elif asset_type == "run":
        asset = next((item for item in manifest.runs if item.run_id == asset_id), None)
        if asset is None:
            raise ValueError(f"Unknown Run asset: {asset_id}")
        source = (workspace.root / asset.path).resolve()
        root = workspace.runs_root.resolve()
        format_name = "json"
        expected_size = None
    else:
        raise ValueError("Result asset type must be export or run")
    if not source.is_relative_to(root) or not source.is_file():
        raise ValueError("Result asset is outside this Workspace or missing")
    size = source.stat().st_size
    if expected_size is not None and size != expected_size:
        raise ValueError("Result asset size does not match its Workspace index")
    if size > max_bytes:
        raise ValueError(f"Result asset exceeds the {max_bytes}-byte download limit")
    content = source.read_bytes()
    return {
        "schema_version": "1.0",
        "asset_type": asset_type,
        "asset_id": asset_id,
        "file_name": source.name,
        "format": format_name,
        "mime_type": MIME_TYPES[format_name],
        "size_bytes": size,
        "sha256": hashlib.sha256(content).hexdigest(),
        "content_base64": base64.b64encode(content).decode("ascii"),
    }
