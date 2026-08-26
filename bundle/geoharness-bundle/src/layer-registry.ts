export type JsonPrimitive = string | number | boolean | null
export type GeoJsonProperties = Record<string, JsonPrimitive>

export interface GeoJsonGeometry {
  type: string
  coordinates: unknown
}

export interface GeoJsonFeature {
  type: 'Feature'
  id?: string | number
  properties: GeoJsonProperties | null
  geometry: GeoJsonGeometry
}

export interface GeoJsonFeatureCollection {
  type: 'FeatureCollection'
  name?: string
  crs?: { properties?: { name?: string } }
  features: GeoJsonFeature[]
}

export interface EmbeddedScenario {
  manifest: {
    id: string
    title: string
    region: string
    data: string[]
    supports_revision: boolean
    task_graph: string
  }
  prompt: string
  revisionPrompt: string | null
  expectedPlan: Record<string, unknown>
  expectedResult: Record<string, unknown>
  taskGraph: {
    schema_version: string
    scenario_id: string
    goal: string
    steps: Array<{
      id: string
      title: string
      tool: string
      dependencies: string[]
      parameters: Record<string, unknown>
      outputs: string[]
    }>
  }
  data: Record<string, GeoJsonFeatureCollection>
}

export interface LayerStyle {
  color: string
  fillOpacity: number
  lineWidth: number
}

export interface LayerRecord {
  id: string
  name: string
  type: 'vector'
  geometry: string
  crs: string
  featureCount: number
  source: 'scenario' | 'upload' | 'derived'
  scenarioId: string | null
  generatedBy: string | null
  parents: string[]
  parameters: Record<string, unknown> | null
  storagePath: string | null
  createdAt: string
  visible: boolean
  opacity: number
  style: LayerStyle
  data: GeoJsonFeatureCollection
}

const STYLE_BY_NAME: Record<string, LayerStyle> = {
  buildings: { color: '#d76945', fillOpacity: 0.64, lineWidth: 1.2 },
  roads: { color: '#26383d', fillOpacity: 0, lineWidth: 3.2 },
  rivers: { color: '#3b8fa1', fillOpacity: 0.48, lineWidth: 1.6 },
  districts: { color: '#c49a45', fillOpacity: 0.16, lineWidth: 2.2 },
}

const DEFAULT_STYLE: LayerStyle = { color: '#147d78', fillOpacity: 0.5, lineWidth: 1.8 }

function stableLayerId(prefix: string, name: string) {
  return `layer-${prefix}-${name}`.toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/-+/g, '-')
}

function geometrySummary(collection: GeoJsonFeatureCollection) {
  const types = [...new Set(collection.features.map(feature => feature.geometry.type))]
  return types.length === 1 ? types[0] : `Mixed (${types.join(', ')})`
}

function crsName(collection: GeoJsonFeatureCollection) {
  const name = collection.crs?.properties?.name
  if (name === 'urn:ogc:def:crs:OGC:1.3:CRS84') return 'OGC:CRS84'
  return name ?? 'Unknown CRS'
}

function styleForLayer(name: string): LayerStyle {
  return { ...(STYLE_BY_NAME[name.toLowerCase()] ?? DEFAULT_STYLE) }
}

export function isFeatureCollection(value: unknown): value is GeoJsonFeatureCollection {
  if (value === null || typeof value !== 'object') return false
  const candidate = value as Partial<GeoJsonFeatureCollection>
  if (candidate.type !== 'FeatureCollection' || !Array.isArray(candidate.features)) return false
  return candidate.features.every(feature => feature !== null
    && typeof feature === 'object'
    && feature.type === 'Feature'
    && feature.geometry !== null
    && typeof feature.geometry === 'object'
    && typeof feature.geometry.type === 'string'
    && 'coordinates' in feature.geometry)
}

export function registerScenarioLayers(scenario: EmbeddedScenario): LayerRecord[] {
  const timestamp = new Date().toISOString()
  return Object.entries(scenario.data).map(([name, data]) => ({
    id: stableLayerId(scenario.manifest.id, name),
    name,
    type: 'vector',
    geometry: geometrySummary(data),
    crs: crsName(data),
    featureCount: data.features.length,
    source: 'scenario',
    scenarioId: scenario.manifest.id,
    generatedBy: null,
    parents: [],
    parameters: null,
    storagePath: scenario.manifest.data.find(path => path.endsWith(`/${name}.geojson`)) ?? null,
    createdAt: timestamp,
    visible: true,
    opacity: 1,
    style: styleForLayer(name),
    data,
  }))
}

export function registerUploadedLayer(fileName: string, value: unknown): LayerRecord {
  if (!isFeatureCollection(value)) throw new Error('Only valid GeoJSON FeatureCollection files can be registered.')
  const name = value.name?.trim() || fileName.replace(/\.(geo)?json$/i, '') || 'uploaded-layer'
  return {
    id: stableLayerId(`upload-${Date.now()}`, name),
    name,
    type: 'vector',
    geometry: geometrySummary(value),
    crs: crsName(value),
    featureCount: value.features.length,
    source: 'upload',
    scenarioId: null,
    generatedBy: null,
    parents: [],
    parameters: null,
    storagePath: fileName,
    createdAt: new Date().toISOString(),
    visible: true,
    opacity: 1,
    style: styleForLayer(name),
    data: value,
  }
}

export function toggleLayerVisibility(layers: readonly LayerRecord[], layerId: string): LayerRecord[] {
  return layers.map(layer => layer.id === layerId ? { ...layer, visible: !layer.visible } : layer)
}

export function setLayerOpacity(layers: readonly LayerRecord[], layerId: string, opacity: number): LayerRecord[] {
  const normalized = Math.max(0, Math.min(1, opacity))
  return layers.map(layer => layer.id === layerId ? { ...layer, opacity: normalized } : layer)
}
