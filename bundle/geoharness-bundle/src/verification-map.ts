import type { GeoJsonFeatureCollection, LayerRecord, LayerStyle } from './layer-registry'

export type TaskStepStatus = 'pending' | 'running' | 'success' | 'failed'

export interface MapVerificationLayer {
  layer_id: string
  aliases: string[]
  step_id: string | null
  metadata: {
    layer_id: string
    name: string
    type: 'vector'
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
  checks: {
    feature_count_matches: boolean
    parents_present: boolean
    lineage_matches: boolean
  }
}

export interface MapVerification {
  status: 'ready' | 'failed'
  scenario_id: string
  checks: {
    all_step_outputs_linked: boolean
    feature_counts_match: boolean
    lineage_matches: boolean
    parent_layers_present: boolean
  }
  issues: string[]
  step_bindings: Array<{
    step_id: string
    status: TaskStepStatus
    outputs: Array<{ alias: string, layer_id: string, map_layer_present: boolean }>
  }>
  map_layers: MapVerificationLayer[]
}

const DERIVED_STYLE: Record<string, LayerStyle> = {
  river_buffer: { color: '#3b8fa1', fillOpacity: 0.22, lineWidth: 2.2 },
  river_exclusion_buffer: { color: '#3b8fa1', fillOpacity: 0.16, lineWidth: 2.4 },
  major_road_buffer: { color: '#c49a45', fillOpacity: 0.22, lineWidth: 2.2 },
  candidate_buildings: { color: '#d76945', fillOpacity: 0.84, lineWidth: 2.4 },
  accessible_buildings: { color: '#d76945', fillOpacity: 0.84, lineWidth: 2.4 },
  district_statistics: { color: '#7b6ca8', fillOpacity: 0.34, lineWidth: 2.1 },
  accessibility_by_district: { color: '#7b6ca8', fillOpacity: 0.34, lineWidth: 2.1 },
}

function styleFor(alias: string): LayerStyle {
  return DERIVED_STYLE[alias] ?? { color: '#147d78', fillOpacity: 0.52, lineWidth: 2 }
}

function validCollection(value: GeoJsonFeatureCollection) {
  return value?.type === 'FeatureCollection'
    && Array.isArray(value.features)
    && value.features.every(feature => feature?.type === 'Feature' && typeof feature.geometry?.type === 'string')
}

export function layerIdsForStep(verification: MapVerification | null, stepId: string | null): Set<string> {
  if (verification === null || stepId === null) return new Set()
  const binding = verification.step_bindings.find(item => item.step_id === stepId)
  return new Set(binding?.outputs.filter(output => output.map_layer_present).map(output => output.layer_id) ?? [])
}

export function stepStatus(verification: MapVerification | null, stepId: string): TaskStepStatus {
  return verification?.step_bindings.find(item => item.step_id === stepId)?.status ?? 'pending'
}

export function mergeVerificationLayers(current: readonly LayerRecord[], verification: MapVerification): LayerRecord[] {
  if (verification.status !== 'ready' || !Object.values(verification.checks).every(Boolean)) {
    throw new Error(`Map verification is not ready: ${verification.issues.join('; ') || 'failed checks'}`)
  }
  const inputs = current.filter(layer => layer.source !== 'derived')
  const derived = verification.map_layers
    .filter(layer => layer.metadata.source === 'derived')
    .map((layer): LayerRecord => {
      if (!validCollection(layer.geojson)) throw new Error(`Invalid map GeoJSON for ${layer.layer_id}`)
      if (layer.geojson.features.length !== layer.metadata.feature_count) {
        throw new Error(`Map feature count mismatch for ${layer.layer_id}`)
      }
      const alias = layer.aliases.at(-1) ?? layer.metadata.name
      return {
        id: layer.layer_id,
        name: alias,
        type: 'vector',
        geometry: layer.metadata.geometry,
        crs: layer.metadata.crs,
        featureCount: layer.metadata.feature_count,
        source: 'derived',
        scenarioId: verification.scenario_id,
        generatedBy: layer.metadata.generated_by,
        parents: [...layer.metadata.parents],
        parameters: layer.metadata.parameters,
        storagePath: layer.metadata.storage_path,
        createdAt: layer.metadata.created_at,
        visible: true,
        opacity: alias.includes('buffer') ? 0.58 : 0.9,
        style: styleFor(alias),
        data: layer.geojson,
      }
    })
  return [...inputs, ...derived]
}
