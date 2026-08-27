import { jsx as _jsx } from 'react/jsx-runtime'
import * as React from 'react'
import {
  registerScenarioLayers,
  registerUploadedLayer,
  setLayerOpacity,
  toggleLayerVisibility,
  type EmbeddedScenario,
  type GeoJsonFeature,
  type GeoJsonGeometry,
  type LayerRecord,
} from './layer-registry'
import {
  layerIdsForStep,
  mergeVerificationLayers,
  stepStatus,
  type MapVerification,
  type TaskStepStatus,
} from './verification-map'

declare const __GE0HARNESS_CSS__: string
declare const __GEOHARNESS_SCENARIOS__: EmbeddedScenario[]

const PACKAGE_NAME = '@geoharness/harness-plugin'

type SlotName = 'conversation'

interface SlotRegistration {
  name: SlotName
  priority?: number
}

interface SlotService {
  inject(name: SlotName, setup: () => void | (() => void)): () => void
  register(options: SlotRegistration, component: React.ComponentType): () => void
}

interface ClientContext {
  slots: SlotService
  connection?: {
    rpc: {
      call(channel: string, endpoint: string, payload: unknown, signal?: AbortSignal): Promise<{
        ok: boolean
        value?: unknown
        error?: { message?: string }
      }>
    }
  }
}

let clientConnection: ClientContext['connection']

interface ScenarioPreview {
  id: string
  number: string
  title: string
  prompt: string
  payload: EmbeddedScenario
}

interface SelectedFeature {
  layer: LayerRecord
  feature: GeoJsonFeature
  featureIndex: number
}

const SCENARIO_LABELS: Record<string, string> = {
  '01-building-data-inspection': 'Understand Building Data',
  '02-river-building-query': 'Buildings Near Rivers',
  '03-building-statistics-by-district': 'Buildings by District',
  '04-road-accessibility': 'Road Accessibility',
  '05-parameter-revision': 'Revise a Spatial Query',
  '06-multi-constraint-selection': 'Multi-Constraint Selection',
  '07-official-nyc-building-inspection': 'Official NYC Building Data',
}

const SCENARIOS: readonly ScenarioPreview[] = __GEOHARNESS_SCENARIOS__.map(payload => ({
  id: payload.manifest.id,
  number: payload.manifest.id.slice(0, 2),
  title: SCENARIO_LABELS[payload.manifest.id] ?? payload.manifest.title,
  prompt: payload.prompt,
  payload,
}))

const BROWSER_WORKSPACE_KEY = 'browser:goal'

type TaskGraphStep = EmbeddedScenario['taskGraph']['steps'][number]

interface ToolExecutionResult {
  success?: boolean
  summary?: string
  data?: unknown
  parameters?: Record<string, unknown>
  outputs?: string[]
}

interface ExecutionStep extends TaskGraphStep {
  status?: TaskStepStatus
  resolved_outputs?: Array<{ alias: string, layer_id: string }>
  result?: ToolExecutionResult | null
  error?: string | null
}

interface GoalRunResult {
  scenario_id?: string
  goal?: string
  status?: TaskStepStatus
  steps?: ExecutionStep[]
  map_verification?: MapVerification
  run_history?: Array<{ executed_steps: string[], reused_steps: string[] }>
  goal_resolution?: {
    prompt: string
    scenario_id: string
    parameters: Record<string, unknown>
  }
}

interface GoalStartResult {
  job_status: 'running'
  goal_resolution: NonNullable<GoalRunResult['goal_resolution']>
}

interface JobProgressResult {
  job_status: 'running' | 'success' | 'failed'
  execution: GoalRunResult | null
  map_preview: MapVerification | null
  error: string | null
}

interface ResultFact {
  label: string
  value: string
}

