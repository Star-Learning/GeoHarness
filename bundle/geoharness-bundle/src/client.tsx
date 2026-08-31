import { jsx as _jsx } from 'react/jsx-runtime'
import * as React from 'react'
import {
  registerWorkspaceProjection,
  setLayerOpacity,
  toggleLayerVisibility,
  type GeoJsonFeature,
  type GeoJsonGeometry,
  type LayerRecord,
  type WorkspaceProjectionItem,
} from './layer-registry'
import {
  humanGoalCount,
  latestHumanGoal,
  projectAgentHistory,
  type AgentStreamItem,
  type AgentToolStep,
} from './agent-session'
import {
  layerIdsForStep,
  mergeVerificationLayers,
  stepStatus,
} from './verification-map'

declare const __GE0HARNESS_CSS__: string

const PACKAGE_NAME = '@geoharness/harness-plugin'

type SlotName =
  | 'conversation.session'
  | 'sidebar.brand.mark'
  | 'sidebar.brand.name'

interface SlotRegistration {
  name: SlotName
  priority?: number
  inject?: (sessionId: string) => GeoHarnessInjected
}

interface SlotService {
  register(options: SlotRegistration, component: React.ComponentType<any>): () => void
}

interface ApiResponse<T> {
  result: { ok: true, value: T } | { ok: false, error: { message: string, code?: string } }
}

interface ClientContext {
  slots: SlotService
  connection?: {
    api: {
      sessions: {
        history(payload: { sessionId: string, maxMessages?: number }): Promise<ApiResponse<{ events: unknown[] }>>
      }
    }
    rpc: {
      call(channel: string, endpoint: string, payload: unknown, signal?: AbortSignal): Promise<{
        ok: boolean
        value?: unknown
        error?: { message?: string }
      }>
    }
  }
}

interface SelectedFeature {
  layer: LayerRecord
  feature: GeoJsonFeature
  featureIndex: number
}

function installStyles() {
  if (typeof document === 'undefined') return
  if (document.querySelector(`style[data-plugin=${JSON.stringify(PACKAGE_NAME)}]`) !== null) return
  const style = document.createElement('style')
  style.dataset.plugin = PACKAGE_NAME
  style.textContent = __GE0HARNESS_CSS__
  document.head.appendChild(style)
}

function BrandMark() {
  return <span className="gh-brand-mark" aria-hidden="true">⌖</span>
}

function coordinateArrays(value: unknown, target: [number, number][]) {
  if (!Array.isArray(value)) return
  if (value.length >= 2 && typeof value[0] === 'number' && typeof value[1] === 'number') {
    target.push([value[0], value[1]])
    return
  }
  for (const child of value) coordinateArrays(child, target)
}

function layerBounds(layers: readonly LayerRecord[]) {
  const coordinates: [number, number][] = []
  for (const layer of layers) {
    for (const feature of layer.data.features) coordinateArrays(feature.geometry.coordinates, coordinates)
  }
  if (coordinates.length === 0) return [-74.02, 40.69, -73.95, 40.73] as const
  const xs = coordinates.map(point => point[0])
  const ys = coordinates.map(point => point[1])
  return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)] as const
}

function position(value: unknown): [number, number] | null {
  if (!Array.isArray(value) || value.length < 2) return null
  return typeof value[0] === 'number' && typeof value[1] === 'number' ? [value[0], value[1]] : null
}

function linePath(value: unknown, project: (point: [number, number]) => [number, number], close = false) {
  if (!Array.isArray(value)) return ''
  const points = value.map(position).filter((point): point is [number, number] => point !== null)
  if (points.length === 0) return ''
  const commands = points.map((point, index) => {
    const [x, y] = project(point)
    return `${index === 0 ? 'M' : 'L'}${x.toFixed(2)},${y.toFixed(2)}`
  })
  return `${commands.join(' ')}${close ? ' Z' : ''}`
}

function geometryPaths(geometry: GeoJsonGeometry, project: (point: [number, number]) => [number, number]) {
  const coordinates = geometry.coordinates
  if (geometry.type === 'LineString') return [linePath(coordinates, project)]
  if (geometry.type === 'MultiLineString' && Array.isArray(coordinates)) {
    return coordinates.map(item => linePath(item, project))
  }
  if (geometry.type === 'Polygon' && Array.isArray(coordinates)) {
    return [coordinates.map(ring => linePath(ring, project, true)).join(' ')]
  }
  if (geometry.type === 'MultiPolygon' && Array.isArray(coordinates)) {
    return coordinates.map(polygon => Array.isArray(polygon)
      ? polygon.map(ring => linePath(ring, project, true)).join(' ')
      : '')
  }
  return []
}

function pointCoordinates(geometry: GeoJsonGeometry): [number, number][] {
  if (geometry.type === 'Point') {
    const point = position(geometry.coordinates)
    return point === null ? [] : [point]
  }
  if (geometry.type === 'MultiPoint' && Array.isArray(geometry.coordinates)) {
    return geometry.coordinates.map(position).filter((point): point is [number, number] => point !== null)
  }
  return []
}

function featureLabel(feature: GeoJsonFeature, index: number) {
  const properties = feature.properties ?? {}
  const label = properties.name ?? properties.building_id ?? properties.road_id
    ?? properties.river_id ?? properties.district_id ?? feature.id
  return label === undefined ? `Feature ${index + 1}` : String(label)
}

