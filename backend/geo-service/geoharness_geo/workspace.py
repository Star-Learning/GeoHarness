from __future__ import annotations

import hashlib
import json
import os
import re
import shutil
import tempfile
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterable

from .models import (
    AgentRunManifest,
    LayerMetadata,
    LayerDisplayPreference,
    WorkspaceExportAsset,
    WorkspaceImportAsset,
    WorkspaceLayerAsset,
    WorkspaceManifest,
    WorkspaceRunAsset,
    WorkspaceToolExecution,
)


RUN_ID = re.compile(r"^[A-Za-z0-9._-]{1,120}$")
MAX_TOOL_EXECUTIONS = 1000


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def atomic_write_json(path: Path, payload: dict[str, Any]) -> None:
    """Durably replace one JSON file without exposing a partially written manifest."""
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary_path: Path | None = None
    try:
        with tempfile.NamedTemporaryFile(
            mode="w",
            encoding="utf-8",
            dir=path.parent,
            prefix=f".{path.name}.",
            suffix=".tmp",
            delete=False,
        ) as temporary:
            temporary_path = Path(temporary.name)
            json.dump(payload, temporary, ensure_ascii=False, indent=2)
            temporary.write("\n")
            temporary.flush()
            os.fsync(temporary.fileno())
        os.replace(temporary_path, path)
    finally:
        if temporary_path is not None:
            temporary_path.unlink(missing_ok=True)