function recordValue(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function collectResultFacts(value: unknown, prefix = '', depth = 0): ResultFact[] {
  if (!recordValue(value) || depth > 2) return []
  const facts: ResultFact[] = []
  for (const [key, item] of Object.entries(value)) {
    const label = prefix === '' ? key : `${prefix}.${key}`
    if (typeof item === 'string' || typeof item === 'number' || typeof item === 'boolean') {
      facts.push({ label, value: typeof item === 'number' ? item.toLocaleString('en-US', { maximumFractionDigits: 2 }) : String(item) })
    } else if (Array.isArray(item)) {
      facts.push({ label, value: `${item.length} item${item.length === 1 ? '' : 's'}` })
      for (const [index, row] of item.slice(0, 4).entries()) {
        if (!recordValue(row)) continue
        const identity = Object.entries(row).find(([rowKey, rowValue]) =>
          (rowKey.endsWith('_id') || rowKey === 'name') && (typeof rowValue === 'string' || typeof rowValue === 'number'))
        const metric = Object.entries(row).find(([rowKey, rowValue]) =>
          ['feature_count', 'selected_count', 'count', 'area_sum_m2'].includes(rowKey) && typeof rowValue === 'number')
        if (metric !== undefined) {
          const rowLabel = identity === undefined ? `${label}.${index + 1}` : `${label}.${String(identity[1])}`
          facts.push({
            label: rowLabel,
            value: Number(metric[1]).toLocaleString('en-US', { maximumFractionDigits: 2 }),
          })
        }
      }
    } else if (recordValue(item)) {
      facts.push(...collectResultFacts(item, label, depth + 1))
    }
    if (facts.length >= 8) break
  }
  return facts.slice(0, 8)
}

function resolvedPreviewSteps(steps: readonly TaskGraphStep[], parameters: Record<string, unknown>): ExecutionStep[] {
  return steps.map(step => {
    if (step.tool !== 'create_buffer') return { ...step }
    const river = step.id.includes('river')
    const distance = parameters[river ? 'river_distance_m' : 'road_distance_m']
    if (typeof distance !== 'number' || !Number.isFinite(distance)) return { ...step }
    const subject = river
      ? (step.title.toLowerCase().includes('exclusion') ? 'river exclusion' : 'river')
      : 'road'
    return {
      ...step,
      title: `Create ${distance} m ${subject} buffer`,
      parameters: { ...step.parameters, distance, unit: 'meter' },
    }
  })
}

function waitForNextProgress() {
  return new Promise<void>(resolve => { setTimeout(resolve, 280) })
}

function installStyles() {
  if (typeof document === 'undefined') return
  if (document.querySelector(`style[data-plugin=${JSON.stringify(PACKAGE_NAME)}]`) !== null) return
  const style = document.createElement('style')
  style.dataset.plugin = PACKAGE_NAME
  style.textContent = __GE0HARNESS_CSS__
  document.head.appendChild(style)
}

function BrandMark({ small = false }: { small?: boolean }) {
  return (
    <span className={small ? 'gh-brand-mark gh-brand-mark--small' : 'gh-brand-mark'} aria-hidden="true">⌖</span>
  )
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
  officialData,
  onSelect,
}: {
  layers: readonly LayerRecord[]
  selected: SelectedFeature | null
  highlightedLayerIds: ReadonlySet<string>
  officialData: boolean
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

  const fitBounds = () => {
    setZoom(1)
    setPan({ x: 0, y: 0 })
  }

  return (
    <section className="gh-map" aria-label="Map workspace">
      <div className="gh-map-toolbar" aria-label="Map controls">
        <button type="button" onClick={() => setZoom(value => Math.min(5, value * 1.35))} aria-label="Zoom in">+</button>
        <button type="button" onClick={() => setZoom(value => Math.max(0.7, value / 1.35))} aria-label="Zoom out">−</button>
        <button type="button" onClick={fitBounds} aria-label="Fit bounds">⌖</button>
      </div>
      <div className="gh-map-label"><span>{officialData ? 'NYC OPEN DATA' : 'MANHATTAN FIXTURE'}</span><small>{centerLatitude}° N · {Math.abs(Number(centerLongitude)).toFixed(4)}° W</small></div>
      <svg
        className="gh-map-canvas"
        viewBox="0 0 1000 700"
        role="img"
        aria-label="Interactive Scenario map"
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
        <p>Choose a Scenario or upload a GeoJSON FeatureCollection.</p>
      </div>}
      <div className="gh-map-scale"><span /> {zoom.toFixed(1)}×</div>
      <div className="gh-map-attribution">{officialData ? 'Official NYC Open Data' : 'Deterministic demo fixture'} · OGC:CRS84</div>
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

function isDistanceOnlyRevision(value: string) {
  const hasDistance = /(\d+(?:\.\d+)?)\s*(公里|千米|km|kilometers?|米|m|meters?)/iu.test(value)
  const hasRevisionVerb = /改|调整|变成|change|set|instead/iu.test(value)
  const namesNewWorkflow = /broadway|主要道路|道路|road|hudson|east river|河流|river|建筑|building/iu.test(value)
  return hasDistance && hasRevisionVerb && !namesNewWorkflow
}

function GeoHarnessShell() {
  const initialScenario = SCENARIOS[1] ?? SCENARIOS[0]
  const [selectedId, setSelectedId] = React.useState(initialScenario.id)
  const selected = React.useMemo(
    () => SCENARIOS.find(scenario => scenario.id === selectedId) ?? SCENARIOS[0],
    [selectedId],
  )
  const [prompt, setPrompt] = React.useState(selected.prompt)
  const [goal, setGoal] = React.useState(selected.prompt)
  const [layers, setLayers] = React.useState<LayerRecord[]>(() => registerScenarioLayers(initialScenario.payload))
  const [selectedFeature, setSelectedFeature] = React.useState<SelectedFeature | null>(null)
  const [uploadError, setUploadError] = React.useState<string | null>(null)
  const [verification, setVerification] = React.useState<MapVerification | null>(null)
  const [runStatus, setRunStatus] = React.useState<'ready' | 'running' | 'success' | 'failed'>('ready')
  const [runError, setRunError] = React.useState<string | null>(null)
  const [selectedStepId, setSelectedStepId] = React.useState<string | null>(null)
  const [runHistoryCount, setRunHistoryCount] = React.useState(0)
  const [revisionSummary, setRevisionSummary] = React.useState<string | null>(null)
  const [taskSteps, setTaskSteps] = React.useState<ExecutionStep[]>(initialScenario.payload.taskGraph.steps)
  const runSequence = React.useRef(0)
  const agentScroll = React.useRef<HTMLDivElement | null>(null)

  React.useEffect(() => {
    const panel = agentScroll.current
    if (panel === null) return
    panel.scrollTop = runStatus === 'success' || runStatus === 'failed' ? panel.scrollHeight : 0
  }, [runStatus])

  const selectScenario = (id: string) => {
    const next = SCENARIOS.find(scenario => scenario.id === id)
    if (next === undefined) return
    runSequence.current += 1
    setSelectedId(id)
    setPrompt(next.prompt)
    setGoal(next.prompt)
    setLayers(registerScenarioLayers(next.payload))
    setSelectedFeature(null)
    setUploadError(null)
    setVerification(null)
    setRunStatus('ready')
    setRunError(null)
    setSelectedStepId(null)
    setRunHistoryCount(0)
    setRevisionSummary(null)
    setTaskSteps(next.payload.taskGraph.steps)
  }

  const submitGoal = async (event: React.FormEvent) => {
    event.preventDefault()
    const value = prompt.trim()
    if (value === '') return
    await executePrompt(value)
  }

  const uploadGeoJson = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.currentTarget.files?.[0]
    if (file === undefined) return
    try {
      const data: unknown = JSON.parse(await file.text())
      const layer = registerUploadedLayer(file.name, data)
      setLayers(current => [...current, layer])
      setUploadError(null)
    } catch (error) {
      setUploadError(error instanceof Error ? error.message : 'Unable to read this GeoJSON file.')
    } finally {
      event.currentTarget.value = ''
    }
  }

  const toggleLayer = (layer: LayerRecord) => {
    setLayers(current => toggleLayerVisibility(current, layer.id))
    if (layer.visible && selectedFeature?.layer.id === layer.id) setSelectedFeature(null)
  }

  const visibleCount = layers.filter(layer => layer.visible).length
  const featureCount = layers.reduce((total, layer) => total + layer.featureCount, 0)
  const plannedOutputs = taskSteps.flatMap(step => step.outputs)
  const highlightedLayerIds = layerIdsForStep(verification, selectedStepId)
  const inputLayers = layers.filter(layer => layer.source !== 'derived')
  const derivedLayers = layers.filter(layer => layer.source === 'derived')
  const statusForStep = (step: ExecutionStep) => step.status ?? stepStatus(verification, step.id)
  const outputStates = taskSteps.flatMap(step => step.outputs.map(alias => ({
    alias,
    step,
    status: statusForStep(step),
    resolved: step.resolved_outputs?.find(output => output.alias === alias) ?? null,
    layer: derivedLayers.find(layer => layer.name === alias) ?? null,
  })))
  const successfulResults = taskSteps.filter(step => statusForStep(step) === 'success'
    && step.result?.success === true && typeof step.result.summary === 'string')
  const latestAgentStep = successfulResults.at(-1) ?? null
  const agentFacts = collectResultFacts(latestAgentStep?.result?.data)

  const pollJob = async (scenarioId: string, sequence: number): Promise<GoalRunResult | null> => {
    if (clientConnection === undefined) return null
    while (runSequence.current === sequence) {
      const response = await clientConnection.rpc.call('/geoharness', 'scenario/progress', {
        scenario_id: scenarioId,
        workspace_key: BROWSER_WORKSPACE_KEY,
      })
      if (!response.ok || response.value === null || typeof response.value !== 'object') {
        throw new Error(response.error?.message ?? 'GeoHarness progress is unavailable')
      }
      const progress = response.value as JobProgressResult
      if (runSequence.current !== sequence) return null
      const execution = progress.execution
      if (execution?.steps !== undefined) {
        setTaskSteps(execution.steps)
        setRunHistoryCount(execution.run_history?.length ?? 0)
        const activeStep = execution.steps.find(step => step.status === 'running')
        if (activeStep !== undefined) setSelectedStepId(activeStep.id)
      }
      if (progress.map_preview?.status === 'ready'
        && Object.values(progress.map_preview.checks).every(Boolean)) {
        setLayers(current => mergeVerificationLayers(current, progress.map_preview as MapVerification))
      }
      if (progress.job_status === 'failed') {
        throw new Error(progress.error ?? execution?.steps?.find(step => step.status === 'failed')?.error ?? 'GIS workflow failed')
      }
      if (progress.job_status === 'success') {
        const finalVerification = execution?.map_verification
        if (execution === null || finalVerification === undefined) throw new Error('Completed Task Graph has no map verification')
        if (finalVerification.status !== 'ready' || !Object.values(finalVerification.checks).every(Boolean)) {
          throw new Error(finalVerification.issues.join('; ') || 'Map verification failed')
        }
        setLayers(current => mergeVerificationLayers(current, finalVerification))
        setVerification(finalVerification)
        setTaskSteps(execution.steps ?? [])
        setRunHistoryCount(execution.run_history?.length ?? 1)
        setRunStatus('success')
        return execution
      }
      await waitForNextProgress()
    }
    return null
  }

  const runGoal = async (goalPrompt: string) => {
    if (clientConnection === undefined || runStatus === 'running') return
    const sequence = ++runSequence.current
    setGoal(goalPrompt)
    setRunStatus('running')
    setRunError(null)
    setSelectedStepId(null)
    setRevisionSummary(null)
    try {
      const response = await clientConnection.rpc.call('/geoharness', 'goal/start', {
        goal_prompt: goalPrompt,
        workspace_key: BROWSER_WORKSPACE_KEY,
      })
      if (!response.ok || response.value === null || typeof response.value !== 'object') {
        throw new Error(response.error?.message ?? 'GeoHarness could not start the GIS workflow')
      }
      const start = response.value as GoalStartResult
      const resolved = SCENARIOS.find(scenario => scenario.id === start.goal_resolution.scenario_id)
      if (resolved === undefined) throw new Error(`Goal resolved to unknown Scenario ${start.goal_resolution.scenario_id}`)
      if (runSequence.current !== sequence) return
      setSelectedId(resolved.id)
      setLayers(registerScenarioLayers(resolved.payload))
      setVerification(null)
      setTaskSteps(resolvedPreviewSteps(resolved.payload.taskGraph.steps, start.goal_resolution.parameters))
      setRunHistoryCount(0)
      const result = await pollJob(resolved.id, sequence)
      if (result === null) return
      const firstOutputStep = result.map_verification?.step_bindings.find(binding => binding.outputs.length > 0)
      setSelectedStepId(firstOutputStep?.step_id ?? null)
    } catch (error) {
      if (runSequence.current !== sequence) return
      setRunStatus('failed')
      setRunError(error instanceof Error ? error.message : String(error))
    }
  }

  const reviseTaskGraph = async (revisionPrompt: string) => {
    if (clientConnection === undefined || runStatus === 'running') return
    const sequence = ++runSequence.current
    setGoal(revisionPrompt)
    setRunStatus('running')
    setRunError(null)
    setVerification(null)
    try {
      const response = await clientConnection.rpc.call('/geoharness', 'scenario/revise/start', {
        scenario_id: selected.id,
        workspace_key: BROWSER_WORKSPACE_KEY,
        revision_prompt: revisionPrompt,
      })
      if (!response.ok || response.value === null || typeof response.value !== 'object') {
        throw new Error(response.error?.message ?? 'GeoHarness could not start the revision')
      }
      const result = await pollJob(selected.id, sequence)
      if (result === null) return
      const latestRun = result.run_history?.at(-1)
      setRevisionSummary(latestRun === undefined
        ? null
        : `${latestRun.executed_steps.length} rerun · ${latestRun.reused_steps.length} reused`)
      setSelectedStepId('filter_candidate_buildings')
    } catch (error) {
      if (runSequence.current !== sequence) return
      setRunStatus('failed')
      setRunError(error instanceof Error ? error.message : String(error))
    }
  }

  async function executePrompt(value: string) {
    if (verification !== null && runStatus === 'success' && selected.id === '05-parameter-revision'
      && isDistanceOnlyRevision(value)) {
      await reviseTaskGraph(value)
      return
    }
    await runGoal(value)
  }

  const stepIcon = (status: TaskStepStatus, index: number) => {
    if (status === 'success') return '✓'
    if (status === 'failed') return '!'
    if (status === 'running') return '…'
    return String(index + 1)
  }

  const renderLayerRow = (layer: LayerRecord, outputStatus?: TaskStepStatus) => (
    <article className={highlightedLayerIds.has(layer.id) ? 'gh-layer-row is-step-highlighted' : 'gh-layer-row'} key={layer.id}>
      <button
        type="button"
        className={layer.visible ? 'gh-layer-toggle is-visible' : 'gh-layer-toggle'}
        aria-label={`${layer.visible ? 'Hide' : 'Show'} ${layer.name}`}
        aria-pressed={layer.visible}
        onClick={() => toggleLayer(layer)}
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
            // React clears currentTarget after the input callback. Capture the
            // primitive before the queued functional update runs, especially
            // during a real pointer drag that emits many input events.
            const opacity = Number(event.currentTarget.value)
            setLayers(current => setLayerOpacity(current, layer.id, opacity))
          }}
        />
      </div>
    </article>
  )

  return (
    <main className="gh-shell" data-geoharness-plugin="loaded" data-geoharness-phase="10">
      <header className="gh-topbar">
        <div className="gh-brand">
          <BrandMark />
          <span>
            <strong>GeoHarness</strong>
            <small>Agentic GIS · official data</small>
          </span>
        </div>
        <div className="gh-launcher">
          <label htmlFor="gh-scenario">Example</label>
          <select
            id="gh-scenario"
            value={selectedId}
            disabled={runStatus === 'running'}
            onChange={event => selectScenario(event.currentTarget.value)}
            aria-label="Choose a GeoHarness scenario"
          >
            {SCENARIOS.map(scenario => (
              <option key={scenario.id} value={scenario.id}>
                {scenario.number} · {scenario.title}
              </option>
            ))}
          </select>
          <span className="gh-status"><i /> {layers.length} layers · {featureCount} features</span>
        </div>
      </header>

      <section className="gh-workspace">
        <aside className="gh-panel gh-layers" aria-label="Layer panel">
          <div className="gh-panel-heading">
            <span><b>Layers</b><small>Layer Registry</small></span>
            <label className="gh-icon-button" title="Upload a GeoJSON FeatureCollection">
              <input type="file" accept=".geojson,.json,application/geo+json,application/json" onChange={uploadGeoJson} />
              +
            </label>
          </div>
          <div className="gh-layer-section-label">Scenario inputs</div>
          <div className="gh-layer-list">
            {inputLayers.map(layer => renderLayerRow(layer))}
          </div>
          <div className="gh-layer-section-label">Task outputs</div>
          <div className="gh-layer-list gh-output-list" aria-label="Task output layers">
            {outputStates.length === 0 && <p className="gh-output-empty">This workflow returns structured results without a new map layer.</p>}
            {outputStates.map(({ alias, step, status, resolved, layer }, index) => layer === null
              ? <article className={`gh-output-row is-${status}`} key={`${step.id}-${alias}`} data-output-status={status}>
                <i>{stepIcon(status, index)}</i>
                <span><strong>{alias}</strong><small>{status === 'success' ? resolved?.layer_id ?? 'registered' : `${status} · ${step.title}`}</small></span>
              </article>
              : renderLayerRow(layer, status))}
          </div>
          {uploadError !== null && <p className="gh-layer-error" role="alert">{uploadError}</p>}
          <div className="gh-layer-footer">
            <span>{visibleCount} visible</span><span>{layers[0]?.crs ?? 'CRS —'}</span>
          </div>
        </aside>

        <GeoMap
          layers={layers}
          selected={selectedFeature}
          highlightedLayerIds={highlightedLayerIds}
          officialData={selected.payload.manifest.fixture_profile.startsWith('official-')}
          onSelect={setSelectedFeature}
        />

        <aside className="gh-panel gh-agent" aria-label="Agent workspace">
          <div className="gh-panel-heading">
            <span><b>Agent</b><small>Goal → Plan → Tools → Layers</small></span>
            <span className={`gh-agent-state is-${runStatus}`}>{runStatus}</span>
          </div>
          <div className="gh-agent-scroll" ref={agentScroll}>
            <section className="gh-agent-block">
              <span className="gh-eyebrow">GOAL</span>
              <p>{goal}</p>
            </section>
            <section className="gh-agent-block">
              <span className="gh-eyebrow">PLAN PREVIEW</span>
              <ol className="gh-plan-list" data-task-graph={selected.payload.taskGraph.scenario_id}>
                {taskSteps.map((step, index) => {
                  const status = statusForStep(step)
                  return <li
                  className={`is-${status}${selectedStepId === step.id ? ' is-selected' : ''}`}
                  data-step-id={step.id}
                  data-step-status={status}
                  key={step.id}
                >
                  <button type="button" className="gh-step-button" onClick={() => setSelectedStepId(step.id)}>
                  <i>{stepIcon(status, index)}</i>
                  <span>
                    <b>{step.title}</b>
                    <small>{step.tool} · deps {step.dependencies.length === 0 ? '—' : step.dependencies.join(', ')}</small>
                    {step.outputs.length > 0 && <small>→ {step.outputs.join(', ')}</small>}
                  </span>
                  </button>
                </li>})}
              </ol>
            </section>
            <section className="gh-agent-block gh-current-step">
              <span className="gh-eyebrow">CURRENT STEP</span>
              <div><span>Phase</span><b>Task Graph</b></div>
              <div><span>Steps</span><b>{taskSteps.filter(step => statusForStep(step) === 'success').length}/{taskSteps.length} success</b></div>
              <div><span>Outputs</span><b>{plannedOutputs.length}</b></div>
              <div><span>History</span><b>{runHistoryCount} run{runHistoryCount === 1 ? '' : 's'}</b></div>
              {revisionSummary !== null && <div><span>Revision</span><b>{revisionSummary}</b></div>}
              <div><span>Map</span><b className="is-teal">{verification?.status ?? 'awaiting run'}</b></div>
              {runError !== null && <p className="gh-run-error" role="alert">{runError}</p>}
            </section>
            <section className="gh-agent-block gh-agent-result" aria-label="Agent result">
              <span className="gh-eyebrow">AGENT RESULT</span>
              {latestAgentStep === null
                ? <p className="gh-result-empty">真实工具结果会随任务执行显示在这里。</p>
                : <>
                  <strong className="gh-result-headline">{latestAgentStep.result?.summary}</strong>
                  {agentFacts.length > 0 && <dl>
                    {agentFacts.map(fact => <React.Fragment key={fact.label}>
                      <dt>{fact.label.replaceAll('_', ' ')}</dt><dd>{fact.value}</dd>
                    </React.Fragment>)}
                  </dl>}
                  <div className="gh-result-trace">
                    {successfulResults.slice(-3).map(step => <small key={step.id}><i>✓</i>{step.result?.summary}</small>)}
                  </div>
                </>}
            </section>
          </div>
        </aside>
      </section>

      <form className="gh-composer" onSubmit={submitGoal}>
        <BrandMark small />
        <textarea
          value={prompt}
          onChange={event => setPrompt(event.currentTarget.value)}
          rows={1}
          aria-label="Describe your spatial goal"
          placeholder="描述你想解决的空间问题……"
        />
        <button type="submit" disabled={clientConnection === undefined || prompt.trim() === '' || runStatus === 'running'}>
          {runStatus === 'running' ? '正在执行…' : '执行 GIS 任务'} <span>↗</span>
        </button>
      </form>
    </main>
  )
}

export const inject = ['slots', 'connection'] as const

export function apply(ctx: ClientContext) {
  clientConnection = ctx.connection
  installStyles()
  ctx.slots.inject('conversation', () => ctx.slots.register({
    name: 'conversation',
    priority: -100,
  }, GeoHarnessShell))
}

// Kept as a value reference so TypeScript preserves the jsx-runtime external.
void _jsx

export { layerIdsForStep, mergeVerificationLayers, stepStatus } from './verification-map'