function GeoMap({
  layers,
  selected,
  highlightedLayerIds,
  runStatus,
  onSelect,
}: {
  layers: readonly LayerRecord[]
  selected: SelectedFeature | null
  highlightedLayerIds: ReadonlySet<string>
  runStatus: 'ready' | 'running' | 'success' | 'failed'
  onSelect: (value: SelectedFeature | null) => void
}) {
  const [zoom, setZoom] = React.useState(1)
  const [pan, setPan] = React.useState({ x: 0, y: 0 })
  const drag = React.useRef<{ x: number, y: number, panX: number, panY: number } | null>(null)
  const bounds = React.useMemo(() => layerBounds(layers), [layers])
  const project = React.useMemo(() => {
    const [minX, minY, maxX, maxY] = bounds
    const width = Math.max(maxX - minX, 0.000001)
    const height = Math.max(maxY - minY, 0.000001)
    const scale = Math.min(900 / width, 600 / height)
    const offsetX = (1000 - width * scale) / 2
    const offsetY = (700 - height * scale) / 2
    return ([x, y]: [number, number]): [number, number] => [
      offsetX + (x - minX) * scale,
      700 - (offsetY + (y - minY) * scale),
    ]
  }, [bounds])
  const visibleLayers = layers.filter(layer => layer.visible)
  const centerLongitude = ((bounds[0] + bounds[2]) / 2).toFixed(4)
  const centerLatitude = ((bounds[1] + bounds[3]) / 2).toFixed(4)
  const orderedLayers = [...visibleLayers].sort((left, right) => {
    const order: Record<string, number> = { districts: 0, rivers: 1, roads: 2, buildings: 3 }
    return (order[left.name] ?? 4) - (order[right.name] ?? 4)
  })
  const highlightedLayers = visibleLayers.filter(layer => highlightedLayerIds.has(layer.id))
  const focusFrame = highlightedLayers.length === 0 ? null : (() => {
    const [minX, minY, maxX, maxY] = layerBounds(highlightedLayers)
    const [left, bottom] = project([minX, minY])
    const [right, top] = project([maxX, maxY])
    const padding = 17
    const x = Math.max(8, Math.min(left, right) - padding)
    const y = Math.max(8, Math.min(top, bottom) - padding)
    return {
      x,
      y,
      width: Math.min(992 - x, Math.abs(right - left) + padding * 2),
      height: Math.min(692 - y, Math.abs(bottom - top) + padding * 2),
    }
  })()

  return (
    <section className="gh-map" aria-label="Map workspace">
      <div className="gh-map-toolbar" aria-label="Map controls">
        <button type="button" onClick={() => setZoom(value => Math.min(5, value * 1.35))} aria-label="Zoom in">+</button>
        <button type="button" onClick={() => setZoom(value => Math.max(0.7, value / 1.35))} aria-label="Zoom out">−</button>
        <button type="button" onClick={() => { setZoom(1); setPan({ x: 0, y: 0 }) }} aria-label="Fit bounds">⌖</button>
      </div>
      <div className="gh-map-label"><span>{layers.length > 0 ? 'NYC OPEN DATA' : 'AGENT WORKSPACE'}</span><small>{centerLatitude}° N · {Math.abs(Number(centerLongitude)).toFixed(4)}° W</small></div>
      <svg
        className="gh-map-canvas"
        viewBox="0 0 1000 700"
        role="img"
        aria-label="Interactive Agent workspace map"
        onPointerDown={event => {
          drag.current = { x: event.clientX, y: event.clientY, panX: pan.x, panY: pan.y }
          event.currentTarget.setPointerCapture(event.pointerId)
        }}
        onPointerMove={event => {
          if (drag.current === null) return
          setPan({
            x: drag.current.panX + event.clientX - drag.current.x,
            y: drag.current.panY + event.clientY - drag.current.y,
          })
        }}
        onPointerUp={event => {
          drag.current = null
          event.currentTarget.releasePointerCapture(event.pointerId)
        }}
        onPointerCancel={() => { drag.current = null }}
        onWheel={event => {
          event.preventDefault()
          const factor = Math.exp(-event.deltaY * 0.0015)
          setZoom(value => Math.max(0.7, Math.min(5, value * factor)))
        }}
        onClick={() => onSelect(null)}
      >
        <g transform={`translate(${500 + pan.x} ${350 + pan.y}) scale(${zoom}) translate(-500 -350)`}>
          {orderedLayers.map(layer => layer.data.features.map((feature, featureIndex) => {
            const isSelected = selected?.layer.id === layer.id && selected.featureIndex === featureIndex
            const select = (event: React.MouseEvent) => {
              event.stopPropagation()
              onSelect({ layer, feature, featureIndex })
            }
            const common = {
              key: `${layer.id}-${feature.id ?? featureIndex}`,
              className: [
                'gh-map-feature',
                isSelected ? 'is-selected' : '',
                highlightedLayerIds.has(layer.id) ? 'is-step-highlighted' : '',
              ].filter(Boolean).join(' '),
              opacity: layer.opacity,
              stroke: layer.style.color,
              strokeWidth: isSelected ? layer.style.lineWidth + 2.4 : layer.style.lineWidth,
              vectorEffect: 'non-scaling-stroke' as const,
              onClick: select,
            }
            const paths = geometryPaths(feature.geometry, project)
            const points = pointCoordinates(feature.geometry)
            if (paths.length > 0) {
              const polygon = feature.geometry.type.includes('Polygon')
              return <g key={common.key}>
                <title>{featureLabel(feature, featureIndex)}</title>
                {paths.map((path, pathIndex) => <path
                  {...common}
                  key={`${common.key}-${pathIndex}`}
                  d={path}
                  fill={polygon ? layer.style.color : 'none'}
                  fillOpacity={polygon ? layer.style.fillOpacity : 0}
                  fillRule="evenodd"
                />)}
              </g>
            }
            return <g key={common.key}>
              <title>{featureLabel(feature, featureIndex)}</title>
              {points.map((point, pointIndex) => {
                const [x, y] = project(point)
                return <circle {...common} key={`${common.key}-${pointIndex}`} cx={x} cy={y} r={isSelected ? 7 : 5} fill={layer.style.color} />
              })}
            </g>
          }))}
          {focusFrame !== null && <g className={`gh-map-result-focus is-${runStatus}`} aria-hidden="true">
            <rect
              x={focusFrame.x}
              y={focusFrame.y}
              width={focusFrame.width}
              height={focusFrame.height}
              rx="9"
              vectorEffect="non-scaling-stroke"
            />
            <path
              d={`M${focusFrame.x},${focusFrame.y + 32}V${focusFrame.y}H${focusFrame.x + 32} M${focusFrame.x + focusFrame.width - 32},${focusFrame.y}H${focusFrame.x + focusFrame.width} M${focusFrame.x},${focusFrame.y + focusFrame.height - 32}V${focusFrame.y + focusFrame.height}H${focusFrame.x + 32} M${focusFrame.x + focusFrame.width - 32},${focusFrame.y + focusFrame.height}H${focusFrame.x + focusFrame.width}V${focusFrame.y + focusFrame.height - 32}`}
              vectorEffect="non-scaling-stroke"
            />
          </g>}
        </g>
      </svg>
      {layers.length === 0 && <div className="gh-map-empty-card">
        <span className="gh-eyebrow">MAP WORKSPACE</span>
        <strong>No registered layers</strong>
        <p>点击顶部“导入数据”上传自己的矢量文件，或在右侧原生 Harness 对话框让 Agent 发现可用数据。</p>
      </div>}
      <div className="gh-map-scale"><span /> {zoom.toFixed(1)}×</div>
      <div className="gh-map-attribution">{layers.length > 0 ? 'Canonical Agent workspace' : 'Agent workspace awaiting data'} · map CRS84</div>
      {selected !== null && <aside className="gh-feature-inspector" aria-label="Feature inspection">
        <button type="button" onClick={() => onSelect(null)} aria-label="Close feature inspection">×</button>
        <span className="gh-eyebrow">FEATURE INSPECTION</span>
        <strong>{featureLabel(selected.feature, selected.featureIndex)}</strong>
        <small>{selected.layer.name} · {selected.feature.geometry.type}</small>
        <dl>
          {Object.entries(selected.feature.properties ?? {}).slice(0, 8).map(([key, value]) => <React.Fragment key={key}>
            <dt>{key}</dt><dd>{value === null ? 'null' : String(value)}</dd>
          </React.Fragment>)}
        </dl>
      </aside>}
    </section>
  )
}

