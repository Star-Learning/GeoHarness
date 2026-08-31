from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field


class DatasetLayerCatalog(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: str = Field(pattern=r"^[A-Za-z0-9][A-Za-z0-9._-]{0,119}$")
    path: str = Field(min_length=1, max_length=500)
    description: str = Field(min_length=1, max_length=1_000)


class DatasetCatalog(BaseModel):
    model_config = ConfigDict(extra="forbid")

    schema_ref: str | None = Field(default=None, alias="$schema")
    schema_version: Literal["1.0"] = "1.0"
    id: str = Field(pattern=r"^[a-z0-9][a-z0-9._-]{0,119}$")
    title: str = Field(min_length=1, max_length=180)
    description: str = Field(min_length=1, max_length=2_000)
    region: str = Field(min_length=1, max_length=300)
    crs: str = Field(min_length=1, max_length=80)
    snapshot_date: str | None = None
    publishers: list[str] = Field(default_factory=list, max_length=50)
    layers: list[DatasetLayerCatalog] = Field(min_length=1, max_length=200)
    license: str = Field(min_length=1, max_length=300)
    source_audit: str | None = Field(default=None, max_length=500)


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


class WorkspaceToolExecution(BaseModel):
    step_id: str = Field(min_length=1, max_length=180)
    tool: str = Field(min_length=1, max_length=180)
    request_hash: str = Field(pattern=r"^[a-f0-9]{64}$")
    result: ToolResult
    created_at: str


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
    warnings: list[str] = Field(default_factory=list)
    result_data: dict[str, Any] = Field(default_factory=dict)


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


class ResultLayerSnapshot(BaseModel):
    layer_id: str
    name: str
    role: Literal["input", "output"]
    source: Literal["scenario", "upload", "derived"]
    geometry: str
    crs: str
    feature_count: int = Field(ge=0)
    generated_by: str | None = None
    parents: list[str] = Field(default_factory=list)
    warnings: list[str] = Field(default_factory=list)


class ResultStatistic(BaseModel):
    call_id: str
    tool: str
    summary: str | None = None
    data: dict[str, Any] = Field(default_factory=dict)


class ResultSource(BaseModel):
    layer_id: str
    kind: Literal["upload", "scenario", "derived"]
    name: str
    detail: str


class ResultAsset(BaseModel):
    asset_type: Literal["export", "run"]
    asset_id: str
    file_name: str
    format: Literal["geojson", "gpkg", "csv", "json"]
    layer_id: str | None = None
    feature_count: int | None = Field(default=None, ge=0)
    size_bytes: int = Field(ge=0)
    created_at: str
    downloadable: bool


class ResultToolCounts(BaseModel):
    total: int = Field(ge=0)
    success: int = Field(ge=0)
    failed: int = Field(ge=0)
    running: int = Field(ge=0)


class ResultCenter(BaseModel):
    schema_version: Literal["1.0"] = "1.0"
    run_id: str
    session_id: str
    turn: int = Field(ge=1)
    status: Literal["running", "success", "failed"]
    user_goal: str
    final_answer: str | None = None
    provider: str | None = None
    model: str | None = None
    tools: ResultToolCounts
    input_layers: list[ResultLayerSnapshot] = Field(default_factory=list)
    output_layers: list[ResultLayerSnapshot] = Field(default_factory=list)
    statistics: list[ResultStatistic] = Field(default_factory=list)
    crs: list[str] = Field(default_factory=list)
    units: list[str] = Field(default_factory=list)
    sources: list[ResultSource] = Field(default_factory=list)
    warnings: list[str] = Field(default_factory=list)
    assets: list[ResultAsset] = Field(default_factory=list)


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
