import { jsx as _jsx } from 'react/jsx-runtime'
import * as React from 'react'
import {
  registerWorkspaceProjection,
  resetLayerStyle,
  setLayerOpacity,
  setLayerStyle,
  toggleLayerVisibility,
  type LayerDisplayPreference,
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
import {
  buildFeatureFlow,
  buildNumericStatistics,
  groupWorkspaceLayers,
  mapLayerOpacity,
  mapScaleLabel,
  parseAgentMarkdown,
  parseCsvPreview,
  suggestCoordinateField,
  type CsvPreview,
  type MarkdownInlineToken,
} from './ui-model'
import {
  createGeoViewFlight,
  createMercatorProjection,
  geoBoundsForView,
  interpolateMercatorView,
  overviewEsriWorldImageryTiles,
  reprojectRasterTile,
  retainRasterTiles,
  visibleEsriWorldImageryTiles,
  visibleGeographicBounds,
  type GeoBounds,
  type MercatorProjection,
  type RasterTile,
} from './raster-basemap'
import {
  browserLocationPermission,
  locationAccuracyLabel,
  locationViewportBounds,
  requestBrowserLocation,
  shouldAutoRequestBrowserLocation,
  type BrowserLocation,
  type BrowserLocationFailure,
} from './browser-location'

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

interface ImageryView {
  bbox: [number, number, number, number]
  zoom: number
}

interface RasterOverlayLayer {
  layer_id: string
  name: string
  layer_type: 'raster-overlay'
  source: 'derived'
  visible: boolean
  opacity: number
}

interface AdministrativeBoundary {
  label: string
  bbox: [number, number, number, number]
  geometry: GeoJsonGeometry
  coordinate_count: number
  osm_type: string
  osm_id: number | null
  source: string
  attribution: string
  license: string
  license_url: string
}

interface ResolvedPlace {
  query: string
  label: string
  score: number
  bbox: [number, number, number, number]
  source: string
  administrative_boundary?: AdministrativeBoundary | null
  cache_provenance?: { mode: string, captured_at: string, note: string }
}

interface ImageryTarget {
  schema_version: '1.0'
  target_id: string
  step_id: string
  query: string | null
  status: 'resolving' | 'ready' | 'complete' | 'failed'
  phase: 'resolving-place' | 'acquiring-imagery' | 'classifying-pixels' | 'finalizing-result' | 'complete' | 'failed'
  progress: number
  message: string
  bbox: [number, number, number, number] | null
  resolved_place: ResolvedPlace | null
  tile_count?: number
  tile_zoom?: number
  error?: string
}

interface ImageryInspection {
  schema_version: '1.0'
  inspection_id: string
  target_id?: string
  created_at: string
  source: string
  attribution: string
  bbox: [number, number, number, number]
  tile_zoom: number
  tile_count: number
  pixel_width: number
  pixel_height: number
  categories: Array<{
    category: 'water' | 'vegetation' | 'built_up' | 'bare_ground'
    pixel_count: number
    pixel_ratio: number
    heuristic_confidence: number
  }>
  classified_pixel_ratio: number
  method: string
  limitations: string[]
  overlay_mime_type: string
  overlay_base64: string
  overlay_layer: RasterOverlayLayer
  preview_mime_type: string
  preview_base64: string
  resolved_place: ResolvedPlace | null
  analysis_scope?: {
    type: 'map-view' | 'administrative-boundary'
    boundary_clipped: boolean
    analysis_pixel_count: number
    boundary_source: string | null
    boundary_label: string | null
  }
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

function renderMarkdownInline(tokens: readonly MarkdownInlineToken[], keyPrefix: string) {
  return tokens.map((token, index) => {
    const key = `${keyPrefix}-${index}`
    if (token.type === 'strong') return <strong key={key}>{token.text}</strong>
    if (token.type === 'emphasis') return <em key={key}>{token.text}</em>
    if (token.type === 'code') return <code key={key}>{token.text}</code>
    if (token.type === 'link') return <a key={key} href={token.href} target="_blank" rel="noreferrer">{token.text}</a>
    if (token.type === 'break') return <br key={key} />
    return <React.Fragment key={key}>{token.text}</React.Fragment>
  })
}

function MarkdownContent({ text, streaming = false }: { text: string, streaming?: boolean }) {
  const blocks = React.useMemo(() => parseAgentMarkdown(text), [text])
  return <div className="gh-markdown">
    {blocks.map((block, index) => {
      const key = `markdown-${index}`
      const content = renderMarkdownInline(block.content ?? [], key)
      if (block.type === 'heading') {
        if (block.level === 1) return <h1 key={key}>{content}</h1>
        if (block.level === 2) return <h2 key={key}>{content}</h2>
        if (block.level === 3) return <h3 key={key}>{content}</h3>
        return <h4 key={key}>{content}</h4>
      }
      if (block.type === 'unordered-list' || block.type === 'ordered-list') {
        const items = (block.items ?? []).map((item, itemIndex) => <li key={`${key}-${itemIndex}`}>
          {renderMarkdownInline(item, `${key}-${itemIndex}`)}
        </li>)
        return block.type === 'unordered-list' ? <ul key={key}>{items}</ul> : <ol key={key}>{items}</ol>
      }
      if (block.type === 'blockquote') return <blockquote key={key}>{content}</blockquote>
      if (block.type === 'code') return <pre key={key} data-language={block.language ?? ''}><code>{block.code}</code></pre>
      if (block.type === 'table') return <div className="gh-markdown-table" key={key}><table>
        <thead><tr>{(block.headers ?? []).map((cell, cellIndex) => <th key={`${key}-head-${cellIndex}`}>
          {renderMarkdownInline(cell, `${key}-head-${cellIndex}`)}
        </th>)}</tr></thead>
        <tbody>{(block.rows ?? []).map((row, rowIndex) => <tr key={`${key}-row-${rowIndex}`}>
          {row.map((cell, cellIndex) => <td key={`${key}-cell-${rowIndex}-${cellIndex}`}>
            {renderMarkdownInline(cell, `${key}-cell-${rowIndex}-${cellIndex}`)}
          </td>)}
        </tr>)}</tbody>
      </table></div>
      return <p key={key}>{content}</p>
    })}
    {streaming && <i className="gh-stream-cursor" />}
  </div>
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
    const bbox = layer.data.geoharness?.bbox
    if (bbox !== undefined && bbox.length === 4) {
      coordinates.push([bbox[0], bbox[1]], [bbox[2], bbox[3]])
    }
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

function SatelliteTile({ tile, onHealth }: {
  tile: RasterTile
  onHealth: (ready: boolean) => void
}) {
  const [ready, setReady] = React.useState(false)
  return <image
    className={`gh-raster-tile${ready ? ' is-ready' : ''}`}
    href={tile.url} x={tile.x} y={tile.y} width={tile.width} height={tile.height}
    preserveAspectRatio="none"
    onLoad={() => { setReady(true); onHealth(true) }}
    onError={() => onHealth(false)}
  />
}

function SatelliteDetail({ tiles, projection, onHealth }: {
  tiles: readonly RasterTile[]
  projection: MercatorProjection
  onHealth: (ready: boolean) => void
}) {
  const [retained, setRetained] = React.useState<readonly RasterTile[]>(tiles)
  const sourceKey = tiles.map(tile => tile.key).join('|')
  React.useEffect(() => {
    setRetained(previous => retainRasterTiles(previous, tiles))
  }, [sourceKey])
  const sources = retainRasterTiles(retained, tiles).sort((a, b) => a.zoom - b.zoom)
  return <g className="gh-raster-detail">{sources.map(tile => <SatelliteTile
    key={tile.key} tile={reprojectRasterTile(tile, projection)} onHealth={onHealth}
  />)}</g>
}

function GeoMap({
  sessionId,
  presentationMode,
  layers,
  workspaceReady,
  selected,
  highlightedLayerIds,
  runStatus,
  inspection,
  imageryTarget,
  onViewChange,
  onSelect,
}: {
  sessionId: string
  presentationMode: boolean
  layers: readonly LayerRecord[]
  workspaceReady: boolean
  selected: SelectedFeature | null
  highlightedLayerIds: ReadonlySet<string>
  runStatus: 'ready' | 'running' | 'success' | 'failed'
  inspection: ImageryInspection | null
  imageryTarget: ImageryTarget | null
  onViewChange: (view: ImageryView) => Promise<void>
  onSelect: (value: SelectedFeature | null) => void
}) {
  const [zoom, setZoom] = React.useState(1)
  const [pan, setPan] = React.useState({ x: 0, y: 0 })
  const [canvasMode, setCanvasMode] = React.useState<'satellite' | 'grid' | 'plain'>('satellite')
  const [rasterHealth, setRasterHealth] = React.useState<'loading' | 'ready' | 'unavailable'>('loading')
  const [legendOpen, setLegendOpen] = React.useState(false)
  const [userLocation, setUserLocation] = React.useState<BrowserLocation | null>(null)
  const [locationStatus, setLocationStatus] = React.useState<'waiting' | 'checking' | 'prompt' | 'requesting' | 'ready' | BrowserLocationFailure>('waiting')
  const [imageryViewStatus, setImageryViewStatus] = React.useState<'idle' | 'syncing' | 'ready' | 'error'>('idle')
  const [flightPhase, setFlightPhase] = React.useState<'idle' | 'zooming-out' | 'travelling' | 'zooming-in' | 'arrived'>('idle')
  const [flightProgress, setFlightProgress] = React.useState(0)
  const [inspectionStage, setInspectionStage] = React.useState<'idle' | 'flight' | 'boundary-resolving' | 'boundary-ready' | 'inspection' | 'result'>('idle')
  const [inspectionDisplayProgress, setInspectionDisplayProgress] = React.useState(0)
  const locationRequest = React.useRef(0)
  const drag = React.useRef<{ x: number, y: number, panX: number, panY: number } | null>(null)
  const activeInspection = imageryTarget !== null && imageryTarget.target_id !== inspection?.target_id
    ? null
    : inspection
  const analysisPlace = imageryTarget?.resolved_place ?? activeInspection?.resolved_place ?? null
  const analysisBounds = imageryTarget?.bbox ?? activeInspection?.bbox ?? null
  const analysisTargetId = imageryTarget?.target_id
    ?? (activeInspection?.resolved_place === null ? null : activeInspection?.inspection_id ?? null)
  const targetBounds = React.useMemo<GeoBounds>(
    () => analysisBounds !== null
      ? analysisBounds
      : layers.length > 0
        ? layerBounds(layers)
      : userLocation === null || presentationMode
        ? layerBounds([])
        : locationViewportBounds(userLocation),
    [layers, analysisBounds, userLocation, presentationMode],
  )
  const [bounds, setBounds] = React.useState<GeoBounds>(targetBounds)
  const boundsRef = React.useRef<GeoBounds>(targetBounds)
  const cameraView = React.useRef({ zoom, pan })
  cameraView.current = { zoom, pan }
  const flightRequest = React.useRef(0)
  const flightArrivalTimer = React.useRef<number | null>(null)
  const boundaryRevealTimer = React.useRef<number | null>(null)
  const inspectionRevealTimer = React.useRef<number | null>(null)
  const inspectionResultTimer = React.useRef<number | null>(null)
  const inspectionMinimumElapsed = React.useRef(false)
  const lastFlightTargetId = React.useRef<string | null>(null)
  const activeInspectionRef = React.useRef<ImageryInspection | null>(activeInspection)
  activeInspectionRef.current = activeInspection
  const latestTarget = React.useRef({ targetBounds, imageryTarget })
  latestTarget.current = { targetBounds, imageryTarget }
  const namedTargetReady = analysisPlace !== null && analysisBounds !== null
  const viewKey = namedTargetReady ? 'named-target' : targetBounds.join(',')
  const projection = React.useMemo(() => createMercatorProjection(bounds), [bounds])
  const project = projection.project
  const rasterTiles = React.useMemo(
    () => visibleEsriWorldImageryTiles(projection, zoom, pan),
    [projection, zoom, pan],
  )
  const rasterTileZoom = rasterTiles[0]?.zoom ?? 0
  const overviewTiles = React.useMemo(() => overviewEsriWorldImageryTiles(projection), [projection])
  const geographicView = React.useMemo(
    () => visibleGeographicBounds(projection, zoom, pan),
    [projection, zoom, pan],
  )
  React.useEffect(() => setImageryViewStatus('idle'), [sessionId])
  React.useEffect(() => {
    lastFlightTargetId.current = null
    setFlightPhase('idle')
    setFlightProgress(0)
    setInspectionStage('idle')
    setInspectionDisplayProgress(0)
    inspectionMinimumElapsed.current = false
  }, [sessionId])
  React.useEffect(() => {
    if (canvasMode === 'satellite') setRasterHealth('loading')
  }, [canvasMode])
  React.useEffect(() => {
    const request = ++flightRequest.current
    let animationFrame = 0
    const cleanup = () => {
      if (flightRequest.current === request) ++flightRequest.current
      window.cancelAnimationFrame(animationFrame)
      if (flightArrivalTimer.current !== null) window.clearTimeout(flightArrivalTimer.current)
      if (boundaryRevealTimer.current !== null) window.clearTimeout(boundaryRevealTimer.current)
      if (inspectionRevealTimer.current !== null) window.clearTimeout(inspectionRevealTimer.current)
      if (inspectionResultTimer.current !== null) window.clearTimeout(inspectionResultTimer.current)
    }
    if (flightArrivalTimer.current !== null) window.clearTimeout(flightArrivalTimer.current)
    if (boundaryRevealTimer.current !== null) window.clearTimeout(boundaryRevealTimer.current)
    if (inspectionRevealTimer.current !== null) window.clearTimeout(inspectionRevealTimer.current)
    if (inspectionResultTimer.current !== null) window.clearTimeout(inspectionResultTimer.current)
    const current = geoBoundsForView(boundsRef.current, cameraView.current.zoom, cameraView.current.pan)
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const targetChanged = analysisTargetId !== null
      && analysisPlace !== null
      && analysisBounds !== null
      && lastFlightTargetId.current !== analysisTargetId
    if (targetChanged) {
      lastFlightTargetId.current = analysisTargetId
      inspectionMinimumElapsed.current = false
    }
    const applyBounds = (next: GeoBounds) => {
      boundsRef.current = next
      setBounds(next)
    }
    setZoom(1)
    setPan({ x: 0, y: 0 })
    if (targetChanged) applyBounds(current)
    if (!targetChanged) {
      applyBounds(targetBounds)
      setFlightPhase('idle')
      setFlightProgress(0)
      if (analysisTargetId === null) setInspectionStage('idle')
      return cleanup
    }
    const revealBoundaryThenInspection = () => {
      setFlightPhase('idle')
      setInspectionStage('boundary-resolving')
      const waitForBoundary = () => {
        if (flightRequest.current !== request) return
        if (latestTarget.current.imageryTarget?.status === 'resolving') {
          boundaryRevealTimer.current = window.setTimeout(waitForBoundary, 250)
          return
        }
        const boundaryBounds = latestTarget.current.targetBounds
        const arrivedBounds = boundsRef.current
        const showBoundary = () => {
          applyBounds(boundaryBounds)
          setInspectionStage('boundary-ready')
          inspectionRevealTimer.current = window.setTimeout(() => {
            if (flightRequest.current !== request) return
            setInspectionStage('inspection')
            inspectionResultTimer.current = window.setTimeout(() => {
              if (flightRequest.current !== request) return
              inspectionMinimumElapsed.current = true
              if (activeInspectionRef.current !== null) setInspectionStage('result')
            }, 1800)
          }, 1100)
        }
        if (reducedMotion || boundaryBounds.every((value, index) => Math.abs(value - arrivedBounds[index]) < 1e-7)) {
          showBoundary()
        } else {
          // Real boundary extents can differ from the geocoder's candidate.
          // Ease into that refinement instead of snapping after the flight.
          const startedAt = performance.now()
          const settle = (now: number) => {
            if (flightRequest.current !== request) return
            const progress = Math.min(1, (now - startedAt) / 850)
            applyBounds(interpolateMercatorView(arrivedBounds, boundaryBounds, progress))
            if (progress < 1) animationFrame = window.requestAnimationFrame(settle)
            else showBoundary()
          }
          animationFrame = window.requestAnimationFrame(settle)
        }
      }
      boundaryRevealTimer.current = window.setTimeout(waitForBoundary, 900)
    }
    setInspectionStage('flight')
    if (reducedMotion) {
      applyBounds(targetBounds)
      setFlightPhase('arrived')
      setFlightProgress(1)
      flightArrivalTimer.current = window.setTimeout(revealBoundaryThenInspection, 650)
      return cleanup
    }
    const flight = createGeoViewFlight(current, targetBounds)
    const startedAt = performance.now()
    const animate = (now: number) => {
      if (flightRequest.current !== request) return
      const progress = Math.min(1, (now - startedAt) / flight.duration)
      setFlightProgress(progress)
      setFlightPhase(progress < .3 ? 'zooming-out' : progress < .7 ? 'travelling' : 'zooming-in')
      applyBounds(flight.sample(progress))
      if (progress < 1) {
        animationFrame = window.requestAnimationFrame(animate)
        return
      }
      applyBounds(targetBounds)
      setFlightPhase('arrived')
      setFlightProgress(1)
      flightArrivalTimer.current = window.setTimeout(revealBoundaryThenInspection, 900)
    }
    animationFrame = window.requestAnimationFrame(animate)
    return cleanup
  }, [
    sessionId,
    analysisTargetId,
    viewKey,
  ])
  React.useEffect(() => {
    if (inspectionStage === 'inspection' && inspectionMinimumElapsed.current && activeInspection !== null) {
      setInspectionStage('result')
    }
  }, [inspectionStage, activeInspection])
  React.useEffect(() => {
    if (inspectionStage !== 'inspection') {
      setInspectionDisplayProgress(inspectionStage === 'result' ? 1 : 0)
      return
    }
    const startedAt = performance.now()
    const duration = 1800
    let animationFrame = 0
    const animate = (now: number) => {
      const elapsed = Math.min(duration, now - startedAt)
      const progress = elapsed / duration
      const observed = activeInspectionRef.current !== null ? 1 : Math.min(.95, latestTarget.current.imageryTarget?.progress ?? .3)
      setInspectionDisplayProgress(Math.min(observed, 1 - ((1 - progress) ** 3)))
      if (elapsed < duration || observed < 1) animationFrame = window.requestAnimationFrame(animate)
    }
    animationFrame = window.requestAnimationFrame(animate)
    return () => window.cancelAnimationFrame(animationFrame)
  }, [inspectionStage, analysisTargetId])
  React.useEffect(() => {
    const request = ++locationRequest.current
    setUserLocation(null)
    if (!workspaceReady || layers.length > 0) {
      setLocationStatus('waiting')
      return
    }
    setLocationStatus('checking')
    void browserLocationPermission().then(async permission => {
      if (locationRequest.current !== request) return
      if (!shouldAutoRequestBrowserLocation(permission)) {
        setLocationStatus(permission)
        return
      }
      setLocationStatus('requesting')
      const result = await requestBrowserLocation()
      if (locationRequest.current !== request) return
      if (result.ok) {
        setUserLocation(result.location)
        setLocationStatus('ready')
      } else {
        setLocationStatus(result.reason)
      }
    })
  }, [sessionId, workspaceReady, layers.length])
  const locateCurrentPosition = async () => {
    const request = ++locationRequest.current
    setLocationStatus('requesting')
    const result = await requestBrowserLocation()
    if (locationRequest.current !== request) return
    if (result.ok) {
      setUserLocation(result.location)
      setLocationStatus('ready')
    } else {
      setUserLocation(null)
      setLocationStatus(result.reason)
    }
  }
  const visibleLayers = layers.filter(layer => layer.visible)
  const centerLongitude = ((bounds[0] + bounds[2]) / 2).toFixed(4)
  const centerLatitude = ((bounds[1] + bounds[3]) / 2).toFixed(4)
  const visibleCrs = [...new Set(visibleLayers.map(layer => layer.crs))]
  const locationPoint = userLocation === null ? null : project([userLocation.longitude, userLocation.latitude])
  const locationAccuracyRadius = userLocation === null || locationPoint === null
    ? 0
    : Math.max(7, Math.min(85, Math.abs(project([
        userLocation.longitude + userLocation.accuracy / (111_320 * Math.max(0.05, Math.cos(userLocation.latitude * Math.PI / 180))),
        userLocation.latitude,
      ])[0] - locationPoint[0])))
  const orderedLayers = [...visibleLayers].sort((left, right) => {
    const order: Record<string, number> = { districts: 0, rivers: 1, roads: 2, buildings: 3 }
    return (order[left.name] ?? 4) - (order[right.name] ?? 4)
  })
  const layerGroups = React.useMemo(() => groupWorkspaceLayers(layers), [layers])
  const inputLayerIds = React.useMemo(() => new Set(layerGroups.input.map(layer => layer.id)), [layerGroups])
  const intermediateLayerIds = React.useMemo(() => new Set(layerGroups.intermediate.map(layer => layer.id)), [layerGroups])
  const finalLayerIds = React.useMemo(() => new Set(layerGroups.final.map(layer => layer.id)), [layerGroups])
  const displayOpacity = (layer: LayerRecord) => {
    const role = inputLayerIds.has(layer.id)
      ? 'input'
      : intermediateLayerIds.has(layer.id)
        ? 'intermediate'
        : finalLayerIds.has(layer.id)
          ? 'final'
          : 'other'
    const focused = highlightedLayerIds.has(layer.id) || selected?.layer.id === layer.id
    return mapLayerOpacity(layer.opacity, role, focused)
  }
  const highlightedLayers = visibleLayers.filter(layer => highlightedLayerIds.has(layer.id))
  const inspectionFrame = activeInspection === null ? null : (() => {
    const [left, bottom] = project([activeInspection.bbox[0], activeInspection.bbox[1]])
    const [right, top] = project([activeInspection.bbox[2], activeInspection.bbox[3]])
    return { x: Math.min(left, right), y: Math.min(top, bottom), width: Math.abs(right - left), height: Math.abs(bottom - top) }
  })()
  const administrativeBoundary = analysisPlace?.administrative_boundary ?? null
  const boundaryRevealed = inspectionStage === 'boundary-ready' || inspectionStage === 'inspection' || inspectionStage === 'result'
  const administrativeBoundaryPaths = administrativeBoundary === null || !boundaryRevealed
    ? []
    : geometryPaths(administrativeBoundary.geometry, project).filter(Boolean)
  const administrativeBoundaryPath = administrativeBoundaryPaths.join(' ')
  const inspectionRevealed = inspectionStage === 'result'
  const flightLabel = flightPhase === 'zooming-out'
    ? '正在缩小当前区域'
    : flightPhase === 'travelling'
      ? `正在移动到 ${analysisPlace?.label ?? '目标区域'}`
      : flightPhase === 'zooming-in'
        ? '正在放大行政区范围'
        : flightPhase === 'arrived'
          ? '已锁定行政区边界'
          : ''
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
    <section
      className={`gh-map is-${canvasMode}`}
      aria-label="Map workspace"
      data-map-flight={flightPhase}
      data-inspection-stage={inspectionStage}
      data-boundary-clipped={boundaryRevealed && administrativeBoundary !== null ? 'true' : 'false'}
    >
      <div className="gh-map-toolbar" aria-label="Map controls">
        <button type="button" onClick={() => setZoom(value => Math.min(5, value * 1.35))} aria-label="Zoom in">+</button>
        <button type="button" onClick={() => setZoom(value => Math.max(0.7, value / 1.35))} aria-label="Zoom out">−</button>
        <button type="button" onClick={() => { setZoom(1); setPan({ x: 0, y: 0 }) }} aria-label="Fit bounds">⌖</button>
        <button
          type="button"
          aria-label="Toggle map canvas"
          aria-pressed={canvasMode === 'satellite'}
          title="切换卫星 / 网格 / 纯色底图"
          onClick={() => setCanvasMode(value => value === 'satellite' ? 'grid' : value === 'grid' ? 'plain' : 'satellite')}
        ><small>{canvasMode === 'satellite' ? 'SAT' : canvasMode === 'grid' ? 'GRID' : 'PLAIN'}</small></button>
        {canvasMode === 'satellite' && <button
          type="button"
          className={`gh-map-imagery is-${imageryViewStatus}`}
          aria-label="Prepare satellite visual inspection"
          title="将当前地图视野保存到本地 Session，供 Agent 视觉巡检"
          disabled={imageryViewStatus === 'syncing'}
          onClick={() => {
            setImageryViewStatus('syncing')
            void onViewChange({ bbox: [...geographicView], zoom: rasterTileZoom })
              .then(() => setImageryViewStatus('ready'))
              .catch(() => setImageryViewStatus('error'))
          }}
        ><small>{imageryViewStatus === 'syncing' ? '…' : imageryViewStatus === 'ready' ? '✓' : imageryViewStatus === 'error' ? '!' : 'AI'}</small></button>}
        {layers.length === 0 && <button
          type="button"
          className={`gh-map-locate is-${locationStatus}`}
          aria-label="Locate current position"
          title="定位到当前位置"
          disabled={!workspaceReady || locationStatus === 'checking' || locationStatus === 'requesting'}
          onClick={() => { void locateCurrentPosition() }}
        >{locationStatus === 'requesting' || locationStatus === 'checking' ? '…' : '◎'}</button>}
      </div>
      <div className="gh-map-label">
        <span>{flightPhase !== 'idle' && flightPhase !== 'arrived'
          ? 'FLYING TO ANALYSIS AREA'
          : inspectionStage === 'boundary-resolving'
            ? 'RESOLVING ADMIN BOUNDARY'
            : inspectionStage === 'boundary-ready'
              ? 'ADMIN BOUNDARY READY'
          : boundaryRevealed && administrativeBoundary !== null
            ? 'ADMIN BOUNDARY ANALYSIS'
            : layers.length > 0
              ? 'CANONICAL WORKSPACE'
              : activeInspection !== null
                ? 'RASTER ANALYSIS VIEW'
                : userLocation !== null && !presentationMode
                  ? 'YOUR LOCATION · LOCAL ONLY'
                  : 'AGENT WORKSPACE'}</span>
        <small>{Math.abs(Number(centerLatitude)).toFixed(4)}° {Number(centerLatitude) >= 0 ? 'N' : 'S'} · {Math.abs(Number(centerLongitude)).toFixed(4)}° {Number(centerLongitude) >= 0 ? 'E' : 'W'} · {visibleCrs.join(' / ') || 'CRS84'}</small>
      </div>
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
          {canvasMode === 'satellite' && <g className="gh-map-raster" aria-label="Esri World Imagery satellite basemap">
            {overviewTiles.map(tile => <image key={tile.key} href={tile.url} x={tile.x} y={tile.y} width={tile.width} height={tile.height} preserveAspectRatio="none" />)}
            <SatelliteDetail tiles={rasterTiles} projection={projection} onHealth={ready => {
              setRasterHealth(value => ready ? 'ready' : value === 'ready' ? value : 'unavailable')
            }} />
            <rect className="gh-map-raster-shade" x="-2000" y="-2000" width="5000" height="5000" />
          </g>}
          {boundaryRevealed && administrativeBoundaryPath !== '' && <g className="gh-admin-boundary" aria-label="Administrative boundary clip">
            <path
              className="gh-admin-boundary-outside"
              d={`M-3000,-3000 H4000 V3700 H-3000 Z ${administrativeBoundaryPath}`}
              fillRule="evenodd"
            />
            <g className="gh-admin-boundary-outline">
              {administrativeBoundaryPaths.map((path, index) => <path
                key={`administrative-boundary-${index}`}
                d={path}
                fill="none"
                fillRule="evenodd"
                vectorEffect="non-scaling-stroke"
              />)}
            </g>
          </g>}
          {inspectionRevealed && activeInspection !== null && activeInspection.overlay_layer.visible && inspectionFrame !== null && <image
            className="gh-imagery-inspection-overlay"
            href={`data:${activeInspection.overlay_mime_type};base64,${activeInspection.overlay_base64}`}
            x={inspectionFrame.x}
            y={inspectionFrame.y}
            width={inspectionFrame.width}
            height={inspectionFrame.height}
            preserveAspectRatio="none"
            opacity={activeInspection.overlay_layer.opacity}
            aria-label="Satellite visual inspection overlay"
          />}
          {!presentationMode && layers.length === 0 && analysisPlace === null && locationPoint !== null && <g className="gh-user-location" transform={`translate(${locationPoint[0]} ${locationPoint[1]})`} aria-label="Current computer location">
            <circle className="gh-user-location-accuracy" r={locationAccuracyRadius} />
            <circle className="gh-user-location-pulse" r="15" />
            <circle className="gh-user-location-dot" r="6" vectorEffect="non-scaling-stroke" />
          </g>}
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
              opacity: displayOpacity(layer),
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
      {flightPhase !== 'idle' && <div className={`gh-map-flight is-${flightPhase}`} role="status" aria-live="polite">
        <span>MAP FLIGHT · {Math.round(flightProgress * 100)}%</span>
        <strong>{flightLabel}</strong>
        <i><b style={{ width: `${Math.round(flightProgress * 100)}%` }} /></i>
      </div>}
      {(inspectionStage === 'boundary-resolving' || inspectionStage === 'boundary-ready') && imageryTarget !== null && <div
        className={`gh-map-boundary-progress is-${inspectionStage === 'boundary-ready' ? 'ready' : 'resolving'}`}
        role="status"
        aria-live="polite"
      >
        <div className="gh-inspection-spinner" aria-hidden="true"><i /><i /><i /></div>
        <span><small>ADMINISTRATIVE BOUNDARY · {inspectionStage === 'boundary-ready' ? 'READY' : 'RESOLVING'}</small>
          <strong>{inspectionStage === 'boundary-ready' ? '行政区边界解析完成' : '正在解析行政区边界'}</strong>
          <em>{analysisPlace?.label ?? imageryTarget.query ?? '目标区域'}{analysisPlace?.cache_provenance ? ' · 真实边界缓存' : ''}</em>
        </span>
        <b><i style={{ width: inspectionStage === 'boundary-ready' ? '100%' : '58%' }} /></b>
      </div>}
      {inspectionStage === 'inspection' && imageryTarget !== null && imageryTarget.status !== 'failed' && <div className="gh-map-inspection-progress" role="status" aria-live="polite">
        <div className="gh-inspection-spinner" aria-hidden="true"><i /><i /><i /></div>
        <span><small>IMAGERY INSPECTION · {Math.round(inspectionDisplayProgress * 100)}%</small>
          <strong>正在执行区内像素巡检与蒙版生成</strong>
          <em>{analysisPlace?.label ?? imageryTarget.query ?? '当前地图视野'}</em>
        </span>
        <b><i style={{ width: `${Math.round(inspectionDisplayProgress * 100)}%` }} /></b>
      </div>}
      {(inspectionStage === 'inspection' || inspectionStage === 'result') && imageryTarget?.status === 'failed' && <div className="gh-map-inspection-progress is-failed" role="alert">
        <span><small>IMAGERY INSPECTION · FAILED</small><strong>影像巡检未完成</strong><em>{imageryTarget.error ?? imageryTarget.message}</em></span>
      </div>}
      {presentationMode && runStatus === 'ready' && layers.length === 0 && activeInspection === null && imageryTarget === null && <div className="gh-map-empty-card">
        <span className="gh-eyebrow">PRESENTATION VIEW</span><strong>输入一个地点，开始影像巡检</strong>
        <p>演示模式使用公开起始视野，隐藏电脑定位。分析仍由真实 Agent 和工具执行。</p>
      </div>}
      {!presentationMode && runStatus === 'ready' && layers.length === 0 && activeInspection === null && imageryTarget === null && <div className={`gh-map-empty-card is-location-${locationStatus}`}>
        <span className="gh-eyebrow">{locationStatus === 'ready' ? 'CURRENT LOCATION' : 'MAP WORKSPACE'}</span>
        <strong>{locationStatus === 'ready' ? '已定位到当前位置' : locationStatus === 'requesting' || locationStatus === 'checking' ? '正在准备定位…' : '新会话尚无地图数据'}</strong>
        <p>{locationStatus === 'ready' && userLocation !== null
          ? `${locationAccuracyLabel(userLocation.accuracy)} · 坐标只用于当前浏览器地图，不会自动发送给 Agent。`
          : locationStatus === 'denied'
            ? '定位权限已关闭。请在浏览器中允许位置权限，并确认 Windows「隐私和安全性 → 位置」已开启。'
            : locationStatus === 'unavailable'
              ? '系统暂时无法确定位置。请开启 Windows「隐私和安全性 → 位置」后重试。'
              : locationStatus === 'timeout'
                ? '定位请求超时。请开启 Windows「隐私和安全性 → 位置」后重试。'
                : locationStatus === 'unsupported'
                  ? '当前浏览器不支持定位，可继续导入数据或让 Agent 发现数据。'
                  : '允许定位后，空会话会显示当前位置；分析数据加载后地图会自动切换到数据范围。'}</p>
        {(locationStatus === 'prompt' || locationStatus === 'denied' || locationStatus === 'unavailable' || locationStatus === 'timeout') && <button type="button" onClick={() => { void locateCurrentPosition() }}>定位到当前位置</button>}
      </div>}
      {(visibleLayers.length > 0 || activeInspection?.overlay_layer.visible) && <aside className={`gh-map-legend${legendOpen ? ' is-open' : ''}`} aria-label="Map legend">
        <button type="button" aria-expanded={legendOpen} onClick={() => setLegendOpen(open => !open)}>
          <span>Legend</span><small>{visibleLayers.length + (activeInspection?.overlay_layer.visible ? 1 : 0)}</small><i>{legendOpen ? '−' : '+'}</i>
        </button>
        {legendOpen && <div>{activeInspection?.overlay_layer.visible && <span key={activeInspection.overlay_layer.layer_id}>
          <i className="is-raster-overlay" /><b title={activeInspection.overlay_layer.name}>{activeInspection.overlay_layer.name}</b><small>{Math.round(activeInspection.overlay_layer.opacity * 100)}%</small>
        </span>}{visibleLayers.slice(-6).reverse().map(layer => <span key={layer.id}>
          <i style={{ background: layer.style.color }} /><b title={layer.name}>{layer.name}</b><small>{Math.round(displayOpacity(layer) * 100)}%</small>
        </span>)}{visibleLayers.length > 6 && <em>+ {visibleLayers.length - 6} more visible layers</em>}</div>}
      </aside>}
      {inspectionRevealed && activeInspection !== null && <aside className="gh-imagery-inspection-card" aria-label="Satellite visual inspection result">
        <header><span><small>VISUAL SCREENING</small><b>{analysisPlace?.label ?? '卫星影像'} · 视觉初筛</b></span><em>RGB 启发式</em></header>
        <div>{activeInspection.categories.map(item => <span className={`is-${item.category}`} key={item.category}>
          <i /><small>{{ water: '水体外观', vegetation: '植被外观', built_up: '建成区外观', bare_ground: '裸地外观' }[item.category] ?? item.category}</small><b>{(item.pixel_ratio * 100).toFixed(1)}%</b><em>{Math.round(item.heuristic_confidence * 100)}% conf.</em>
        </span>)}</div>
        <footer>{activeInspection.analysis_scope?.boundary_clipped
          ? `${activeInspection.analysis_scope.analysis_pixel_count.toLocaleString()} 区内像素 · ${analysisPlace?.cache_provenance ? '真实边界缓存裁剪' : '行政边界裁剪'} · z${activeInspection.tile_zoom}`
          : `${activeInspection.pixel_width}×${activeInspection.pixel_height} px · z${activeInspection.tile_zoom}`} · 仅视觉初筛，不代表实测面积</footer>
      </aside>}
      <div className="gh-map-scale"><span /> <b>{mapScaleLabel(bounds, zoom)}</b><small>{zoom.toFixed(1)}×</small></div>
      <div className="gh-map-attribution">
        {canvasMode === 'satellite'
          ? `卫星影像 © Esri · ${administrativeBoundary === null ? '' : '边界 © OpenStreetMap contributors · ODbL · '}${rasterHealth === 'ready' ? '在线' : rasterHealth === 'unavailable' ? '不可用，已回退' : '加载中'}`
          : `${layers.length > 0 ? 'Canonical Agent workspace' : 'Agent workspace awaiting data'} · local vector canvas`}
      </div>
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
  preferences?: Record<string, LayerDisplayPreference>
}

interface LayerDetails {
  schema_version: '1.0'
  metadata: WorkspaceProjectionItem['metadata']
  fields: { name: string, type: string, null_count: number }[]
  rows: ({ __row_index: number } & Record<string, unknown>)[]
  preview: {
    limit: number
    offset: number
    returned_rows: number
    total_rows: number
    total_fields: number
    fields_truncated: boolean
    rows_truncated: boolean
  }
  quality: {
    missing_crs: boolean
    null_geometry_count: number
    empty_geometry_count: number
    invalid_geometry_count: number
  }
  warnings: string[]
}

interface AgentRunManifest {
  schema_version: '1.0'
  run_id: string
  session_id: string
  turn: number
  user_goal: string
  user_event_seq: number
  status: 'running' | 'success' | 'failed'
  provider: string | null
  model: string | null
  max_event_seq: number
  tool_calls: Array<{
    call_id: string
    name: string
    status: 'running' | 'success' | 'failed'
    input_layers: string[]
    output_layers: string[]
    warnings: string[]
    result_data: Record<string, unknown>
  }>
  input_layers: string[]
  output_layers: string[]
  reused_layers: string[]
  final_answer: { event_seq: number, text: string } | null
  errors: Array<{ classification: 'provider' | 'tool' | 'data', message: string }>
  retries: unknown[]
}

interface ResultLayerSnapshot {
  layer_id: string
  name: string
  role: 'input' | 'output'
  source: 'scenario' | 'upload' | 'derived'
  geometry: string
  crs: string
  feature_count: number
  generated_by: string | null
  parents: string[]
  warnings: string[]
}

interface ResultAsset {
  asset_type: 'export' | 'run'
  asset_id: string
  file_name: string
  format: 'geojson' | 'gpkg' | 'csv' | 'json'
  layer_id: string | null
  feature_count: number | null
  size_bytes: number
  created_at: string
  downloadable: boolean
}

interface ResultCenter {
  schema_version: '1.0'
  run_id: string
  session_id: string
  turn: number
  status: 'running' | 'success' | 'failed'
  user_goal: string
  final_answer: string | null
  provider: string | null
  model: string | null
  tools: { total: number, success: number, failed: number, running: number }
  input_layers: ResultLayerSnapshot[]
  output_layers: ResultLayerSnapshot[]
  statistics: Array<{ call_id: string, tool: string, summary: string | null, data: Record<string, unknown> }>
  crs: string[]
  units: string[]
  sources: Array<{ layer_id: string, kind: 'upload' | 'scenario' | 'derived', name: string, detail: string }>
  warnings: string[]
  assets: ResultAsset[]
}

interface ResultDownload {
  schema_version: '1.0'
  asset_type: 'export' | 'run' | 'diagnostic'
  asset_id: string
  file_name: string
  format: string
  mime_type: string
  size_bytes: number
  sha256: string
  content_base64: string
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
  preview: CsvPreview | null
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

function saveResultDownload(download: ResultDownload) {
  const binary = atob(download.content_base64)
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index)
  if (bytes.byteLength !== download.size_bytes) throw new Error('下载资产的字节数与 Workspace 索引不一致')
  const url = URL.createObjectURL(new Blob([bytes], { type: download.mime_type }))
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = download.file_name
  anchor.click()
  setTimeout(() => URL.revokeObjectURL(url), 0)
}

function flattenResultData(value: unknown, path = '', rows: Array<[string, string]> = []): Array<[string, string]> {
  if (rows.length >= 40) return rows
  if (value === null || typeof value !== 'object') {
    rows.push([path || 'value', value === null ? 'null' : String(value)])
  } else if (Array.isArray(value)) {
    rows.push([path || 'value', JSON.stringify(value).slice(0, 500)])
  } else {
    for (const [key, child] of Object.entries(value)) {
      flattenResultData(child, path ? `${path}.${key}` : key, rows)
      if (rows.length >= 40) break
    }
  }
  return rows
}

interface GeoHarnessInjected {
  agent: {
    history(): Promise<{ events: unknown[] }>
    workspace(): Promise<WorkspaceProjection>
    importCapabilities(): Promise<ImportCapabilities>
    importData(request: ImportRequest): Promise<ImportResult>
    layerDetails(layerId: string): Promise<LayerDetails>
    renameLayer(layerId: string, name: string): Promise<void>
    removeLayer(layerId: string): Promise<void>
    setLayerPreference(layerId: string, preference: Partial<LayerDisplayPreference>): Promise<void>
    runs(): Promise<AgentRunManifest[]>
    result(runId?: string): Promise<ResultCenter | null>
    saveImageryView(view: ImageryView): Promise<void>
    imageryTarget(): Promise<ImageryTarget | null>
    imageryInspection(): Promise<ImageryInspection | null>
    setImageryPreference(inspectionId: string, preference: Partial<Pick<RasterOverlayLayer, 'visible' | 'opacity'>>): Promise<void>
    download(assetType: 'export' | 'run', assetId: string): Promise<ResultDownload>
    diagnostics(): Promise<ResultDownload>
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
  project(
    sessionId: string,
    projection: readonly WorkspaceProjectionItem[],
    preferences: Readonly<Record<string, LayerDisplayPreference>> = {},
  ) {
    const layers = registerWorkspaceProjection(layersBySession.get(sessionId) ?? [], projection, preferences)
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
  selectedLayerId: string | null,
  onInspect: (layerId: string) => void,
  onPreference: (layerId: string, preference: Partial<LayerDisplayPreference>) => void,
  outputStatus?: AgentToolStep['status'],
) {
  const persistOpacity = (target: HTMLInputElement) => {
    onPreference(layer.id, { opacity: Number(target.value) })
  }
  return (
    <article
      className={`gh-layer-row${highlightedLayerIds.has(layer.id) ? ' is-step-highlighted' : ''}${selectedLayerId === layer.id ? ' is-data-selected' : ''}`}
      data-layer-id={layer.id}
      data-layer-name={layer.name}
      key={layer.id}
    >
      <button
        type="button"
        className={layer.visible ? 'gh-layer-toggle is-visible' : 'gh-layer-toggle'}
        aria-label={`${layer.visible ? 'Hide' : 'Show'} ${layer.name}`}
        aria-pressed={layer.visible}
        onClick={() => {
          layerWorkspace.update(sessionId, current => toggleLayerVisibility(current, layer.id))
          onPreference(layer.id, { visible: !layer.visible })
        }}
      ><span style={{ background: layer.style.color }} /></button>
      <div className="gh-layer-meta">
        <button type="button" className="gh-layer-open" onClick={() => onInspect(layer.id)}>
          <strong>{layer.name}{outputStatus === 'success' && <em className="gh-output-check">✓</em>}</strong>
          <small>{layer.geometry} · {layer.featureCount} features</small>
          {layer.generatedBy !== null && <small>step · {layer.generatedBy}</small>}
        </button>
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
          onMouseUp={event => persistOpacity(event.currentTarget)}
          onTouchEnd={event => persistOpacity(event.currentTarget)}
          onKeyUp={event => persistOpacity(event.currentTarget)}
          onBlur={event => persistOpacity(event.currentTarget)}
        />
        <details className="gh-layer-style-controls">
          <summary>样式</summary>
          <div>
            <label title="图层颜色">
              <span>颜色</span>
              <input
                type="color"
                value={layer.style.color}
                aria-label={`${layer.name} color`}
                onChange={event => {
                  const color = event.currentTarget.value
                  layerWorkspace.update(sessionId, current => setLayerStyle(current, layer.id, { color }))
                }}
              />
            </label>
            <label title="边线宽度">
              <span>线宽 {layer.style.lineWidth.toFixed(1)}</span>
              <input
                type="range"
                min="0.5"
                max="6"
                step="0.5"
                value={layer.style.lineWidth}
                aria-label={`${layer.name} line width`}
                onChange={event => {
                  const lineWidth = Number(event.currentTarget.value)
                  layerWorkspace.update(sessionId, current => setLayerStyle(current, layer.id, { lineWidth }))
                }}
              />
            </label>
            <button type="button" title="恢复 GeoHarness 语义样式" onClick={() => {
              layerWorkspace.update(sessionId, current => resetLayerStyle(current, layer.id))
            }}>重置</button>
          </div>
        </details>
      </div>
    </article>
  )
}

function renderRasterOverlayRow(
  inspection: ImageryInspection,
  onPreference: (preference: Partial<Pick<RasterOverlayLayer, 'visible' | 'opacity'>>) => void,
) {
  const layer = inspection.overlay_layer
  return (
    <article
      className="gh-layer-row gh-raster-layer-row"
      data-layer-id={layer.layer_id}
      data-layer-name={layer.name}
      key={layer.layer_id}
    >
      <button
        type="button"
        className={layer.visible ? 'gh-layer-toggle is-visible' : 'gh-layer-toggle'}
        aria-label={`${layer.visible ? 'Hide' : 'Show'} ${layer.name}`}
        aria-pressed={layer.visible}
        onClick={() => onPreference({ visible: !layer.visible })}
      ><span className="is-raster-overlay" /></button>
      <div className="gh-layer-meta">
        <div className="gh-layer-open gh-raster-layer-meta">
          <strong>{layer.name}<em className="gh-output-check">✓</em></strong>
          <small>Raster Overlay · {inspection.pixel_width}×{inspection.pixel_height} px</small>
          <small>{inspection.resolved_place?.label ?? 'current viewport'} · inspect_satellite_view</small>
        </div>
        <div className="gh-raster-opacity-control">
          <button
            type="button"
            aria-label={`Decrease ${layer.name} opacity`}
            disabled={layer.opacity <= 0}
            onClick={() => onPreference({ opacity: Math.max(0, Math.round((layer.opacity - 0.1) * 100) / 100) })}
          >−</button>
          <input
            type="range"
            min="0"
            max="1"
            step="0.01"
            value={layer.opacity}
            aria-label={`${layer.name} opacity`}
            onChange={event => onPreference({ opacity: Number(event.currentTarget.value) })}
          />
          <output>{Math.round(layer.opacity * 100)}%</output>
          <button
            type="button"
            aria-label={`Increase ${layer.name} opacity`}
            disabled={layer.opacity >= 1}
            onClick={() => onPreference({ opacity: Math.min(1, Math.round((layer.opacity + 0.1) * 100) / 100) })}
          >+</button>
        </div>
      </div>
    </article>
  )
}

function GeoHarnessLayerPanel({
  onClose,
  selectedLayerId,
  onInspect,
  onPreference,
  inspection,
  onImageryPreference,
  layerStatuses,
  statisticsCount,
}: {
  onClose: () => void
  selectedLayerId: string | null
  onInspect: (layerId: string) => void
  onPreference: (layerId: string, preference: Partial<LayerDisplayPreference>) => void
  inspection: ImageryInspection | null
  onImageryPreference: (preference: Partial<Pick<RasterOverlayLayer, 'visible' | 'opacity'>>) => void
  layerStatuses: Readonly<Record<string, AgentToolStep['status']>>
  statisticsCount: number
}) {
  const workspace = useLayerWorkspace()
  const groups = groupWorkspaceLayers(workspace.layers)
  const totalLayerCount = workspace.layers.length + (inspection === null ? 0 : 1)
  const visibleCount = workspace.layers.filter(layer => layer.visible).length + (inspection?.overlay_layer.visible ? 1 : 0)
  return (
    <section className="gh-sidebar-layers gh-map-layer-panel" aria-label="Layer panel">
      <div className="gh-sidebar-layer-heading">
        <span><b>Layers</b><small>Verified Agent workspace</small></span>
        <span className="gh-layer-panel-actions">
          <span className="gh-panel-count">{totalLayerCount}</span>
          <button type="button" className="gh-layer-panel-close" aria-label="关闭图层面板" onClick={onClose}>×</button>
        </span>
      </div>
      <div className="gh-layer-section-label">Workspace input data</div>
      <div className="gh-layer-list">
        {groups.input.map(layer => renderLayerRow(
          workspace.sessionId ?? '', layer, workspace.highlightedLayerIds,
          selectedLayerId, onInspect, onPreference,
        ))}
      </div>
      <div className="gh-layer-section-label"><span>Raster analysis layers</span><small>{inspection === null ? 0 : 1}</small></div>
      <div className="gh-layer-list gh-raster-layer-list" aria-label="Raster analysis layers">
        {inspection === null
          ? <p className="gh-output-empty">影像巡检完成后，蒙版会作为 Raster Layer 显示在这里。</p>
          : renderRasterOverlayRow(inspection, onImageryPreference)}
      </div>
      <div className="gh-layer-section-label"><span>Intermediate layers</span><small>{groups.intermediate.length}</small></div>
      <div className="gh-layer-list gh-output-list" aria-label="Task output layers">
        {groups.intermediate.length === 0 && <p className="gh-output-empty">当前没有被下游继续使用的中间图层。</p>}
        {groups.intermediate.map(layer => renderLayerRow(
          workspace.sessionId ?? '', layer, workspace.highlightedLayerIds,
          selectedLayerId, onInspect, onPreference, layerStatuses[layer.id] ?? 'success',
        ))}
      </div>
      <div className="gh-layer-section-label"><span>Final result layers</span><small>{groups.final.length}</small></div>
      <div className="gh-layer-list gh-output-list gh-final-output-list" aria-label="Final result layers">
        {groups.final.length === 0 && <p className="gh-output-empty">Agent 完成空间 Tool 后，lineage 叶子图层会显示在这里。</p>}
        {groups.final.map(layer => renderLayerRow(
          workspace.sessionId ?? '', layer, workspace.highlightedLayerIds,
          selectedLayerId, onInspect, onPreference, layerStatuses[layer.id] ?? 'success',
        ))}
      </div>
      <div className="gh-layer-statistics-summary"><span>∑</span><b>{statisticsCount} structured statistics</b><small>见右侧 Result Center</small></div>
      <div className="gh-layer-footer">
        <span>{visibleCount} visible</span><span>{workspace.layers[0]?.crs ?? 'CRS —'}</span>
      </div>
    </section>
  )
}

function attributeValue(value: unknown) {
  if (value === null || value === undefined) return 'null'
  if (typeof value === 'object') return JSON.stringify(value)
  return String(value)
}

function GeoHarnessDataWorkbench({
  layer,
  details,
  loading,
  error,
  selectedFeatureIndex,
  onClose,
  onSelectRow,
  onReload,
  onRename,
  onRemove,
}: {
  layer: LayerRecord
  details: LayerDetails | null
  loading: boolean
  error: string | null
  selectedFeatureIndex: number | null
  onClose: () => void
  onSelectRow: (index: number) => void
  onReload: () => void
  onRename: (name: string) => Promise<void>
  onRemove: () => Promise<void>
}) {
  const [name, setName] = React.useState(layer.name)
  const [actionError, setActionError] = React.useState<string | null>(null)
  const [actionBusy, setActionBusy] = React.useState(false)
  const [removeArmed, setRemoveArmed] = React.useState(false)
  const [rowQuery, setRowQuery] = React.useState('')
  const [sortField, setSortField] = React.useState<string | null>(null)
  const [sortDescending, setSortDescending] = React.useState(false)
  const selectedRow = React.useRef<HTMLTableRowElement | null>(null)
  React.useEffect(() => { setName(layer.name) }, [layer.id, layer.name])
  React.useEffect(() => {
    setRowQuery('')
    setSortField(null)
    setSortDescending(false)
  }, [layer.id])
  React.useEffect(() => {
    selectedRow.current?.scrollIntoView({ block: 'nearest' })
  }, [selectedFeatureIndex])

  const rename = async () => {
    setActionBusy(true)
    setActionError(null)
    try {
      await onRename(name)
    } catch (reason) {
      setActionError(reason instanceof Error ? reason.message : String(reason))
    } finally {
      setActionBusy(false)
    }
  }
  const remove = async () => {
    if (!removeArmed) {
      setRemoveArmed(true)
      return
    }
    setActionBusy(true)
    setActionError(null)
    try {
      await onRemove()
    } catch (reason) {
      setActionError(reason instanceof Error ? reason.message : String(reason))
      setRemoveArmed(false)
    } finally {
      setActionBusy(false)
    }
  }
  const visibleRows = React.useMemo(() => {
    if (details === null) return []
    const normalized = rowQuery.trim().toLocaleLowerCase()
    const filtered = normalized === '' ? details.rows : details.rows.filter(row => details.fields.some(field => (
      attributeValue(row[field.name]).toLocaleLowerCase().includes(normalized)
    )))
    if (sortField === null) return filtered
    return [...filtered].sort((left, right) => {
      const leftValue = left[sortField]
      const rightValue = right[sortField]
      const numeric = typeof leftValue === 'number' && typeof rightValue === 'number'
      const order = numeric
        ? leftValue - rightValue
        : attributeValue(leftValue).localeCompare(attributeValue(rightValue), 'zh-CN', { numeric: true })
      return sortDescending ? -order : order
    })
  }, [details, rowQuery, sortField, sortDescending])

  const toggleSort = (field: string) => {
    if (sortField === field) setSortDescending(value => !value)
    else {
      setSortField(field)
      setSortDescending(false)
    }
  }

  return <section className="gh-data-workbench" aria-label="Data and Layer workbench">
    <header>
      <span><b>{layer.name}</b><small>{layer.id} · {layer.source} · {layer.geometry}</small></span>
      <button type="button" aria-label="关闭数据工作台" onClick={onClose}>×</button>
    </header>
    <div className="gh-data-toolbar">
      <label>图层名称<input value={name} maxLength={120} disabled={actionBusy} onChange={event => setName(event.currentTarget.value)} /></label>
      <button type="button" disabled={actionBusy || name.trim() === layer.name} onClick={() => { void rename() }}>重命名</button>
      <button type="button" className={removeArmed ? 'is-armed' : ''} disabled={actionBusy} onClick={() => { void remove() }}>{removeArmed ? '确认移除' : '移除图层'}</button>
      <span>{layer.featureCount} features · {layer.crs}</span>
    </div>
    {(error ?? actionError) !== null && <div className="gh-data-error" role="alert">
      <span>{error ?? actionError}</span>
      {error !== null && <button type="button" onClick={onReload}>重试</button>}
    </div>}
    {loading && <div className="gh-data-loading"><i /> 正在从 canonical Layer 读取属性与质量信息…</div>}
    {details !== null && <>
      <div className="gh-data-summary">
        <span><small>Fields</small><b>{details.preview.total_fields}</b></span>
        <span><small>Rows</small><b>{details.preview.total_rows}</b></span>
        <span><small>Invalid geometry</small><b>{details.quality.invalid_geometry_count}</b></span>
        <span><small>Null / empty</small><b>{details.quality.null_geometry_count + details.quality.empty_geometry_count}</b></span>
        <span><small>CRS</small><b>{details.quality.missing_crs ? 'Missing' : details.metadata.crs}</b></span>
      </div>
      {details.warnings.length > 0 && <div className="gh-data-warnings">
        {details.warnings.map(warning => <small key={warning}>⚠ {warning}</small>)}
      </div>}
      <div className="gh-data-fields" aria-label="Layer fields">
        {details.fields.map(field => <span key={field.name}><b>{field.name}</b><small>{field.type} · {field.null_count} null</small></span>)}
      </div>
      <div className="gh-table-controls">
        <label>
          <span aria-hidden="true">⌕</span>
          <input value={rowQuery} onChange={event => setRowQuery(event.currentTarget.value)} placeholder="筛选当前 100 行属性…" aria-label="筛选属性表" />
          {rowQuery !== '' && <button type="button" onClick={() => setRowQuery('')} aria-label="清除属性筛选">×</button>}
        </label>
        <small>{visibleRows.length} / {details.preview.returned_rows} preview rows</small>
      </div>
      <div className="gh-attribute-table-wrap">
        <table className="gh-attribute-table">
          <thead><tr><th>#</th>{details.fields.map(field => <th key={field.name}><button type="button" onClick={() => toggleSort(field.name)}>
            {field.name}<i>{sortField === field.name ? sortDescending ? '↓' : '↑' : '↕'}</i>
          </button></th>)}</tr></thead>
          <tbody>{visibleRows.map(row => {
            const rowIndex = row.__row_index
            const selected = rowIndex === selectedFeatureIndex
            return <tr
              key={rowIndex}
              ref={selected ? selectedRow : undefined}
              className={selected ? 'is-selected' : ''}
              tabIndex={0}
              onClick={() => onSelectRow(rowIndex)}
              onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') onSelectRow(rowIndex) }}
            ><td>{rowIndex + 1}</td>{details.fields.map(field => <td title={attributeValue(row[field.name])} key={field.name}>{attributeValue(row[field.name])}</td>)}</tr>
          })}</tbody>
        </table>
      </div>
      <footer>
        <span>显示前 {details.preview.returned_rows} / {details.preview.total_rows} 行</span>
        {selectedFeatureIndex !== null && selectedFeatureIndex >= details.preview.returned_rows
          ? <span>地图所选要素位于前 100 行之外</span>
          : <span>点击表格行可在地图中高亮对应要素</span>}
      </footer>
    </>}
  </section>
}

function ResultCenterPanel({
  result,
  downloading,
  error,
  onDownload,
  onLayer,
  onLayerFocus,
  focusedLayerId,
}: {
  result: ResultCenter | null
  downloading: string | null
  error: string | null
  onDownload: (asset: ResultAsset) => void
  onLayer: (layerId: string) => void
  onLayerFocus: (layerId: string | null) => void
  focusedLayerId: string | null
}) {
  if (result === null) return <section className="gh-agent-block gh-result-center" aria-label="Result Center">
    <span className="gh-eyebrow">RESULT CENTER</span>
    <p className="gh-result-empty">真实 Tool 完成后，这里会展示可核查结果、统计和下载资产。</p>
  </section>
  const featureFlow = buildFeatureFlow(result.input_layers, result.output_layers)
  return <section className={`gh-agent-block gh-result-center is-${result.status}`} aria-label="Result Center">
    <header>
      <span><span className="gh-eyebrow">RESULT CENTER · TURN {result.turn}</span><small>{result.provider ?? 'provider'} / {result.model ?? 'model'}</small></span>
      <b>{result.status}</b>
    </header>
    {result.final_answer !== null && <p className="gh-result-answer">{result.final_answer}</p>}
    <div className="gh-result-metrics">
      <span><small>Tools</small><b>{result.tools.success}/{result.tools.total}</b></span>
      <span><small>Inputs</small><b>{result.input_layers.length}</b></span>
      <span><small>Outputs</small><b>{result.output_layers.length}</b></span>
      <span><small>Assets</small><b>{result.assets.length}</b></span>
    </div>
    {featureFlow.items.length > 1 && <div className="gh-result-flow" aria-label="Layer feature-count flow">
      <span className="gh-result-section-label">Registered layer feature flow</span>
      {featureFlow.omitted > 0 && <small>为保持可读性省略 {featureFlow.omitted} 个较早的中间图层</small>}
      <div>{featureFlow.items.map(item => <button
        type="button"
        key={`${item.role}:${item.layer_id}`}
        className={focusedLayerId === item.layer_id ? 'is-focused' : ''}
        onFocus={() => onLayerFocus(item.layer_id)}
        onMouseEnter={() => onLayerFocus(item.layer_id)}
        onMouseLeave={() => onLayerFocus(null)}
        onClick={() => onLayer(item.layer_id)}
      >
        <span><b>{item.name}</b><small>{item.role}</small><em>{item.feature_count.toLocaleString()}</em></span>
        <i><span style={{ width: `${item.width}%` }} /></i>
      </button>)}</div>
    </div>}
    {(result.input_layers.length > 0 || result.output_layers.length > 0) && <div className="gh-result-layers">
      {[...result.input_layers, ...result.output_layers].map(layer => <button
        type="button"
        className={focusedLayerId === layer.layer_id ? 'is-focused' : ''}
        key={`${layer.role}:${layer.layer_id}`}
        onFocus={() => onLayerFocus(layer.layer_id)}
        onMouseEnter={() => onLayerFocus(layer.layer_id)}
        onMouseLeave={() => onLayerFocus(null)}
        onClick={() => onLayer(layer.layer_id)}
      >
        <i>{layer.role === 'output' ? '↗' : '→'}</i><span><b>{layer.name}</b><small>{layer.role} · {layer.feature_count} features · {layer.crs}</small></span>
      </button>)}
    </div>}
    {result.statistics.length > 0 && <div className="gh-result-statistics">
      <span className="gh-result-section-label">Verified Tool statistics</span>
      {result.statistics.map(statistic => {
        const chartRows = buildNumericStatistics(statistic.data)
        return <details key={statistic.call_id} open={result.statistics.length === 1}>
          <summary>{statistic.tool} · {statistic.summary ?? 'structured result'}</summary>
          {chartRows.length > 1 && <div className="gh-stat-chart" aria-label={`${statistic.tool} numeric statistics`}>
            {chartRows.map(row => <span key={row.path} title={`${row.path}: ${row.value}`}>
              <small>{row.path}</small><i><span style={{ width: `${row.width}%` }} /></i><b>{Number(row.value.toPrecision(6)).toLocaleString()}</b>
            </span>)}
          </div>}
          <dl>{flattenResultData(statistic.data).map(([key, value]) => <React.Fragment key={key}><dt>{key}</dt><dd title={value}>{value}</dd></React.Fragment>)}</dl>
        </details>
      })}
    </div>}
    <div className="gh-result-provenance">
      <span><small>CRS</small><b>{result.crs.join(' · ') || '—'}</b></span>
      <span><small>Units</small><b>{result.units.join(' · ') || '—'}</b></span>
      {result.sources.map(source => <span key={source.layer_id}><small>{source.kind} · {source.name}</small><b>{source.detail}</b></span>)}
    </div>
    {result.warnings.length > 0 && <div className="gh-result-warnings">{result.warnings.map(warning => <small key={warning}>⚠ {warning}</small>)}</div>}
    <div className="gh-result-assets">
      <span className="gh-result-section-label">Downloads</span>
      {result.assets.map(asset => <button type="button" key={`${asset.asset_type}:${asset.asset_id}`} disabled={!asset.downloadable || downloading === asset.asset_id} onClick={() => onDownload(asset)}>
        <span><b>{asset.file_name}</b><small>{asset.format.toUpperCase()} · {fileSizeLabel(asset.size_bytes)}{asset.feature_count === null ? '' : ` · ${asset.feature_count} features`}</small></span>
        <i>{!asset.downloadable ? 'limit' : downloading === asset.asset_id ? '…' : '↓'}</i>
      </button>)}
    </div>
    {error !== null && <p className="gh-result-download-error" role="alert">{error}</p>}
  </section>
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
  const [focusedLayerId, setFocusedLayerId] = React.useState<string | null>(null)
  const [presentationMode, setPresentationMode] = React.useState(false)
  const [runHistoryCount, setRunHistoryCount] = React.useState(0)
  const [taskSteps, setTaskSteps] = React.useState<AgentToolStep[]>([])
  const [agentStream, setAgentStream] = React.useState<AgentStreamItem[]>([])
  const [agentAnswer, setAgentAnswer] = React.useState('')
  const [workspaceStatus, setWorkspaceStatus] = React.useState('awaiting Agent')
  const [workspaceReady, setWorkspaceReady] = React.useState(false)
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
  const [inspectedLayerId, setInspectedLayerId] = React.useState<string | null>(null)
  const [layerDetails, setLayerDetails] = React.useState<LayerDetails | null>(null)
  const [layerDetailsLoading, setLayerDetailsLoading] = React.useState(false)
  const [layerDetailsError, setLayerDetailsError] = React.useState<string | null>(null)
  const [runManifests, setRunManifests] = React.useState<AgentRunManifest[]>([])
  const [resultCenter, setResultCenter] = React.useState<ResultCenter | null>(null)
  const [imageryInspection, setImageryInspection] = React.useState<ImageryInspection | null>(null)
  const [imageryTarget, setImageryTarget] = React.useState<ImageryTarget | null>(null)
  const [downloadingAsset, setDownloadingAsset] = React.useState<string | null>(null)
  const [downloadError, setDownloadError] = React.useState<string | null>(null)
  const fileInput = React.useRef<HTMLInputElement | null>(null)
  const shell = React.useRef<HTMLElement | null>(null)
  const detailsRequest = React.useRef(0)
  const activeGoalSeq = React.useRef<number | null>(null)
  const lastAutoStepId = React.useRef<string | null>(null)
  const lastRunStatus = React.useRef<'ready' | 'running' | 'success' | 'failed'>('ready')
  const lastWorkspaceSeq = React.useRef<number | null>(null)
  const lastWorkspaceSession = React.useRef<string | null>(null)
  const bootstrapSession = React.useRef<string | null>(null)
  const lastRunManifestKey = React.useRef<string | null>(null)
  const agentScroll = React.useRef<HTMLDivElement | null>(null)
  const followAgentStream = React.useRef(true)
  const layerState = useLayerWorkspace()
  const layers = layerState.sessionId === sessionId ? layerState.layers : []

  React.useEffect(() => {
    activeGoalSeq.current = null
    lastAutoStepId.current = null
    lastRunStatus.current = 'ready'
    lastWorkspaceSeq.current = null
    lastWorkspaceSession.current = null
    bootstrapSession.current = null
    setLayerPanelOpen(false)
    setWorkspaceReady(false)
    setImportDraft(null)
    setImportPhase('idle')
    setImportProgress(0)
    setImportMessage('')
    setImportWarnings([])
    setInspectedLayerId(null)
    setLayerDetails(null)
    setLayerDetailsError(null)
    setFocusedLayerId(null)
    setRunManifests([])
    setResultCenter(null)
    setImageryInspection(null)
    setImageryTarget(null)
    setDownloadingAsset(null)
    setDownloadError(null)
    lastRunManifestKey.current = null
  }, [sessionId])

  React.useEffect(() => {
    const exit = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setPresentationMode(false)
    }
    document.addEventListener('keydown', exit)
    return () => document.removeEventListener('keydown', exit)
  }, [])

  // Hydrate canonical state independently from Session history. Workspace is
  // restored first so a completed conversation does not wait behind Result or
  // import-capability reads after a service restart.
  React.useEffect(() => {
    let disposed = false
    bootstrapSession.current = sessionId
    layerWorkspace.activate(sessionId)
    setWorkspaceStatus('restoring canonical workspace…')
    const hydrate = async () => {
      try {
        const workspace = await agent.workspace()
        if (disposed) return
        if (workspace.status !== 'ready') throw new Error(workspace.issues.join('; ') || 'Agent workspace verification failed')
        layerWorkspace.project(sessionId, workspace.layers, workspace.preferences ?? {})
        lastWorkspaceSession.current = sessionId
        setWorkspaceStatus(`${workspace.layers.length} verified layers`)
      } catch (error) {
        if (!disposed) setWorkspaceStatus(error instanceof Error ? error.message : String(error))
      } finally {
        if (!disposed) setWorkspaceReady(true)
      }
      const [capabilities, runs, inspection] = await Promise.all([
        agent.importCapabilities().catch(() => null),
        agent.runs().catch(() => [] as AgentRunManifest[]),
        agent.imageryInspection().catch(() => null),
      ])
      if (disposed) return
      if (capabilities !== null) setImportCapabilities(capabilities)
      setRunManifests(runs)
      setImageryInspection(inspection)
      const latest = runs.at(-1)
      if (latest !== undefined) {
        try {
          const result = await agent.result(latest.run_id)
          if (!disposed) setResultCenter(result)
        } catch {
          // A just-written Run projection is retried by the regular poll.
        }
      }
      if (bootstrapSession.current === sessionId) bootstrapSession.current = null
    }
    void hydrate()
    return () => {
      disposed = true
      if (bootstrapSession.current === sessionId) bootstrapSession.current = null
    }
  }, [agent, sessionId])

  const streamRevision = agentStream.map(item => `${item.id}:${item.status}:${item.text.length}`).join('|')
  React.useEffect(() => {
    const panel = agentScroll.current
    if (panel === null) return
    if (runStatus === 'ready') {
      panel.scrollTop = 0
      followAgentStream.current = true
    } else if (followAgentStream.current) {
      const stream = panel.querySelector<HTMLElement>('.gh-agent-result')
      if (stream) panel.scrollTop = Math.max(0, stream.offsetTop + stream.offsetHeight - panel.clientHeight - panel.offsetTop + 12)
    }
  }, [runStatus, streamRevision, taskSteps.length])

  React.useEffect(() => {
    const root = shell.current?.closest<HTMLElement>('[data-conversation-scroll]')
    if (!root) return
    let frame = 0
    const update = () => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => {
        const seat = root.querySelector<HTMLElement>('[data-composer-seat]')
        const height = Math.ceil(seat?.getBoundingClientRect().height ?? 190)
        root.style.setProperty('--gh-composer-reserve', `${height + 30}px`)
        const width = root.clientWidth
        root.style.setProperty('--gh-agent-column-width', `${width <= 760 ? width - 24 : Math.min(480, Math.max(320, Math.round(width * .32)))}px`)
      })
    }
    const resize = new ResizeObserver(update)
    resize.observe(root)
    const seat = root.querySelector<HTMLElement>('[data-composer-seat]')
    if (seat) resize.observe(seat)
    const mutations = new MutationObserver(() => {
      const currentSeat = root.querySelector<HTMLElement>('[data-composer-seat]')
      if (currentSeat) resize.observe(currentSeat)
      update()
    })
    mutations.observe(root, { childList: true, subtree: true })
    update()
    return () => { resize.disconnect(); mutations.disconnect(); cancelAnimationFrame(frame); root.style.removeProperty('--gh-composer-reserve'); root.style.removeProperty('--gh-agent-column-width') }
  }, [sessionId])

  React.useEffect(() => {
    layerWorkspace.activate(sessionId)
    let disposed = false
    let resourcesBusy = false
    let timer: ReturnType<typeof setTimeout> | undefined
    const refresh = async () => {
      try {
        const history = await agent.history()
        if (disposed) return
        const humanGoal = latestHumanGoal(history.events)
        let workspaceSeq = -1
        let runManifestKey = 'empty'
        let hasRunningTools = false
        setRunHistoryCount(humanGoalCount(history.events))
        if (humanGoal === null) {
          setRunStatus('ready')
          setRunError(null)
          setTaskSteps([])
          setAgentStream([])
          setAgentAnswer('')
          setResultCenter(null)
          lastRunStatus.current = 'ready'
        } else {
          const changedGoal = activeGoalSeq.current !== humanGoal.seq
          if (changedGoal) {
            activeGoalSeq.current = humanGoal.seq
            lastAutoStepId.current = null
            setSelectedStepId(null)
            setResultCenter(null)
            setImageryTarget(null)
          }
          setGoal(humanGoal.text)
          const projection = projectAgentHistory(history.events, humanGoal.seq)
          hasRunningTools = projection.steps.some(step => step.status === 'running')
          workspaceSeq = projection.maxSeq
          runManifestKey = `${humanGoal.seq}:${projection.steps.map(step => `${step.id}:${step.status}`).join('|')}:${projection.finished}`
          const status = projection.finished ? (projection.succeeded ? 'success' : 'failed') : 'running'
          setTaskSteps(projection.steps)
          setAgentStream(projection.stream)
          setAgentAnswer(projection.answer)
          setRunStatus(status)
          setRunError(projection.error)
          const imageryStep = [...projection.steps].reverse().find(step => step.name === 'inspect_satellite_view')
          if (imageryStep?.status === 'running') {
            const target = await agent.imageryTarget().catch(() => null)
            const expectedStepId = typeof imageryStep.arguments.step_id === 'string'
              ? imageryStep.arguments.step_id
              : imageryStep.id
            if (!disposed && target !== null && target.step_id === expectedStepId) {
              setImageryTarget(target)
              setWorkspaceStatus(target.message)
            }
          } else if (imageryStep?.status === 'failed') {
            const target = await agent.imageryTarget().catch(() => null)
            const expectedStepId = typeof imageryStep.arguments.step_id === 'string'
              ? imageryStep.arguments.step_id
              : imageryStep.id
            if (!disposed && target !== null && target.step_id === expectedStepId) setImageryTarget({
              ...target,
              status: 'failed',
              phase: 'failed',
              message: imageryStep.summary ?? '影像巡检未完成',
              error: imageryStep.summary ?? target.error,
            })
          }
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
        // Canonical result/workspace reads can queue behind a long-running Tool.
        // Never await those reads in the native history + progress polling loop.
        const refreshResources = async () => {
        if (bootstrapSession.current !== sessionId && lastRunManifestKey.current !== runManifestKey) {
          try {
            const runs = await agent.runs()
            if (disposed) return
            setRunManifests(runs)
            const current = runs.find(run => run.user_event_seq === humanGoal?.seq)
            let resultReady = humanGoal === null
            if (current !== undefined) {
              try {
                const result = await agent.result(current.run_id)
                if (!disposed) setResultCenter(result)
                resultReady = true
              } catch {
                // The next polling cycle retries while the canonical result projection catches up.
              }
            }
            const inspection = await agent.imageryInspection().catch(() => null)
            if (!disposed && inspection !== null) {
              setImageryInspection(inspection)
              const target = await agent.imageryTarget().catch(() => null)
              if (!disposed && target !== null) setImageryTarget(target)
            }
            if (resultReady && (humanGoal === null || (current !== undefined
              && (current.max_event_seq === workspaceSeq || current.status !== 'running')))) {
              lastRunManifestKey.current = runManifestKey
            }
          } catch {
            // Native stream remains usable while a just-appended Run projection catches up.
          }
        }
        if (bootstrapSession.current === sessionId) {
          lastWorkspaceSeq.current = workspaceSeq
        } else if (lastWorkspaceSession.current !== sessionId
          || (lastWorkspaceSeq.current !== null && lastWorkspaceSeq.current !== workspaceSeq)) {
          try {
            const workspace = await agent.workspace()
            if (disposed) return
            if (workspace.status !== 'ready') throw new Error(workspace.issues.join('; ') || 'Agent workspace verification failed')
            layerWorkspace.project(sessionId, workspace.layers, workspace.preferences ?? {})
            lastWorkspaceSeq.current = workspaceSeq
            lastWorkspaceSession.current = sessionId
            setWorkspaceStatus(`${workspace.layers.length} verified layers`)
          } catch (error) {
            if (!disposed) setWorkspaceStatus(error instanceof Error ? error.message : String(error))
          }
        } else if (lastWorkspaceSeq.current === null) {
          lastWorkspaceSeq.current = workspaceSeq
        }
        }
        if (!hasRunningTools && !resourcesBusy) {
          resourcesBusy = true
          void refreshResources().catch(() => {}).finally(() => { resourcesBusy = false })
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
  if (focusedLayerId !== null && layers.some(layer => layer.id === focusedLayerId)) highlightedLayerIds.add(focusedLayerId)
  const highlightedLayerKey = [...highlightedLayerIds].sort().join('\n')
  React.useEffect(() => {
    layerWorkspace.highlight(sessionId, highlightedLayerIds)
  }, [sessionId, highlightedLayerKey])
  const successfulSteps = taskSteps.filter(step => step.status === 'success')
  const failedSteps = taskSteps.filter(step => step.status === 'failed')
  const layerStatuses = Object.fromEntries(layers.flatMap(layer => {
    const step = taskSteps.find(candidate => candidate.id === layer.generatedBy
      || (typeof candidate.arguments.step_id === 'string' && candidate.arguments.step_id === layer.generatedBy))
    return step === undefined ? [] : [[layer.id, step.status]]
  })) as Record<string, AgentToolStep['status']>
  const progress = taskSteps.length === 0
    ? 0
    : Math.round((successfulSteps.length + failedSteps.length) / taskSteps.length * 100)
  const liveStep = taskSteps.find(step => step.status === 'running') ?? selectedStep ?? taskSteps.at(-1)
  const importBusy = importPhase === 'reading' || importPhase === 'uploading'
  const inspectedLayer = inspectedLayerId === null ? null : layers.find(layer => layer.id === inspectedLayerId) ?? null
  const recentRunManifests = runManifests.slice(-3).reverse()
  const syncImageryView = React.useCallback(async (view: ImageryView) => {
    try {
      await agent.saveImageryView(view)
      setWorkspaceStatus('satellite view ready for local Agent inspection')
    } catch (error) {
      setWorkspaceStatus(error instanceof Error ? error.message : String(error))
      throw error
    }
  }, [agent])
  const persistImageryPreference = React.useCallback((preference: Partial<Pick<RasterOverlayLayer, 'visible' | 'opacity'>>) => {
    const current = imageryInspection
    if (current === null) return
    setImageryInspection({
      ...current,
      overlay_layer: { ...current.overlay_layer, ...preference },
    })
    void agent.setImageryPreference(current.inspection_id, preference).catch(error => {
      setImageryInspection(value => value?.inspection_id === current.inspection_id ? current : value)
      setWorkspaceStatus(error instanceof Error ? error.message : String(error))
    })
  }, [agent, imageryInspection])

  React.useEffect(() => {
    if (inspectedLayerId !== null && inspectedLayer === null) {
      setInspectedLayerId(null)
      setLayerDetails(null)
      setLayerDetailsError(null)
    }
  }, [inspectedLayerId, inspectedLayer])

  const loadLayerDetails = async (layerId: string) => {
    const request = ++detailsRequest.current
    setInspectedLayerId(layerId)
    setLayerDetails(null)
    setLayerDetailsLoading(true)
    setLayerDetailsError(null)
    try {
      const value = await agent.layerDetails(layerId)
      if (detailsRequest.current === request) setLayerDetails(value)
    } catch (reason) {
      if (detailsRequest.current === request) {
        setLayerDetails(null)
        setLayerDetailsError(reason instanceof Error ? reason.message : String(reason))
      }
    } finally {
      if (detailsRequest.current === request) setLayerDetailsLoading(false)
    }
  }

  const focusLayer = (layerId: string, inspect: boolean) => {
    setFocusedLayerId(layerId)
    const layer = layers.find(candidate => candidate.id === layerId)
    const step = layer === undefined ? undefined : taskSteps.find(candidate => candidate.id === layer.generatedBy
      || (typeof candidate.arguments.step_id === 'string' && candidate.arguments.step_id === layer.generatedBy))
    if (step !== undefined) setSelectedStepId(step.id)
    if (inspect) {
      setLayerPanelOpen(false)
      void loadLayerDetails(layerId)
    }
  }

  const togglePresentationMode = async () => {
    // Keep the native composer and its model popovers in the same document.
    // Browser fullscreen can silently exit on input focus in embedded browsers.
    setPresentationMode(current => !current)
  }

  const refreshCanonicalWorkspace = async () => {
    const workspace = await agent.workspace()
    if (workspace.status !== 'ready') throw new Error(workspace.issues.join('; ') || 'Agent workspace verification failed')
    layerWorkspace.project(sessionId, workspace.layers, workspace.preferences ?? {})
    lastWorkspaceSeq.current = null
    setWorkspaceStatus(`${workspace.layers.length} verified layers`)
    return workspace
  }

  const persistLayerPreference = (layerId: string, preference: Partial<LayerDisplayPreference>) => {
    void agent.setLayerPreference(layerId, preference).catch(reason => {
      setWorkspaceStatus(reason instanceof Error ? reason.message : String(reason))
    })
  }

  const renameInspectedLayer = async (name: string) => {
    if (inspectedLayerId === null) return
    await agent.renameLayer(inspectedLayerId, name)
    await refreshCanonicalWorkspace()
    setSelectedFeature(null)
    await loadLayerDetails(inspectedLayerId)
  }

  const removeInspectedLayer = async () => {
    if (inspectedLayerId === null) return
    await agent.removeLayer(inspectedLayerId)
    await refreshCanonicalWorkspace()
    setSelectedFeature(null)
    setInspectedLayerId(null)
    setLayerDetails(null)
  }

  const selectImportFile = async (file: File) => {
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
    let preview: CsvPreview | null = null
    if (extension === '.csv') {
      try {
        preview = parseCsvPreview(await file.slice(0, 128 * 1024).text())
      } catch {
        // The canonical importer will report a bounded parse error if local preview fails.
      }
    }
    setImportDraft({
      file,
      extension,
      name: file.name.replace(/\.(?:geojson|json|zip|gpkg|csv)$/iu, ''),
      sourceLayer: '',
      longitudeField: extension === '.csv' ? suggestCoordinateField(preview?.fields ?? [], 'longitude') || 'longitude' : '',
      latitudeField: extension === '.csv' ? suggestCoordinateField(preview?.fields ?? [], 'latitude') || 'latitude' : '',
      crs: extension === '.csv' ? 'EPSG:4326' : '',
      preview,
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
      if (draft.name.trim() === '') throw new Error('请填写图层名称。')
      if (draft.extension === '.csv' && (draft.longitudeField.trim() === '' || draft.latitudeField.trim() === '')) {
        throw new Error('CSV 必须选择经度和纬度字段。')
      }
      if (draft.extension === '.csv' && draft.longitudeField === draft.latitudeField) {
        throw new Error('经度和纬度不能使用同一个字段。')
      }
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
      await refreshCanonicalWorkspace()
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

  const downloadResult = async (asset: ResultAsset) => {
    if (!asset.downloadable || downloadingAsset !== null) return
    setDownloadingAsset(asset.asset_id)
    setDownloadError(null)
    try {
      const download = await agent.download(asset.asset_type, asset.asset_id)
      saveResultDownload(download)
    } catch (error) {
      setDownloadError(error instanceof Error ? error.message : String(error))
    } finally {
      setDownloadingAsset(null)
    }
  }

  const downloadDiagnostics = async () => {
    if (downloadingAsset !== null) return
    setDownloadingAsset('diagnostic')
    setDownloadError(null)
    try {
      saveResultDownload(await agent.diagnostics())
    } catch (error) {
      setDownloadError(error instanceof Error ? error.message : String(error))
    } finally {
      setDownloadingAsset(null)
    }
  }

  const stepIcon = (status: AgentToolStep['status'], index: number) => {
    if (status === 'success') return '✓'
    if (status === 'failed') return '!'
    if (status === 'running') return '…'
    return String(index + 1)
  }

  return (
    <main ref={shell} className={`gh-shell${presentationMode ? ' is-presentation' : ''}`} data-geoharness-plugin="loaded" data-geoharness-session={sessionId} data-geoharness-phase="10" data-geoharness-agent="native" data-conversation-composer-overlay="">
      <header className="gh-topbar">
        <div className="gh-brand">
          <BrandMark />
          <span><strong>GeoHarness</strong><small>空间分析，由对话开始</small></span>
        </div>
        <div className="gh-launcher">
          {importPhase !== 'idle' && <span className={`gh-import-summary is-${importPhase}`}>{importPhase === 'success' ? '✓' : importBusy ? '…' : '!'} {importMessage}</span>}
          <span className={`gh-status is-${runStatus}`}><i /> {runStatus === 'running' ? `Agent 正在执行 · ${progress}%` : runStatus === 'failed' ? 'Agent 执行失败' : runStatus === 'success' ? 'Agent 运行完成' : 'Native Harness Agent'} · {layers.length + (imageryInspection === null ? 0 : 1)} layers · {featureCount} features</span>
          <button type="button" className="gh-presentation-button" onClick={() => {
            void togglePresentationMode().catch(reason => setWorkspaceStatus(reason instanceof Error ? reason.message : String(reason)))
          }}><span aria-hidden="true">{presentationMode ? '↙' : '↗'}</span> {presentationMode ? '退出演示' : '演示模式'}</button>
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
              if (file !== undefined) void selectImportFile(file)
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
            <label>经度字段{importDraft.preview === null
              ? <input disabled={importBusy || importPhase === 'success'} value={importDraft.longitudeField} maxLength={120} onChange={event => setImportDraft({ ...importDraft, longitudeField: event.currentTarget.value })} />
              : <select disabled={importBusy || importPhase === 'success'} value={importDraft.longitudeField} onChange={event => setImportDraft({ ...importDraft, longitudeField: event.currentTarget.value })}>
                  <option value="">请选择字段</option>{importDraft.preview.fields.map(field => <option key={field} value={field}>{field}</option>)}
                </select>}</label>
            <label>纬度字段{importDraft.preview === null
              ? <input disabled={importBusy || importPhase === 'success'} value={importDraft.latitudeField} maxLength={120} onChange={event => setImportDraft({ ...importDraft, latitudeField: event.currentTarget.value })} />
              : <select disabled={importBusy || importPhase === 'success'} value={importDraft.latitudeField} onChange={event => setImportDraft({ ...importDraft, latitudeField: event.currentTarget.value })}>
                  <option value="">请选择字段</option>{importDraft.preview.fields.map(field => <option key={field} value={field}>{field}</option>)}
                </select>}</label>
            <label>源 CRS<input disabled={importBusy || importPhase === 'success'} value={importDraft.crs} maxLength={80} onChange={event => setImportDraft({ ...importDraft, crs: event.currentTarget.value })} /></label>
          </div>}
          {importDraft.preview !== null && <div className="gh-import-preview">
            <header><span>字段预览</span><small>{importDraft.preview.fields.length} fields · {importDraft.preview.delimiter === '\t' ? 'TAB' : importDraft.preview.delimiter} delimiter</small></header>
            <div><table><thead><tr>{importDraft.preview.fields.map(field => <th key={field}>{field}</th>)}</tr></thead>
              <tbody>{importDraft.preview.rows.slice(0, 5).map((row, rowIndex) => <tr key={rowIndex}>{importDraft.preview?.fields.map((field, index) => <td key={field}>{row[index] ?? ''}</td>)}</tr>)}</tbody>
            </table></div>
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
            sessionId={sessionId}
            presentationMode={presentationMode}
            layers={layers}
            workspaceReady={workspaceReady}
            selected={selectedFeature}
            highlightedLayerIds={highlightedLayerIds}
            runStatus={runStatus}
            inspection={imageryInspection}
            imageryTarget={imageryTarget}
            onViewChange={syncImageryView}
            onSelect={value => {
              setSelectedFeature(value)
              if (value !== null) focusLayer(value.layer.id, true)
              else setFocusedLayerId(null)
            }}
          />
          <div className={`gh-execution-strip is-${runStatus}`} aria-live="polite">
            <i aria-hidden="true" />
            <span><b>{runStatus === 'ready' ? '等待空间分析目标' : runStatus === 'running' ? 'Agent 正在执行真实 GIS Tool' : runStatus === 'success' ? '分析完成，结果已核查' : '运行中断，请查看错误'}</b>
              <small>{liveStep?.title ?? 'Native Harness Session 与 Workspace 已连接'}</small></span>
            <em><span><i style={{ width: `${progress}%` }} /></span><b>{successfulSteps.length}/{taskSteps.length || 0}</b></em>
          </div>
          <button
            type="button"
            className="gh-map-layers-toggle"
            aria-expanded={layerPanelOpen}
            aria-controls="geoharness-layer-panel"
            onClick={() => setLayerPanelOpen(open => !open)}
          >
            <span aria-hidden="true">▱</span> Layers <small>{layers.length + (imageryInspection === null ? 0 : 1)}</small>
          </button>
          {layerPanelOpen && <div className="gh-map-layer-drawer" id="geoharness-layer-panel">
            <GeoHarnessLayerPanel
              onClose={() => setLayerPanelOpen(false)}
              selectedLayerId={inspectedLayerId}
              onInspect={layerId => focusLayer(layerId, true)}
              onPreference={persistLayerPreference}
              inspection={imageryInspection}
              onImageryPreference={persistImageryPreference}
              layerStatuses={layerStatuses}
              statisticsCount={resultCenter?.statistics.length ?? 0}
            />
          </div>}
          {inspectedLayer !== null && <GeoHarnessDataWorkbench
            layer={inspectedLayer}
            details={layerDetails}
            loading={layerDetailsLoading}
            error={layerDetailsError}
            selectedFeatureIndex={selectedFeature?.layer.id === inspectedLayer.id ? selectedFeature.featureIndex : null}
            onClose={() => { setInspectedLayerId(null); setLayerDetails(null); setLayerDetailsError(null); setFocusedLayerId(null) }}
            onSelectRow={index => {
              const feature = inspectedLayer.data.features[index]
              if (feature !== undefined) setSelectedFeature({ layer: inspectedLayer, feature, featureIndex: index })
            }}
            onReload={() => { void loadLayerDetails(inspectedLayer.id) }}
            onRename={renameInspectedLayer}
            onRemove={removeInspectedLayer}
          />}
        </section>

        <aside className="gh-panel gh-agent" aria-label="Agent workspace">
          <div className="gh-panel-heading">
            <span><b>Agent Workspace</b><small>实时执行 · 分析与结果</small></span>
            <span className={`gh-agent-state is-${runStatus}`}>{runStatus}</span>
          </div>
          <div className="gh-agent-scroll" ref={agentScroll} onScroll={event => {
            const panel = event.currentTarget
            const stream = panel.querySelector<HTMLElement>('.gh-agent-result')
            const end = stream ? stream.offsetTop + stream.offsetHeight - panel.offsetTop : panel.scrollHeight
            followAgentStream.current = end - panel.scrollTop - panel.clientHeight < 80
          }}>
            <section className="gh-agent-block gh-goal">
              <span className="gh-eyebrow">当前任务</span>
              <p>{goal}</p>
            </section>
            <section className="gh-agent-block gh-tool-trace">
              <span className="gh-eyebrow">执行步骤 <small>{successfulSteps.length} / {taskSteps.length}</small></span>
              {taskSteps.length === 0 && <p className="gh-result-empty">{runStatus === 'running' ? 'Agent 正在理解需求，准备分析工具…' : '输入地点或分析需求，Agent 将逐步展示执行过程。'}</p>}
              <ol className="gh-plan-list" data-task-graph="agent-generated">
                {taskSteps.map((step, index) => <li
                  className={`is-${step.status}${selectedStepId === step.id ? ' is-selected' : ''}`}
                  data-step-id={step.id}
                  data-step-status={step.status}
                  key={step.id}
                >
                  <button type="button" className="gh-step-button" onClick={() => { setFocusedLayerId(null); setSelectedStepId(step.id) }}>
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
            {runError !== null && <p className="gh-run-error" role="alert">{runError}</p>}
            <details className="gh-agent-block gh-current-step">
              <summary className="gh-eyebrow">运行信息与诊断</summary>
              <div><span>Driver</span><b>Native Harness Agent</b></div>
              <div><span>Model</span><b>原生输入栏可切换</b></div>
              <div><span>Tools</span><b>{successfulSteps.length}/{taskSteps.length} success</b></div>
              <div><span>Outputs</span><b>{derivedLayers.length + (imageryInspection === null ? 0 : 1)} layers</b></div>
              <div><span>Turns</span><b>{runHistoryCount}</b></div>
              <div><span>Session</span><b title={sessionId}>{sessionId.slice(0, 12)}</b></div>
              <div><span>Map</span><b className="is-teal">{workspaceStatus}</b></div>
              <button type="button" className="gh-diagnostics-button" disabled={downloadingAsset !== null} onClick={() => { void downloadDiagnostics() }}>
                {downloadingAsset === 'diagnostic' ? '正在生成诊断…' : '导出结构化诊断'}
              </button>
            </details>
            <details className="gh-agent-disclosure">
              <summary>结果数据与下载</summary>
            <ResultCenterPanel
              result={resultCenter}
              downloading={downloadingAsset}
              error={downloadError}
              onDownload={asset => { void downloadResult(asset) }}
              onLayer={layerId => focusLayer(layerId, true)}
              onLayerFocus={layerId => setFocusedLayerId(layerId)}
              focusedLayerId={focusedLayerId}
            />
            </details>
            <details className="gh-agent-block gh-run-history" aria-label="Agent Run history">
              <summary className="gh-eyebrow">运行历史 · {recentRunManifests.length}</summary>
              {recentRunManifests.length === 0 && <p className="gh-result-empty">Native Session 产生 Tool Call 后，这里会恢复可核查的运行记录。</p>}
              {recentRunManifests.map(run => <article className={`is-${run.status}`} key={run.run_id}>
                <header><b>Turn {run.turn}</b><small>{run.status} · {run.provider ?? 'provider'} / {run.model ?? 'model'}</small></header>
                <p>{run.user_goal}</p>
                <div>
                  <span>Executed <b>{run.tool_calls.length}</b></span>
                  <span>Reused <b>{run.reused_layers.length}</b></span>
                  <span>New outputs <b>{run.output_layers.length}</b></span>
                </div>
                {run.tool_calls.length > 0 && <small>{run.tool_calls.map(call => `${call.name} ${call.status === 'success' ? '✓' : call.status === 'failed' ? '!' : '…'}`).join(' · ')}</small>}
                {run.errors.length > 0 && <small className="is-error">{run.errors.map(error => `${error.classification}: ${error.message}`).join(' · ')}</small>}
              </article>)}
            </details>
            <section className={`gh-agent-block gh-agent-result is-${runStatus}`} aria-label="Agent result">
              <div className="gh-stream-heading">
                <span className="gh-eyebrow">Agent 实时输出</span>
                <small>{runStatus === 'running' ? 'LIVE' : runStatus.toUpperCase()} · {successfulSteps.length}/{taskSteps.length} tools</small>
              </div>
              {agentStream.length === 0
                ? runStatus === 'running'
                  ? <p className="gh-result-empty">已提交给模型，等待首个流式 token…</p>
                  : agentAnswer === ''
                    ? <p className="gh-result-empty">Agent 的完整流式输出会显示在这里。</p>
                    : <MarkdownContent text={agentAnswer} />
                : <div className="gh-stream-list" aria-live="polite">
                    {agentStream.map(item => item.kind === 'retry'
                      ? <div className="gh-stream-retry" data-stream-status={item.status} key={item.id}>↻ {item.text}</div>
                      : item.kind === 'reasoning'
                        ? <details className="gh-stream-reasoning" open={item.status === 'streaming'} key={item.id}>
                            <summary>Reasoning · Turn {item.turn} / Step {item.step}</summary>
                            <MarkdownContent text={item.text} streaming={item.status === 'streaming'} />
                          </details>
                        : <article className="gh-stream-text" data-stream-status={item.status} key={item.id}>
                            <small>Agent · Turn {item.turn} / Step {item.step}</small>
                            <MarkdownContent text={item.text} streaming={item.status === 'streaming'} />
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
        layerDetails: async layerId => {
          const response = await connection.rpc.call('/geoharness', 'layer/details', {
            workspace_key: sessionId,
            layer_id: layerId,
          })
          if (!response.ok || response.value === null || typeof response.value !== 'object') {
            throw new Error(response.error?.message ?? 'Layer details are unavailable')
          }
          return response.value as LayerDetails
        },
        renameLayer: async (layerId, name) => {
          const response = await connection.rpc.call('/geoharness', 'layer/rename', {
            workspace_key: sessionId,
            layer_id: layerId,
            name,
          })
          if (!response.ok) throw new Error(response.error?.message ?? 'Layer rename failed')
        },
        removeLayer: async layerId => {
          const response = await connection.rpc.call('/geoharness', 'layer/remove', {
            workspace_key: sessionId,
            layer_id: layerId,
          })
          if (!response.ok) throw new Error(response.error?.message ?? 'Layer removal failed')
        },
        setLayerPreference: async (layerId, preference) => {
          const response = await connection.rpc.call('/geoharness', 'layer/preference', {
            workspace_key: sessionId,
            layer_id: layerId,
            ...preference,
          })
          if (!response.ok) throw new Error(response.error?.message ?? 'Layer display preference could not be saved')
        },
        runs: async () => {
          const response = await connection.rpc.call('/geoharness', 'agent/runs', {
            workspace_key: sessionId,
          })
          if (!response.ok || !Array.isArray(response.value)) {
            throw new Error(response.error?.message ?? 'Agent Run history is unavailable')
          }
          return response.value as AgentRunManifest[]
        },
        result: async runId => {
          const response = await connection.rpc.call('/geoharness', 'result/center', {
            workspace_key: sessionId,
            run_id: runId,
          })
          if (!response.ok) throw new Error(response.error?.message ?? 'Result Center is unavailable')
          if (response.value === null) return null
          if (typeof response.value !== 'object') throw new Error('Result Center returned an invalid projection')
          return response.value as ResultCenter
        },
        saveImageryView: async view => {
          const response = await connection.rpc.call('/geoharness', 'imagery/view', {
            workspace_key: sessionId,
            bbox: view.bbox,
            zoom: view.zoom,
          })
          if (!response.ok) throw new Error(response.error?.message ?? 'Satellite viewport could not be synchronized')
        },
        imageryInspection: async () => {
          const response = await connection.rpc.call('/geoharness', 'imagery/latest', {
            workspace_key: sessionId,
          })
          if (!response.ok) throw new Error(response.error?.message ?? 'Satellite inspection result is unavailable')
          if (response.value === null) return null
          if (typeof response.value !== 'object') throw new Error('Satellite inspection returned an invalid projection')
          return response.value as ImageryInspection
        },
        imageryTarget: async () => {
          const response = await connection.rpc.call('/geoharness', 'imagery/target', {
            workspace_key: sessionId,
          })
          if (!response.ok) throw new Error(response.error?.message ?? 'Satellite inspection target is unavailable')
          if (response.value === null) return null
          if (typeof response.value !== 'object') throw new Error('Satellite inspection target returned an invalid projection')
          return response.value as ImageryTarget
        },
        setImageryPreference: async (inspectionId, preference) => {
          const response = await connection.rpc.call('/geoharness', 'imagery/preference', {
            workspace_key: sessionId,
            inspection_id: inspectionId,
            ...preference,
          })
          if (!response.ok) throw new Error(response.error?.message ?? 'Imagery Layer display preference could not be saved')
        },
        download: async (assetType, assetId) => {
          const response = await connection.rpc.call('/geoharness', 'result/download', {
            workspace_key: sessionId,
            asset_type: assetType,
            asset_id: assetId,
          })
          if (!response.ok || response.value === null || typeof response.value !== 'object') {
            throw new Error(response.error?.message ?? 'Result asset download failed')
          }
          return response.value as ResultDownload
        },
        diagnostics: async () => {
          const response = await connection.rpc.call('/geoharness', 'diagnostics/export', {
            workspace_key: sessionId,
          })
          if (!response.ok || response.value === null || typeof response.value !== 'object') {
            throw new Error(response.error?.message ?? 'Structured diagnostics export failed')
          }
          return response.value as ResultDownload
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