interface WorkspaceProjection {
  status: 'ready' | 'failed'
  issues: string[]
  layers: WorkspaceProjectionItem[]
}

interface ImportCapabilities {
  schema_version: '1.0'
  max_file_bytes: number
  hard_max_file_bytes: number
  formats: string[]
  extensions: string[]
}

interface ImportRequest {
  fileName: string
  contentBase64: string
  name?: string
  sourceLayer?: string
  longitudeField?: string
  latitudeField?: string
  crs?: string
}

interface ImportResult {
  metadata: {
    layer_id: string
    name: string
    feature_count: number
    geometry: string
    crs: string
  }
  format: string
  source_layer: string | null
  fields: { name: string, type: string }[]
  warnings: string[]
}

interface ImportDraft {
  file: File
  extension: string
  name: string
  sourceLayer: string
  longitudeField: string
  latitudeField: string
  crs: string
}

function readFileAsBase64(file: File, onProgress: (progress: number) => void): Promise<string> {
  return new Promise((resolvePromise, rejectPromise) => {
    const reader = new FileReader()
    reader.onprogress = event => {
      if (event.lengthComputable && event.total > 0) onProgress(event.loaded / event.total)
    }
    reader.onerror = () => rejectPromise(reader.error ?? new Error('读取文件失败'))
    reader.onload = () => {
      if (typeof reader.result !== 'string') return rejectPromise(new Error('浏览器没有返回可上传的文件内容'))
      const comma = reader.result.indexOf(',')
      if (comma < 0) return rejectPromise(new Error('浏览器文件编码失败'))
      onProgress(1)
      resolvePromise(reader.result.slice(comma + 1))
    }
    reader.readAsDataURL(file)
  })
}

