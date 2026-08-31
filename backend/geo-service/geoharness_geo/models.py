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


class WorkspaceImportAsset(BaseModel):
    asset_id: str
    file_name: str
    format: Literal["geojson", "shapefile", "gpkg", "csv"]
    path: str
    size_bytes: int = Field(ge=0)
    layer_id: str
    source_layer: str | None = None
    created_at: str
    warnings: list[str] = Field(default_factory=list)


class WorkspaceRunAsset(BaseModel):
    run_id: str
    status: str
    path: str
    created_at: str
    updated_at: str


class AgentRunError(BaseModel):
    classification: Literal["provider", "tool", "data"]
    code: str | None = None
    message: str = Field(max_length=2_000)
    event_seq: int = Field(ge=0)
    call_id: str | None = None


class AgentRunRetry(BaseModel):
    event_seq: int = Field(ge=0)
    provider: str | None = None
    code: str | None = None
    retry: int = Field(ge=0)
    max_retries: int = Field(ge=0)


class AgentRunToolCall(BaseModel):
    call_id: str = Field(min_length=1, max_length=180)
    name: str = Field(min_length=1, max_length=180)
    status: Literal["running", "success", "failed"]
    event_seq: int = Field(ge=0)
    result_event_seq: int | None = Field(default=None, ge=0)
    arguments: dict[str, Any] = Field(default_factory=dict)
    input_layers: list[str] = Field(default_factory=list)
    output_layers: list[str] = Field(default_factory=list)
    summary: str | None = Field(default=None, max_length=2_000)


class AgentRunFinalAnswer(BaseModel):
    event_seq: int = Field(ge=0)
    text: str = Field(max_length=20_000)


class AgentRunManifest(BaseModel):
    schema_version: Literal["1.0"] = "1.0"
    run_id: str = Field(pattern=r"^[A-Za-z0-9._-]{1,120}$")
    session_id: str = Field(min_length=1, max_length=120)
    turn: int = Field(ge=1)
    user_goal: str = Field(min_length=1, max_length=20_000)
    user_event_seq: int = Field(ge=0)
    started_at: str | None = None
    finished_at: str | None = None
    status: Literal["running", "success", "failed"]
    provider: str | None = Field(default=None, max_length=180)
    model: str | None = Field(default=None, max_length=300)
    max_event_seq: int = Field(ge=0)
    tool_calls: list[AgentRunToolCall] = Field(default_factory=list)
    input_layers: list[str] = Field(default_factory=list)
    output_layers: list[str] = Field(default_factory=list)
    reused_layers: list[str] = Field(default_factory=list)
    final_answer: AgentRunFinalAnswer | None = None
    errors: list[AgentRunError] = Field(default_factory=list)
    retries: list[AgentRunRetry] = Field(default_factory=list)


class LayerDisplayPreference(BaseModel):
    visible: bool = True
    opacity: float = Field(default=1.0, ge=0, le=1)


class WorkspaceManifest(BaseModel):
    schema_version: Literal["1.0"] = "1.0"
    workspace_id: str
    session_id: str
    created_at: str
    updated_at: str
    active_dataset: str | None = None
    active_scenario: str | None = None
    imports: list[WorkspaceImportAsset] = Field(default_factory=list)
    input_layers: list[WorkspaceLayerAsset] = Field(default_factory=list)
    derived_layers: list[WorkspaceLayerAsset] = Field(default_factory=list)
    exports: list[WorkspaceExportAsset] = Field(default_factory=list)
    runs: list[WorkspaceRunAsset] = Field(default_factory=list)
    layer_preferences: dict[str, LayerDisplayPreference] = Field(default_factory=dict)
