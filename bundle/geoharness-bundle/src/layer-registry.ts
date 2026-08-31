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
    fixture_profile: string
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

export interface WorkspaceProjectionItem {
  metadata: {
    layer_id: string
    name: string
    geometry: string
    crs: string
    feature_count: number
    source: 'scenario' | 'upload' | 'derived'
    generated_by: string | null
    parents: string[]
    parameters: Record<string, unknown> | null
    storage_path: string
    created_at: string
  }
  geojson: GeoJsonFeatureCollection
}

const STYLE_BY_NAME: Record<string, LayerStyle> = {
  buildings: { color: '#718096', fillOpacity: 0.34, lineWidth: 1.05 },
  roads: { color: '#334155', fillOpacity: 0, lineWidth: 2.8 },
  rivers: { color: '#0284c7', fillOpacity: 0.34, lineWidth: 1.8 },
  districts: { color: '#a16207', fillOpacity: 0.12, lineWidth: 2.1 },
}

const DEFAULT_STYLE: LayerStyle = { color: '#64748b', fillOpacity: 0.42, lineWidth: 1.7 }

const SEMANTIC_STYLES: Array<{ matches: (name: string) => boolean, style: LayerStyle }> = [
  {
    matches: name => /(^|_)(final|intersection|result)(_|$)/.test(name) || /buildings_both/.test(name),
    style: { color: '#e11d48', fillOpacity: 0.9, lineWidth: 3.1 },
  },
  {
    matches: name => /(^|_)(bldgs?_)?within_?300m?_?broadway/.test(name) || /near.*broadway|broadway.*near/.test(name) || /(^|_)c1(_|$)/.test(name) || /road_candidates?/.test(name),
    style: { color: '#f59e0b', fillOpacity: 0.76, lineWidth: 2.35 },
  },
  {
    matches: name => /atleast_?800m?_?rivers?/.test(name) || /far.*river|river.*far/.test(name) || /river_safe/.test(name) || /(^|_)c2(_|$)/.test(name),
    style: { color: '#0d9488', fillOpacity: 0.72, lineWidth: 2.35 },
  },
  {
    matches: name => /broadway.*(buffer|300m)|(buffer|300m).*broadway/.test(name) || /major_road_buffer/.test(name),
    style: { color: '#f97316', fillOpacity: 0.18, lineWidth: 2.35 },
  },
  {
    matches: name => /(river|rivers).*(buffer|800m)|(buffer|800m).*(river|rivers)/.test(name),
    style: { color: '#38bdf8', fillOpacity: 0.16, lineWidth: 2.35 },
  },
  {
    matches: name => /broadway/.test(name),
    style: { color: '#7c3aed', fillOpacity: 0, lineWidth: 3.5 },
  },
  {
    matches: name => /(^|_)(river|rivers)(_|$)/.test(name),
    style: { color: '#0284c7', fillOpacity: 0.32, lineWidth: 2 },
  },
  {
    matches: name => /candidate|selected|accessible/.test(name),
    style: { color: '#14b8a6', fillOpacity: 0.72, lineWidth: 2.25 },
  },
]

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
  const normalized = name.toLowerCase().trim().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '')
  const semantic = SEMANTIC_STYLES.find(candidate => candidate.matches(normalized))
  if (semantic !== undefined) return { ...semantic.style }
  const canonical = Object.keys(STYLE_BY_NAME).find(key => normalized === key || normalized.startsWith(`${key}_`))
  return { ...(canonical === undefined ? DEFAULT_STYLE : STYLE_BY_NAME[canonical]) }
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

/** Project the live Agent workspace Registry into browser layers without losing UI controls. */
export function registerWorkspaceProjection(
  previous: readonly LayerRecord[],
  value: readonly WorkspaceProjectionItem[],
): LayerRecord[] {
  const previousById = new Map(previous.map(layer => [layer.id, layer]))
  return value.map(({ metadata, geojson }) => {
    if (!isFeatureCollection(geojson)) throw new Error(`Layer ${metadata.layer_id} has invalid GeoJSON.`)
    if (geojson.features.length !== metadata.feature_count) {
      throw new Error(`Layer ${metadata.layer_id} feature count does not match its Registry metadata.`)
    }
    const current = previousById.get(metadata.layer_id)
    return {
      id: metadata.layer_id,
      name: metadata.name,
      type: 'vector',
      geometry: metadata.geometry || geometrySummary(geojson),
      crs: metadata.crs || crsName(geojson),
      featureCount: metadata.feature_count,
      source: metadata.source,
      scenarioId: null,
      generatedBy: metadata.generated_by,
      parents: [...metadata.parents],
      parameters: metadata.parameters,
      storagePath: metadata.storage_path,
      createdAt: metadata.created_at,
      visible: current?.visible ?? true,
      opacity: current?.opacity ?? 1,
      style: current?.style ?? styleForLayer(metadata.name),
      data: geojson,
    }
  })
}

export function toggleLayerVisibility(layers: readonly LayerRecord[], layerId: string): LayerRecord[] {
  return layers.map(layer => layer.id === layerId ? { ...layer, visible: !layer.visible } : layer)
}

export function setLayerOpacity(layers: readonly LayerRecord[], layerId: string, opacity: number): LayerRecord[] {
  const normalized = Math.max(0, Math.min(1, opacity))
  return layers.map(layer => layer.id === layerId ? { ...layer, opacity: normalized } : layer)
}
