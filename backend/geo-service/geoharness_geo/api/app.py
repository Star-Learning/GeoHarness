from __future__ import annotations

from pathlib import Path
from typing import Iterable

import geopandas
import pyproj
import shapely
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from ..models import ImportLayerRequest, LayerMetadata, ToolRequest, ToolResult, WorkspaceManifest
from ..operations import TOOL_NAMES, GeoTools
from ..registry import LayerNotFoundError, LayerRegistry
from ..workspace import WorkspaceStore


def create_app(
    workspace_root: str | Path,
    *,
    allowed_import_roots: Iterable[str | Path] = (),
) -> FastAPI:
    resolved_workspace = Path(workspace_root).resolve()
    workspace = WorkspaceStore(
        resolved_workspace,
        workspace_id=resolved_workspace.name,
        session_id=resolved_workspace.name,
    )
    registry = LayerRegistry(resolved_workspace)
    workspace.sync_layers(registry.list_layers())
    tools = GeoTools(registry)
    allowed_roots = [Path(root).resolve() for root in allowed_import_roots]
    app = FastAPI(title="GeoHarness Geo Service", version="1.0.0")
    app.add_middleware(
        CORSMiddleware,
        allow_origin_regex=r"^https?://(127\.0\.0\.1|localhost)(:\d+)?$",
        allow_credentials=False,
        allow_methods=["GET", "POST"],
        allow_headers=["content-type"],
    )
    app.state.registry = registry
    app.state.workspace = workspace
    app.state.tools = tools

    @app.get("/health")
    def health() -> dict:
        return {
            "status": "ok",
            "service": "geoharness-geo-service",
            "tools": list(TOOL_NAMES),
            "versions": {
                "geopandas": geopandas.__version__,
                "shapely": shapely.__version__,
                "pyproj": pyproj.__version__,
            },
        }

    @app.get("/layers", response_model=list[LayerMetadata])
    def list_layers() -> list[LayerMetadata]:
        return registry.list_layers()

    @app.get("/workspace", response_model=WorkspaceManifest)
    def workspace_manifest() -> WorkspaceManifest:
        return workspace.sync_layers(registry.list_layers())

    @app.get("/layers/{layer_id}", response_model=LayerMetadata)
    def layer_metadata(layer_id: str) -> LayerMetadata:
        try:
            return registry.metadata(layer_id)
        except LayerNotFoundError as error:
            raise HTTPException(status_code=404, detail=str(error)) from error

    @app.get("/layers/{layer_id}/geojson")
    def layer_geojson(layer_id: str) -> dict:
        try:
            return registry.geojson(layer_id)
        except LayerNotFoundError as error:
            raise HTTPException(status_code=404, detail=str(error)) from error

    @app.post("/layers/import", response_model=LayerMetadata)
    def import_layer(request: ImportLayerRequest) -> LayerMetadata:
        source_path = Path(request.path).resolve()
        if not allowed_roots or not any(source_path.is_relative_to(root) for root in allowed_roots):
            raise HTTPException(status_code=403, detail="Import path is outside configured Scenario roots")
        try:
            metadata = registry.register_file(source_path, name=request.name, source=request.source)
            workspace.sync_layers(registry.list_layers())
            return metadata
        except (FileNotFoundError, ValueError) as error:
            raise HTTPException(status_code=400, detail=str(error)) from error

    @app.post("/tools/{tool_name}", response_model=ToolResult)
    def execute_tool(tool_name: str, request: ToolRequest) -> ToolResult:
        result = tools.execute(tool_name, step_id=request.step_id, **request.parameters)
        workspace.sync_layers(registry.list_layers())
        if result.success and result.tool == "export_layer":
            workspace.record_export(
                layer_id=result.inputs[0],
                format=str(result.data["format"]),
                relative_path=str(result.data["path"]),
                feature_count=int(result.data["feature_count"]),
            )
        return result

    return app