class WorkspaceStore:
    """Versioned asset index for exactly one resolved Harness Session workspace."""

    def __init__(self, root: str | Path, *, workspace_id: str, session_id: str):
        self.root = Path(root).resolve()
        self.workspace_id = workspace_id
        self.session_id = session_id
        self.manifest_path = self.root / "workspace.json"
        self.imports_root = self.root / "imports"
        self.runs_root = self.root / "runs"
        self.tool_executions_path = self.root / "tool-executions.json"
        self.root.mkdir(parents=True, exist_ok=True)
        self.imports_root.mkdir(parents=True, exist_ok=True)
        self.runs_root.mkdir(parents=True, exist_ok=True)
        self._manifest = self._load_or_create()

    @staticmethod
    def _tool_request_hash(tool: str, parameters: dict[str, Any]) -> str:
        canonical = json.dumps(
            {"tool": tool, "parameters": parameters},
            ensure_ascii=False,
            sort_keys=True,
            separators=(",", ":"),
        )
        return hashlib.sha256(canonical.encode("utf-8")).hexdigest()

    def _tool_executions(self) -> list[WorkspaceToolExecution]:
        if not self.tool_executions_path.exists():
            return []
        payload = json.loads(self.tool_executions_path.read_text(encoding="utf-8"))
        if payload.get("schema_version") != "1.0" or not isinstance(payload.get("executions"), list):
            raise ValueError("Unsupported Tool execution index")
        return [WorkspaceToolExecution.model_validate(item) for item in payload["executions"]]

    def replay_tool_execution(
        self,
        *,
        step_id: str | None,
        tool: str,
        parameters: dict[str, Any],
    ) -> WorkspaceToolExecution | None:
        if step_id is None:
            return None
        if not step_id or len(step_id) > 180:
            raise ValueError("Tool step_id must be 1-180 characters")
        executions = self._tool_executions()
        execution = next((item for item in executions if item.step_id == step_id), None)
        if execution is None:
            if len(executions) >= MAX_TOOL_EXECUTIONS:
                raise ValueError(f"Workspace Tool execution limit is {MAX_TOOL_EXECUTIONS}")
            return None
        request_hash = self._tool_request_hash(tool, parameters)
        if execution.tool != tool or execution.request_hash != request_hash:
            raise ValueError(
                f"Tool idempotency conflict for step_id {step_id}: request parameters changed"
            )
        return execution

    def record_tool_execution(
        self,
        *,
        step_id: str | None,
        tool: str,
        parameters: dict[str, Any],
        result: Any,
    ) -> WorkspaceToolExecution | None:
        if step_id is None:
            return None
        existing = self.replay_tool_execution(
            step_id=step_id,
            tool=tool,
            parameters=parameters,
        )
        if existing is not None:
            return existing
        executions = self._tool_executions()
        if len(executions) >= MAX_TOOL_EXECUTIONS:
            raise ValueError(f"Workspace Tool execution limit is {MAX_TOOL_EXECUTIONS}")
        execution = WorkspaceToolExecution(
            step_id=step_id,
            tool=tool,
            request_hash=self._tool_request_hash(tool, parameters),
            result=result,
            created_at=utc_now(),
        )
        executions.append(execution)
        atomic_write_json(self.tool_executions_path, {
            "schema_version": "1.0",
            "executions": [item.model_dump(mode="json") for item in executions],
        })
        return execution

    def _load_or_create(self) -> WorkspaceManifest:
        if self.manifest_path.exists():
            manifest = WorkspaceManifest.model_validate_json(
                self.manifest_path.read_text(encoding="utf-8")
            )
            if manifest.workspace_id != self.workspace_id or manifest.session_id != self.session_id:
                raise ValueError(
                    "Workspace identity mismatch; refusing to expose another Session workspace"
                )
            return manifest
        now = utc_now()
        manifest = WorkspaceManifest(
            workspace_id=self.workspace_id,
            session_id=self.session_id,
            created_at=now,
            updated_at=now,
        )
        self._persist(manifest)
        return manifest

    def _persist(self, manifest: WorkspaceManifest | None = None) -> None:
        current = manifest or self._manifest
        atomic_write_json(self.manifest_path, current.model_dump(mode="json"))

    def _touch(self) -> None:
        self._manifest.updated_at = utc_now()
        self._persist()

    def manifest(self) -> WorkspaceManifest:
        return self._manifest.model_copy(deep=True)

    def sync_layers(self, layers: Iterable[LayerMetadata]) -> WorkspaceManifest:
        inputs: list[WorkspaceLayerAsset] = []
        derived: list[WorkspaceLayerAsset] = []
        for layer in layers:
            asset = WorkspaceLayerAsset(
                layer_id=layer.layer_id,
                name=layer.name,
                role="derived" if layer.source == "derived" else "input",
                source=layer.source,
                storage_path=layer.storage_path,
                created_at=layer.created_at,
            )
            (derived if asset.role == "derived" else inputs).append(asset)
        inputs.sort(key=lambda item: item.layer_id)
        derived.sort(key=lambda item: item.layer_id)
        if inputs != self._manifest.input_layers or derived != self._manifest.derived_layers:
            self._manifest.input_layers = inputs
            self._manifest.derived_layers = derived
            self._touch()
        return self.manifest()

    def activate_dataset(self, dataset_id: str) -> WorkspaceManifest:
        if self._manifest.active_dataset != dataset_id or self._manifest.active_scenario is not None:
            self._manifest.active_dataset = dataset_id
            self._manifest.active_scenario = None
            self._touch()
        return self.manifest()

    def activate_scenario(self, scenario_id: str) -> WorkspaceManifest:
        if self._manifest.active_scenario != scenario_id or self._manifest.active_dataset is not None:
            self._manifest.active_scenario = scenario_id
            self._manifest.active_dataset = None
            self._touch()
        return self.manifest()

    def record_export(
        self,
        *,
        layer_id: str,
        format: str,
        relative_path: str,
        feature_count: int,
    ) -> WorkspaceManifest:
        destination = (self.root / relative_path).resolve()
        exports_root = (self.root / "exports").resolve()
        if not destination.is_relative_to(exports_root) or not destination.is_file():
            raise ValueError("Export asset is outside this Workspace or does not exist")
        normalized_format = format.lower()
        if normalized_format not in {"geojson", "gpkg", "csv"}:
            raise ValueError(f"Unsupported export asset format: {format}")
        asset_id = f"export_{hashlib.sha256(relative_path.encode('utf-8')).hexdigest()[:16]}"
        asset = WorkspaceExportAsset(
            asset_id=asset_id,
            layer_id=layer_id,
            format=normalized_format,
            path=destination.relative_to(self.root).as_posix(),
            feature_count=feature_count,
            size_bytes=destination.stat().st_size,
            created_at=utc_now(),
        )
        self._manifest.exports = [
            item for item in self._manifest.exports if item.asset_id != asset_id
        ] + [asset]
        self._manifest.exports.sort(key=lambda item: item.asset_id)
        self._touch()
        return self.manifest()

    def record_import(
        self,
        *,
        asset_id: str,
        file_name: str,
        format: str,
        relative_path: str,
        size_bytes: int,
        layer_id: str,
        source_layer: str | None,
        warnings: list[str],
    ) -> WorkspaceManifest:
        if RUN_ID.fullmatch(asset_id) is None:
            raise ValueError("Import asset id must be a safe 1-120 character identifier")
        source = (self.root / relative_path).resolve()
        if not source.is_relative_to(self.imports_root) or not source.is_file():
            raise ValueError("Import asset is outside this Workspace or does not exist")
        normalized_format = format.lower()
        if normalized_format not in {"geojson", "shapefile", "gpkg", "csv"}:
            raise ValueError(f"Unsupported import asset format: {format}")
        asset = WorkspaceImportAsset(
            asset_id=asset_id,
            file_name=file_name,
            format=normalized_format,
            path=source.relative_to(self.root).as_posix(),
            size_bytes=size_bytes,
            layer_id=layer_id,
            source_layer=source_layer,
            created_at=utc_now(),
            warnings=warnings,
        )
        self._manifest.imports = [
            item for item in self._manifest.imports if item.asset_id != asset_id
        ] + [asset]
        self._manifest.imports.sort(key=lambda item: item.asset_id)
        self._touch()
        return self.manifest()

    def record_run(self, run_id: str, payload: dict[str, Any]) -> WorkspaceManifest:
        if RUN_ID.fullmatch(run_id) is None:
            raise ValueError("Run id must be a safe 1-120 character identifier")
        destination = (self.runs_root / f"{run_id}.json").resolve()
        if not destination.is_relative_to(self.runs_root):
            raise ValueError("Unsafe Run manifest path")
        now = utc_now()
        existing = next((item for item in self._manifest.runs if item.run_id == run_id), None)
        run_payload = {**payload, "schema_version": "1.0", "run_id": run_id}
        atomic_write_json(destination, run_payload)
        asset = WorkspaceRunAsset(
            run_id=run_id,
            status=str(payload.get("status", "unknown")),
            path=destination.relative_to(self.root).as_posix(),
            created_at=existing.created_at if existing is not None else now,
            updated_at=now,
        )
        self._manifest.runs = [item for item in self._manifest.runs if item.run_id != run_id] + [asset]
        self._manifest.runs.sort(key=lambda item: item.run_id)
        self._touch()
        return self.manifest()

    def record_agent_run(self, payload: dict[str, Any]) -> AgentRunManifest:
        run = AgentRunManifest.model_validate(payload)
        if run.session_id != self.session_id:
            raise ValueError("Agent Run Session does not match this Workspace")
        self.record_run(run.run_id, run.model_dump(mode="json"))
        return run

    def agent_runs(self) -> list[AgentRunManifest]:
        runs: list[AgentRunManifest] = []
        for asset in self._manifest.runs:
            source = (self.root / asset.path).resolve()
            if not source.is_relative_to(self.runs_root) or not source.is_file():
                raise ValueError(f"Unsafe or missing Run asset: {asset.run_id}")
            try:
                run = AgentRunManifest.model_validate_json(source.read_text(encoding="utf-8"))
            except Exception:
                # Phase 1 allowed generic run fixtures. They remain indexed but are not
                # presented as Native Agent Run manifests.
                continue
            if run.session_id != self.session_id:
                raise ValueError("Agent Run Session does not match this Workspace")
            runs.append(run)
        return sorted(runs, key=lambda item: (item.turn, item.run_id))

    def set_layer_preference(
        self,
        layer_id: str,
        *,
        visible: bool | None = None,
        opacity: float | None = None,
    ) -> WorkspaceManifest:
        current = self._manifest.layer_preferences.get(layer_id, LayerDisplayPreference())
        next_preference = LayerDisplayPreference(
            visible=current.visible if visible is None else visible,
            opacity=current.opacity if opacity is None else opacity,
        )
        if next_preference != current or layer_id not in self._manifest.layer_preferences:
            self._manifest.layer_preferences[layer_id] = next_preference
            self._touch()
        return self.manifest()

    def remove_layer_assets(self, layer_id: str) -> WorkspaceManifest:
        removed_imports = [item for item in self._manifest.imports if item.layer_id == layer_id]
        for asset in removed_imports:
            source = (self.root / asset.path).resolve()
            if not source.is_relative_to(self.imports_root):
                raise ValueError(f"Unsafe import asset for Layer {layer_id}")
            asset_root = source.parent
            if asset_root.parent != self.imports_root or not asset_root.name.startswith("import_"):
                raise ValueError(f"Unexpected import asset layout for Layer {layer_id}")
            shutil.rmtree(asset_root, ignore_errors=False)
        self._manifest.imports = [item for item in self._manifest.imports if item.layer_id != layer_id]
        self._manifest.layer_preferences.pop(layer_id, None)
        self._touch()
        return self.manifest()

    def _clear_directory(self, directory: Path) -> None:
        resolved = directory.resolve()
        if resolved == self.root or not resolved.is_relative_to(self.root):
            raise ValueError(f"Unsafe Workspace asset directory: {directory}")
        resolved.mkdir(parents=True, exist_ok=True)
        for child in resolved.iterdir():
            if child.is_symlink() or child.is_file():
                child.unlink()
            elif child.is_dir():
                shutil.rmtree(child)
            else:
                raise ValueError(f"Unsupported Workspace asset: {child}")

    def reset_assets(self) -> WorkspaceManifest:
        """Clear bounded import/run assets and reset indexes without deleting the workspace root."""
        self._clear_directory(self.imports_root)
        self._clear_directory(self.runs_root)
        self.tool_executions_path.unlink(missing_ok=True)
        self._manifest.active_dataset = None
        self._manifest.active_scenario = None
        self._manifest.imports = []
        self._manifest.input_layers = []
        self._manifest.derived_layers = []
        self._manifest.exports = []
        self._manifest.runs = []
        self._manifest.layer_preferences = {}
        self._touch()
        return self.manifest()
