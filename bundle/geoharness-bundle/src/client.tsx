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
  | 'sidebar.workspaces'
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
  onSelect,
}: {
  layers: readonly LayerRecord[]
  selected: SelectedFeature | null
  highlightedLayerIds: ReadonlySet<string>
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
        </g>
      </svg>
      {layers.length === 0 && <div className="gh-map-empty-card">
        <span className="gh-eyebrow">MAP WORKSPACE</span>
        <strong>No registered layers</strong>
        <p>在右侧原生 Harness 对话框描述空间目标后，Agent 会发现真实数据、选择 Geo Tools，并把产生的图层逐步加载到这里。</p>
      </div>}
      <div className="gh-map-scale"><span /> {zoom.toFixed(1)}×</div>
      <div className="gh-map-attribution">{layers.length > 0 ? 'Official NYC Open Data' : 'Agent workspace awaiting data'} · OGC:CRS84</div>
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

interface GeoHarnessInjected {
  agent: {
    history(): Promise<{ events: unknown[] }>
    workspace(): Promise<WorkspaceProjection>
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
    <article className={highlightedLayerIds.has(layer.id) ? 'gh-layer-row is-step-highlighted' : 'gh-layer-row'} key={layer.id}>
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

function GeoHarnessLayerPanel({ wide }: { wide: boolean }) {
  const workspace = useLayerWorkspace()
  const inputLayers = workspace.layers.filter(layer => layer.source !== 'derived')
  const derivedLayers = workspace.layers.filter(layer => layer.source === 'derived')
  const visibleCount = workspace.layers.filter(layer => layer.visible).length
  if (!wide) {
    return <div className="gh-layer-rail" aria-label="GeoHarness layers"><span aria-hidden="true">▱</span><small>{workspace.layers.length}</small></div>
  }
  return (
    <section className="gh-sidebar-layers" aria-label="Layer panel">
      <div className="gh-sidebar-layer-heading">
        <span><b>Layers</b><small>Verified Agent workspace</small></span>
        <span className="gh-panel-count">{workspace.layers.length}</span>
      </div>
      <div className="gh-layer-section-label">Agent-loaded data</div>
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
  const [agentAnswer, setAgentAnswer] = React.useState('')
  const [workspaceStatus, setWorkspaceStatus] = React.useState('awaiting Agent')
  const activeGoalSeq = React.useRef<number | null>(null)
  const lastAutoStepId = React.useRef<string | null>(null)
  const lastRunStatus = React.useRef<'ready' | 'running' | 'success' | 'failed'>('ready')
  const lastWorkspaceSeq = React.useRef<number | null>(null)
  const agentScroll = React.useRef<HTMLDivElement | null>(null)
  const layerState = useLayerWorkspace()
  const layers = layerState.sessionId === sessionId ? layerState.layers : []

  React.useEffect(() => {
    const panel = agentScroll.current
    if (panel === null) return
    panel.scrollTop = runStatus === 'success' || runStatus === 'failed' ? panel.scrollHeight : 0
  }, [runStatus])

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
  const semanticStepId = typeof selectedStep?.arguments.step_id === 'string' ? selectedStep.arguments.step_id : null
  const highlightedLayerIds = new Set(layers
    .filter(layer => selectedOutputs.has(layer.id)
      || layer.generatedBy === selectedStepId
      || (semanticStepId !== null && layer.generatedBy === semanticStepId))
    .map(layer => layer.id))
  const highlightedLayerKey = [...highlightedLayerIds].sort().join('\n')
  React.useEffect(() => {
    layerWorkspace.highlight(sessionId, highlightedLayerIds)
  }, [sessionId, highlightedLayerKey])
  const successfulSteps = taskSteps.filter(step => step.status === 'success')

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
          <span><strong>GeoHarness</strong><small>Agentic GIS · official data</small></span>
        </div>
        <div className="gh-launcher">
          <span className="gh-status"><i /> Native Harness Agent · {layers.length} layers · {featureCount} features</span>
        </div>
      </header>

      <section className="gh-workspace">
        <GeoMap
          layers={layers}
          selected={selectedFeature}
          highlightedLayerIds={highlightedLayerIds}
          onSelect={setSelectedFeature}
        />

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
            <section className="gh-agent-block gh-agent-result" aria-label="Agent result">
              <span className="gh-eyebrow">AGENT RESULT</span>
              {agentAnswer === ''
                ? <p className="gh-result-empty">Agent 的自然语言结论会在 Tool 结果验证完成后显示在这里。</p>
                : <strong className="gh-result-headline">{agentAnswer}</strong>}
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
      },
    }),
  }, GeoHarnessShell)
  ctx.slots.register({ name: 'sidebar.workspaces', priority: -100 }, GeoHarnessLayerPanel)
  ctx.slots.register({ name: 'sidebar.brand.mark', priority: -100 }, GeoHarnessBrandMark)
  ctx.slots.register({ name: 'sidebar.brand.name', priority: -100 }, GeoHarnessBrandName)
}

void _jsx

export { layerIdsForStep, mergeVerificationLayers, stepStatus } from './verification-map'
export { historyMaxSeq, humanGoalCount, latestHumanGoal, projectAgentHistory } from './agent-session'
