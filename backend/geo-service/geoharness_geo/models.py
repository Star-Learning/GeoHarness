from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, Field


class LayerMetadata(BaseModel):
    layer_id: str
    name: str
    type: Literal["vector"] = "vector"
    geometry: str
    crs: str
    feature_count: int = Field(ge=0)
    source: Literal["scenario", "upload", "derived"]
    generated_by: str | None = None
    parents: list[str] = Field(default_factory=list)
    parameters: dict[str, Any] | None = None
    storage_path: str
    created_at: str
    bbox: list[float] = Field(default_factory=list)


class ToolResult(BaseModel):
    success: bool
    tool: str
    step_id: str | None = None
    inputs: list[str] = Field(default_factory=list)
    parameters: dict[str, Any] = Field(default_factory=dict)
    outputs: list[str] = Field(default_factory=list)
    summary: str
    warnings: list[str] = Field(default_factory=list)
    data: dict[str, Any] = Field(default_factory=dict)


class ToolRequest(BaseModel):
    step_id: str | None = None
    parameters: dict[str, Any] = Field(default_factory=dict)


class ImportLayerRequest(BaseModel):
    path: str
    name: str | None = None
    source: Literal["scenario", "upload"] = "scenario"


class WorkspaceLayerAsset(BaseModel):
    layer_id: str
    name: str
    role: Literal["input", "derived"]
    source: Literal["scenario", "upload", "derived"]
    storage_path: str
    created_at: str


class WorkspaceExportAsset(BaseModel):
    asset_id: str
    layer_id: str
    format: Literal["geojson", "gpkg", "csv"]
    path: str
    feature_count: int = Field(ge=0)
    size_bytes: int = Field(ge=0)
    created_at: str


class WorkspaceRunAsset(BaseModel):
    run_id: str
    status: str
    path: str
    created_at: str
    updated_at: str


class WorkspaceManifest(BaseModel):
    schema_version: Literal["1.0"] = "1.0"
    workspace_id: str
    session_id: str
    created_at: str
    updated_at: str
    active_dataset: str | None = None
    active_scenario: str | None = None
    input_layers: list[WorkspaceLayerAsset] = Field(default_factory=list)
    derived_layers: list[WorkspaceLayerAsset] = Field(default_factory=list)
    exports: list[WorkspaceExportAsset] = Field(default_factory=list)
    runs: list[WorkspaceRunAsset] = Field(default_factory=list)