function fileSizeLabel(bytes: number) {
  return bytes < 1024 * 1024 ? `${(bytes / 1024).toFixed(1)} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

interface GeoHarnessInjected {
  agent: {
    history(): Promise<{ events: unknown[] }>
    workspace(): Promise<WorkspaceProjection>
    importCapabilities(): Promise<ImportCapabilities>
    importData(request: ImportRequest): Promise<ImportResult>
  }
}

interface GeoHarnessSessionProps extends GeoHarnessInjected {
  sessionId: string
}

function resultValue<T>(response: ApiResponse<T>, operation: string): T {
  if (!response.result.ok) throw new Error(`${operation}: ${response.result.error.message}`)
  return response.result.value
}

function argumentSummary(args: Record<string, unknown>) {
  const pairs = Object.entries(args).filter(([key]) => key !== 'step_id').slice(0, 3)
  if (pairs.length === 0) return 'Agent-selected parameters'
  return pairs.map(([key, value]) => `${key}=${typeof value === 'string' || typeof value === 'number' ? value : '…'}`).join(' · ')
}

interface LayerWorkspaceSnapshot {
  sessionId: string | null
  layers: LayerRecord[]
  highlightedLayerIds: ReadonlySet<string>
}

const layerListeners = new Set<() => void>()
const layersBySession = new Map<string, LayerRecord[]>()
let layerSnapshot: LayerWorkspaceSnapshot = {
  sessionId: null,
  layers: [],
  highlightedLayerIds: new Set(),
}

function publishLayerSnapshot(next: LayerWorkspaceSnapshot) {
  layerSnapshot = next
  for (const listener of layerListeners) listener()
}

const layerWorkspace = {
  subscribe(listener: () => void) {
    layerListeners.add(listener)
    return () => { layerListeners.delete(listener) }
  },
  getSnapshot() { return layerSnapshot },
  activate(sessionId: string) {
    if (layerSnapshot.sessionId === sessionId) return
    publishLayerSnapshot({
      sessionId,
      layers: layersBySession.get(sessionId) ?? [],
      highlightedLayerIds: new Set(),
    })
  },
  project(sessionId: string, projection: readonly WorkspaceProjectionItem[]) {
    const layers = registerWorkspaceProjection(layersBySession.get(sessionId) ?? [], projection)
    layersBySession.set(sessionId, layers)
    if (layerSnapshot.sessionId === sessionId) publishLayerSnapshot({ ...layerSnapshot, layers })
  },
  update(sessionId: string, update: (layers: readonly LayerRecord[]) => LayerRecord[]) {
    const layers = update(layersBySession.get(sessionId) ?? [])
    layersBySession.set(sessionId, layers)
    if (layerSnapshot.sessionId === sessionId) publishLayerSnapshot({ ...layerSnapshot, layers })
  },
  highlight(sessionId: string, highlightedLayerIds: ReadonlySet<string>) {
    if (layerSnapshot.sessionId !== sessionId) return
    const current = [...layerSnapshot.highlightedLayerIds].sort().join('\n')
    const next = [...highlightedLayerIds].sort().join('\n')
    if (current === next) return
    publishLayerSnapshot({ ...layerSnapshot, highlightedLayerIds: new Set(highlightedLayerIds) })
  },
}

function useLayerWorkspace() {
  return React.useSyncExternalStore(layerWorkspace.subscribe, layerWorkspace.getSnapshot)
}

function renderLayerRow(
  sessionId: string,
  layer: LayerRecord,
  highlightedLayerIds: ReadonlySet<string>,
  outputStatus?: AgentToolStep['status'],
) {
  return (
    <article
      className={highlightedLayerIds.has(layer.id) ? 'gh-layer-row is-step-highlighted' : 'gh-layer-row'}
      data-layer-id={layer.id}
      data-layer-name={layer.name}
      key={layer.id}
    >
      <button
        type="button"
        className={layer.visible ? 'gh-layer-toggle is-visible' : 'gh-layer-toggle'}
        aria-label={`${layer.visible ? 'Hide' : 'Show'} ${layer.name}`}
        aria-pressed={layer.visible}
        onClick={() => { layerWorkspace.update(sessionId, current => toggleLayerVisibility(current, layer.id)) }}
      ><span style={{ background: layer.style.color }} /></button>
      <div className="gh-layer-meta">
        <strong>{layer.name}{outputStatus === 'success' && <em className="gh-output-check">✓</em>}</strong>
        <small>{layer.geometry} · {layer.featureCount} features</small>
        {layer.generatedBy !== null && <small>step · {layer.generatedBy}</small>}
        <input
          type="range"
          min="0"
          max="1"
          step="0.1"
          value={layer.opacity}
          aria-label={`${layer.name} opacity`}
          onChange={event => {
            const opacity = Number(event.currentTarget.value)
            layerWorkspace.update(sessionId, current => setLayerOpacity(current, layer.id, opacity))
          }}
        />
      </div>
    </article>
  )
}

function GeoHarnessLayerPanel({ onClose }: { onClose: () => void }) {
  const workspace = useLayerWorkspace()
  const inputLayers = workspace.layers.filter(layer => layer.source !== 'derived')
  const derivedLayers = workspace.layers.filter(layer => layer.source === 'derived')
  const visibleCount = workspace.layers.filter(layer => layer.visible).length
  return (
    <section className="gh-sidebar-layers gh-map-layer-panel" aria-label="Layer panel">
      <div className="gh-sidebar-layer-heading">
        <span><b>Layers</b><small>Verified Agent workspace</small></span>
        <span className="gh-layer-panel-actions">
          <span className="gh-panel-count">{workspace.layers.length}</span>
          <button type="button" className="gh-layer-panel-close" aria-label="关闭图层面板" onClick={onClose}>×</button>
        </span>
      </div>
      <div className="gh-layer-section-label">Workspace input data</div>
      <div className="gh-layer-list">
        {inputLayers.map(layer => renderLayerRow(workspace.sessionId ?? '', layer, workspace.highlightedLayerIds))}
      </div>
      <div className="gh-layer-section-label">Agent-created outputs</div>
      <div className="gh-layer-list gh-output-list" aria-label="Task output layers">
        {derivedLayers.length === 0 && <p className="gh-output-empty">Agent 尚未创建派生图层；纯统计结果会显示在右侧。</p>}
        {derivedLayers.map(layer => renderLayerRow(workspace.sessionId ?? '', layer, workspace.highlightedLayerIds, 'success'))}
      </div>
      <div className="gh-layer-footer">
        <span>{visibleCount} visible</span><span>{workspace.layers[0]?.crs ?? 'CRS —'}</span>
      </div>
    </section>
  )
}

function GeoHarnessBrandMark({ size }: { size: number }) {
  return <span className="gh-sidebar-brand-mark" style={{ width: size, height: size }} aria-hidden="true">⌖</span>
}

function GeoHarnessBrandName() {
  return <span className="gh-sidebar-brand-name">GeoHarness</span>
}

function GeoHarnessShell({ agent, sessionId }: GeoHarnessSessionProps) {
  const [goal, setGoal] = React.useState('等待你从右侧原生对话框输入一个空间分析目标。')
  const [selectedFeature, setSelectedFeature] = React.useState<SelectedFeature | null>(null)
  const [runStatus, setRunStatus] = React.useState<'ready' | 'running' | 'success' | 'failed'>('ready')
  const [runError, setRunError] = React.useState<string | null>(null)
  const [selectedStepId, setSelectedStepId] = React.useState<string | null>(null)
  const [runHistoryCount, setRunHistoryCount] = React.useState(0)
  const [taskSteps, setTaskSteps] = React.useState<AgentToolStep[]>([])
  const [agentStream, setAgentStream] = React.useState<AgentStreamItem[]>([])
  const [agentAnswer, setAgentAnswer] = React.useState('')
  const [workspaceStatus, setWorkspaceStatus] = React.useState('awaiting Agent')
  const [layerPanelOpen, setLayerPanelOpen] = React.useState(false)
  const [importCapabilities, setImportCapabilities] = React.useState<ImportCapabilities>({
    schema_version: '1.0',
    max_file_bytes: 20 * 1024 * 1024,
    hard_max_file_bytes: 100 * 1024 * 1024,
    formats: ['geojson', 'shapefile_zip', 'gpkg', 'csv_lon_lat'],
    extensions: ['.geojson', '.json', '.zip', '.gpkg', '.csv'],
  })
  const [importDraft, setImportDraft] = React.useState<ImportDraft | null>(null)
  const [importPhase, setImportPhase] = React.useState<'idle' | 'reading' | 'uploading' | 'success' | 'error'>('idle')
  const [importProgress, setImportProgress] = React.useState(0)
  const [importMessage, setImportMessage] = React.useState('')
  const [importWarnings, setImportWarnings] = React.useState<string[]>([])
  const fileInput = React.useRef<HTMLInputElement | null>(null)
  const activeGoalSeq = React.useRef<number | null>(null)
  const lastAutoStepId = React.useRef<string | null>(null)
  const lastRunStatus = React.useRef<'ready' | 'running' | 'success' | 'failed'>('ready')
  const lastWorkspaceSeq = React.useRef<number | null>(null)
  const agentScroll = React.useRef<HTMLDivElement | null>(null)
  const previousLayerCount = React.useRef(0)
  const layerState = useLayerWorkspace()
  const layers = layerState.sessionId === sessionId ? layerState.layers : []

  React.useEffect(() => {
    previousLayerCount.current = 0
    setLayerPanelOpen(false)
    setImportDraft(null)
    setImportPhase('idle')
    setImportProgress(0)
    setImportMessage('')
    setImportWarnings([])
  }, [sessionId])

  React.useEffect(() => {
    let disposed = false
    void agent.importCapabilities()
      .then(value => { if (!disposed) setImportCapabilities(value) })
      .catch(() => {})
    return () => { disposed = true }
  }, [agent, sessionId])

  React.useEffect(() => {
    if (previousLayerCount.current === 0 && layers.length > 0) setLayerPanelOpen(true)
    previousLayerCount.current = layers.length
  }, [layers.length])

  const streamRevision = agentStream.map(item => `${item.id}:${item.status}:${item.text.length}`).join('|')
  React.useEffect(() => {
    const panel = agentScroll.current
    if (panel === null) return
    panel.scrollTop = runStatus === 'ready' ? 0 : panel.scrollHeight
  }, [runStatus, streamRevision, taskSteps.length])

  React.useEffect(() => {
    layerWorkspace.activate(sessionId)
    let disposed = false
    let timer: ReturnType<typeof setTimeout> | undefined
    const refresh = async () => {
      try {
        const history = await agent.history()
        if (disposed) return
        const humanGoal = latestHumanGoal(history.events)
        let workspaceSeq = -1
        setRunHistoryCount(humanGoalCount(history.events))
        if (humanGoal === null) {
          setRunStatus('ready')
          setRunError(null)
          setTaskSteps([])
          setAgentStream([])
          setAgentAnswer('')
          lastRunStatus.current = 'ready'
        } else {
          const changedGoal = activeGoalSeq.current !== humanGoal.seq
          if (changedGoal) {
            activeGoalSeq.current = humanGoal.seq
            lastAutoStepId.current = null
            setSelectedStepId(null)
          }
          setGoal(humanGoal.text)
          const projection = projectAgentHistory(history.events, humanGoal.seq)
          workspaceSeq = projection.maxSeq
          const status = projection.finished ? (projection.succeeded ? 'success' : 'failed') : 'running'
          setTaskSteps(projection.steps)
          setAgentStream(projection.stream)
          setAgentAnswer(projection.answer)
          setRunStatus(status)
          setRunError(projection.error)
          const activeStep = projection.steps.find(step => step.status === 'running')
          if (activeStep !== undefined && lastAutoStepId.current !== activeStep.id) {
            lastAutoStepId.current = activeStep.id
            setSelectedStepId(activeStep.id)
          } else if (projection.finished && (changedGoal || lastRunStatus.current === 'running')) {
            const outputStep = [...projection.steps].reverse().find(step => step.outputs.length > 0)
            if (outputStep !== undefined) setSelectedStepId(outputStep.id)
          }
          lastRunStatus.current = status
        }
        if (lastWorkspaceSeq.current !== workspaceSeq) {
          try {
            const workspace = await agent.workspace()
            if (disposed) return
            if (workspace.status !== 'ready') throw new Error(workspace.issues.join('; ') || 'Agent workspace verification failed')
            layerWorkspace.project(sessionId, workspace.layers)
            lastWorkspaceSeq.current = workspaceSeq
            setWorkspaceStatus(`${workspace.layers.length} verified layers`)
          } catch (error) {
            if (!disposed) setWorkspaceStatus(error instanceof Error ? error.message : String(error))
          }
        }
      } catch (error) {
        if (!disposed) {
          setRunStatus('failed')
          setRunError(error instanceof Error ? error.message : String(error))
          setWorkspaceStatus('Agent unavailable')
        }
      } finally {
        if (!disposed) timer = setTimeout(refresh, 400)
      }
    }
    void refresh()
    return () => {
      disposed = true
      if (timer !== undefined) clearTimeout(timer)
    }
  }, [agent, sessionId])

  const featureCount = layers.reduce((total, layer) => total + layer.featureCount, 0)
  const derivedLayers = layers.filter(layer => layer.source === 'derived')
  const selectedStep = taskSteps.find(step => step.id === selectedStepId)
  const selectedOutputs = new Set(selectedStep?.outputs ?? [])
  const selectedInputs = new Set(Object.values(selectedStep?.arguments ?? {}).flatMap(value => {
    if (typeof value === 'string') return [value]
    if (Array.isArray(value)) return value.filter((item): item is string => typeof item === 'string')
    return []
  }))
  const semanticStepId = typeof selectedStep?.arguments.step_id === 'string' ? selectedStep.arguments.step_id : null
  const highlightedLayerIds = new Set(layers
    .filter(layer => selectedInputs.has(layer.id)
      || selectedOutputs.has(layer.id)
      || layer.generatedBy === selectedStepId
      || (semanticStepId !== null && layer.generatedBy === semanticStepId))
    .map(layer => layer.id))
  const highlightedLayerKey = [...highlightedLayerIds].sort().join('\n')
  React.useEffect(() => {
    layerWorkspace.highlight(sessionId, highlightedLayerIds)
  }, [sessionId, highlightedLayerKey])
  const successfulSteps = taskSteps.filter(step => step.status === 'success')
  const importBusy = importPhase === 'reading' || importPhase === 'uploading'

  const selectImportFile = (file: File) => {
    const extension = `.${file.name.split('.').pop()?.toLowerCase() ?? ''}`
    if (!importCapabilities.extensions.includes(extension)) {
      setImportDraft(null)
      setImportPhase('error')
      setImportMessage(`不支持 ${extension || '无扩展名'}；请选择 GeoJSON、Shapefile ZIP、GeoPackage 或 CSV。`)
      return
    }
    if (file.size === 0 || file.size > importCapabilities.max_file_bytes) {
      setImportDraft(null)
      setImportPhase('error')
      setImportMessage(`文件必须大于 0 且不超过 ${fileSizeLabel(importCapabilities.max_file_bytes)}。`)
      return
    }
    setImportDraft({
      file,
      extension,
      name: file.name.replace(/\.(?:geojson|json|zip|gpkg|csv)$/iu, ''),
      sourceLayer: '',
      longitudeField: extension === '.csv' ? 'longitude' : '',
      latitudeField: extension === '.csv' ? 'latitude' : '',
      crs: extension === '.csv' ? 'EPSG:4326' : '',
    })
    setImportPhase('idle')
    setImportProgress(0)
    setImportMessage('')
    setImportWarnings([])
  }

  const submitImport = async () => {
    const draft = importDraft
    if (draft === null || importBusy) return
    try {
      setImportPhase('reading')
      setImportProgress(2)
      setImportMessage('正在读取本地文件…')
      setImportWarnings([])
      const contentBase64 = await readFileAsBase64(draft.file, progress => {
        setImportProgress(Math.round(5 + progress * 55))
      })
      setImportPhase('uploading')
      setImportProgress(70)
      setImportMessage('正在校验并注册 canonical Layer…')
      const result = await agent.importData({
        fileName: draft.file.name,
        contentBase64,
        name: draft.name.trim() || undefined,
        sourceLayer: draft.sourceLayer.trim() || undefined,
        longitudeField: draft.extension === '.csv' ? draft.longitudeField.trim() || undefined : undefined,
        latitudeField: draft.extension === '.csv' ? draft.latitudeField.trim() || undefined : undefined,
        crs: draft.extension === '.csv' ? draft.crs.trim() || undefined : undefined,
      })
      const workspace = await agent.workspace()
      if (workspace.status !== 'ready') throw new Error(workspace.issues.join('; ') || '导入后 Workspace 校验失败')
      layerWorkspace.project(sessionId, workspace.layers)
      lastWorkspaceSeq.current = null
      setWorkspaceStatus(`${workspace.layers.length} verified layers`)
      setLayerPanelOpen(true)
      setImportProgress(100)
      setImportPhase('success')
      setImportWarnings(result.warnings)
      setImportMessage(`${result.metadata.name} 已导入：${result.metadata.feature_count} 个 ${result.metadata.geometry} 要素 · ${result.metadata.crs}`)
    } catch (error) {
      setImportPhase('error')
      setImportProgress(0)
      setImportMessage(error instanceof Error ? error.message : String(error))
    }
  }

  const stepIcon = (status: AgentToolStep['status'], index: number) => {
    if (status === 'success') return '✓'
    if (status === 'failed') return '!'
    if (status === 'running') return '…'
    return String(index + 1)
  }

  return (
    <main className="gh-shell" data-geoharness-plugin="loaded" data-geoharness-phase="10" data-geoharness-agent="native" data-conversation-composer-overlay="">
      <header className="gh-topbar">
        <div className="gh-brand">
          <BrandMark />
          <span><strong>GeoHarness</strong><small>Agentic GIS · local workspace</small></span>
        </div>
        <div className="gh-launcher">
          {importPhase !== 'idle' && <span className={`gh-import-summary is-${importPhase}`}>{importPhase === 'success' ? '✓' : importBusy ? '…' : '!'} {importMessage}</span>}
          <span className="gh-status"><i /> Native Harness Agent · {layers.length} layers · {featureCount} features</span>
          <button type="button" className="gh-import-button" onClick={() => fileInput.current?.click()} disabled={importBusy}>
            <span aria-hidden="true">⇧</span> 导入数据
          </button>
          <input
            ref={fileInput}
            className="gh-file-input"
            type="file"
            accept=".geojson,.json,.zip,.gpkg,.csv"
            onChange={event => {
              const file = event.currentTarget.files?.[0]
              event.currentTarget.value = ''
              if (file !== undefined) selectImportFile(file)
            }}
          />
        </div>
      </header>

      {importDraft !== null && <div className="gh-import-backdrop">
        <section className="gh-import-dialog" role="dialog" aria-modal="true" aria-label="导入矢量数据">
          <header>
            <span><b>导入矢量数据</b><small>注册到当前 Harness Session Workspace</small></span>
            <button type="button" aria-label="关闭导入" disabled={importBusy} onClick={() => setImportDraft(null)}>×</button>
          </header>
          <div className="gh-import-file">
            <span aria-hidden="true">▱</span>
            <span><b>{importDraft.file.name}</b><small>{fileSizeLabel(importDraft.file.size)} · {importDraft.extension.slice(1).toUpperCase()}</small></span>
          </div>
          <label>图层名称<input disabled={importBusy || importPhase === 'success'} value={importDraft.name} maxLength={120} onChange={event => setImportDraft({ ...importDraft, name: event.currentTarget.value })} /></label>
          {(importDraft.extension === '.gpkg' || importDraft.extension === '.zip') && <label>
            {importDraft.extension === '.gpkg' ? '源图层名称（多图层时必填）' : 'Shapefile 名称（压缩包多图层时必填）'}
            <input disabled={importBusy || importPhase === 'success'} value={importDraft.sourceLayer} maxLength={180} placeholder="单图层文件可留空" onChange={event => setImportDraft({ ...importDraft, sourceLayer: event.currentTarget.value })} />
          </label>}
          {importDraft.extension === '.csv' && <div className="gh-import-grid">
            <label>经度字段<input disabled={importBusy || importPhase === 'success'} value={importDraft.longitudeField} maxLength={120} onChange={event => setImportDraft({ ...importDraft, longitudeField: event.currentTarget.value })} /></label>
            <label>纬度字段<input disabled={importBusy || importPhase === 'success'} value={importDraft.latitudeField} maxLength={120} onChange={event => setImportDraft({ ...importDraft, latitudeField: event.currentTarget.value })} /></label>
            <label>源 CRS<input disabled={importBusy || importPhase === 'success'} value={importDraft.crs} maxLength={80} onChange={event => setImportDraft({ ...importDraft, crs: event.currentTarget.value })} /></label>
          </div>}
          {importPhase !== 'idle' && <div className={`gh-import-progress is-${importPhase}`}>
            <span><i style={{ width: `${importProgress}%` }} /></span>
            <p>{importMessage}</p>
            {importWarnings.map(warning => <small key={warning}>⚠ {warning}</small>)}
          </div>}
          <footer>
            <small>支持 GeoJSON、Shapefile ZIP、GeoPackage、CSV lon/lat · 上限 {fileSizeLabel(importCapabilities.max_file_bytes)}</small>
            <span>
              <button type="button" className="gh-import-cancel" disabled={importBusy} onClick={() => setImportDraft(null)}>{importPhase === 'success' ? '完成' : '取消'}</button>
              {importPhase !== 'success' && <button type="button" className="gh-import-submit" disabled={importBusy} onClick={() => { void submitImport() }}>{importPhase === 'error' ? '重试' : '导入'}</button>}
            </span>
          </footer>
        </section>
      </div>}

      <section className="gh-workspace">
        <section className={`gh-map-stage is-${runStatus}${highlightedLayerIds.size > 0 ? ' has-focus' : ''}`}>
          <GeoMap
            layers={layers}
            selected={selectedFeature}
            highlightedLayerIds={highlightedLayerIds}
            runStatus={runStatus}
            onSelect={setSelectedFeature}
          />
          <button
            type="button"
            className="gh-map-layers-toggle"
            aria-expanded={layerPanelOpen}
            aria-controls="geoharness-layer-panel"
            onClick={() => setLayerPanelOpen(open => !open)}
          >
            <span aria-hidden="true">▱</span> Layers <small>{layers.length}</small>
          </button>
          {layerPanelOpen && <div className="gh-map-layer-drawer" id="geoharness-layer-panel">
            <GeoHarnessLayerPanel onClose={() => setLayerPanelOpen(false)} />
          </div>}
        </section>

        <aside className="gh-panel gh-agent" aria-label="Agent workspace">
          <div className="gh-panel-heading">
            <span><b>Agent workspace</b><small>Goal → Plan → Tools → Layers</small></span>
            <span className={`gh-agent-state is-${runStatus}`}>{runStatus}</span>
          </div>
          <div className="gh-agent-scroll" ref={agentScroll}>
            <section className="gh-agent-block">
              <span className="gh-eyebrow">GOAL</span>
              <p>{goal}</p>
            </section>
            <section className="gh-agent-block">
              <span className="gh-eyebrow">LIVE AGENT TOOL TRACE</span>
              {taskSteps.length === 0 && <p className="gh-result-empty">这里不加载预设 Plan；Harness Agent 实际发起 Tool Call 后，步骤才会逐项出现。</p>}
              <ol className="gh-plan-list" data-task-graph="agent-generated">
                {taskSteps.map((step, index) => <li
                  className={`is-${step.status}${selectedStepId === step.id ? ' is-selected' : ''}`}
                  data-step-id={step.id}
                  data-step-status={step.status}
                  key={step.id}
                >
                  <button type="button" className="gh-step-button" onClick={() => setSelectedStepId(step.id)}>
                    <i>{stepIcon(step.status, index)}</i>
                    <span>
                      <b>{step.title}</b>
                      <small>{argumentSummary(step.arguments)}</small>
                      {step.summary !== null && <small>{step.summary}</small>}
                      {step.outputs.length > 0 && <small>→ {step.outputs.join(', ')}</small>}
                    </span>
                  </button>
                </li>)}
              </ol>
            </section>
            <section className="gh-agent-block gh-current-step">
              <span className="gh-eyebrow">CURRENT STEP</span>
              <div><span>Driver</span><b>Native Harness Agent</b></div>
              <div><span>Model</span><b>原生输入栏可切换</b></div>
              <div><span>Tools</span><b>{successfulSteps.length}/{taskSteps.length} success</b></div>
              <div><span>Outputs</span><b>{derivedLayers.length} layers</b></div>
              <div><span>Turns</span><b>{runHistoryCount}</b></div>
              <div><span>Session</span><b>{sessionId.slice(0, 8)}</b></div>
              <div><span>Map</span><b className="is-teal">{workspaceStatus}</b></div>
              {runError !== null && <p className="gh-run-error" role="alert">{runError}</p>}
            </section>
            <section className={`gh-agent-block gh-agent-result is-${runStatus}`} aria-label="Agent result">
              <div className="gh-stream-heading">
                <span className="gh-eyebrow">AGENT STREAM</span>
                <small>{runStatus === 'running' ? 'LIVE' : runStatus.toUpperCase()} · {successfulSteps.length}/{taskSteps.length} tools</small>
              </div>
              {agentStream.length === 0
                ? <p className="gh-result-empty">{runStatus === 'running'
                    ? '已提交给模型，等待首个流式 token…'
                    : agentAnswer === '' ? 'Agent 的完整流式输出会显示在这里。' : agentAnswer}</p>
                : <div className="gh-stream-list" aria-live="polite">
                    {agentStream.map(item => item.kind === 'retry'
                      ? <div className="gh-stream-retry" data-stream-status={item.status} key={item.id}>↻ {item.text}</div>
                      : item.kind === 'reasoning'
                        ? <details className="gh-stream-reasoning" open={item.status === 'streaming'} key={item.id}>
                            <summary>Reasoning · Turn {item.turn} / Step {item.step}</summary>
                            <p>{item.text}{item.status === 'streaming' && <i className="gh-stream-cursor" />}</p>
                          </details>
                        : <article className="gh-stream-text" data-stream-status={item.status} key={item.id}>
                            <small>Agent · Turn {item.turn} / Step {item.step}</small>
                            <p>{item.text}{item.status === 'streaming' && <i className="gh-stream-cursor" />}</p>
                          </article>)}
                  </div>}
              <div className="gh-result-trace">
                {successfulSteps.slice(-3).map(step => <small key={step.id}><i>✓</i>{step.summary ?? step.title}</small>)}
              </div>
            </section>
          </div>
        </aside>
      </section>
    </main>
  )
}

export const inject = ['slots', 'connection'] as const

export function apply(ctx: ClientContext) {
  const connection = ctx.connection
  if (connection === undefined) throw new Error('GeoHarness requires the Harness connection service')
  installStyles()
  ctx.slots.register({
    name: 'conversation.session',
    priority: -100,
    inject: (sessionId: string) => ({
      agent: {
        history: async () => resultValue(
          await connection.api.sessions.history({ sessionId, maxMessages: 100 }),
          '读取 Agent 执行事件失败',
        ),
        workspace: async () => {
          const response = await connection.rpc.call('/geoharness', 'agent/workspace', {
            workspace_key: sessionId,
          })
          if (!response.ok || response.value === null || typeof response.value !== 'object') {
            throw new Error(response.error?.message ?? 'Agent workspace projection is unavailable')
          }
          return response.value as WorkspaceProjection
        },
        importCapabilities: async () => {
          const response = await connection.rpc.call('/geoharness', 'data/import-capabilities', {
            workspace_key: sessionId,
          })
          if (!response.ok || response.value === null || typeof response.value !== 'object') {
            throw new Error(response.error?.message ?? 'Data import capabilities are unavailable')
          }
          return response.value as ImportCapabilities
        },
        importData: async request => {
          const response = await connection.rpc.call('/geoharness', 'data/import', {
            workspace_key: sessionId,
            file_name: request.fileName,
            content_base64: request.contentBase64,
            name: request.name,
            source_layer: request.sourceLayer,
            longitude_field: request.longitudeField,
            latitude_field: request.latitudeField,
            crs: request.crs,
          })
          if (!response.ok || response.value === null || typeof response.value !== 'object') {
            throw new Error(response.error?.message ?? 'Data import failed')
          }
          return response.value as ImportResult
        },
      },
    }),
  }, GeoHarnessShell)
  ctx.slots.register({ name: 'sidebar.brand.mark', priority: -100 }, GeoHarnessBrandMark)
  ctx.slots.register({ name: 'sidebar.brand.name', priority: -100 }, GeoHarnessBrandName)
}

void _jsx

export { layerIdsForStep, mergeVerificationLayers, stepStatus } from './verification-map'
export { historyMaxSeq, humanGoalCount, latestHumanGoal, projectAgentHistory } from './agent-session'
