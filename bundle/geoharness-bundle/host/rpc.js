import { SCENARIO_IDS } from './tools.js'
import { HARD_UPLOAD_BYTES } from './provider.js'

const SCENARIOS = new Set(SCENARIO_IDS)
const WORKSPACE_KEY = /^[A-Za-z0-9._:-]{1,120}$/
const LAYER_ID = /^layer_[0-9]{4,}$/u
const MAX_GOAL_LENGTH = 2_000
const MAX_BASE64_LENGTH = Math.ceil(HARD_UPLOAD_BYTES / 3) * 4 + 4
const SAFE_UPLOAD_NAME = /^[^<>:"/\\|?*\u0000-\u001f]{1,180}$/u
const SUPPORTED_UPLOAD_EXTENSION = /\.(?:geojson|json|zip|gpkg|csv)$/iu
const DISTANCE_PATTERN = /(-?\d+(?:\.\d+)?)\s*(公里|千米|km|kilometers?|米|m|meters?)/giu

function badRequest(message) {
  return {
    ok: false,
    error: { code: 'bad-request', message, details: { issues: [] } },
  }
}

function scenarioRequestPayload(payload) {
  if (payload === null || typeof payload !== 'object' || Array.isArray(payload)) return null
  const scenarioId = payload.scenario_id
  const workspaceKey = payload.workspace_key ?? `browser:${scenarioId}`
  if (typeof scenarioId !== 'string' || !SCENARIOS.has(scenarioId)) return null
  if (typeof workspaceKey !== 'string' || !WORKSPACE_KEY.test(workspaceKey)) return null
  return { scenarioId, workspaceKey }
}

function goalRequestPayload(payload) {
  if (payload === null || typeof payload !== 'object' || Array.isArray(payload)) return null
  const prompt = typeof payload.goal_prompt === 'string' ? payload.goal_prompt.trim() : ''
  const workspaceKey = payload.workspace_key ?? 'browser:goal'
  if (prompt === '' || prompt.length > MAX_GOAL_LENGTH) return null
  if (typeof workspaceKey !== 'string' || !WORKSPACE_KEY.test(workspaceKey)) return null
  return { prompt, workspaceKey }
}

function agentWorkspacePayload(payload) {
  if (payload === null || typeof payload !== 'object' || Array.isArray(payload)) return null
  const workspaceKey = payload.workspace_key
  if (typeof workspaceKey !== 'string' || !WORKSPACE_KEY.test(workspaceKey)) return null
  return { workspaceKey }
}

function optionalString(value, maxLength) {
  if (value === undefined || value === null || value === '') return undefined
  if (typeof value !== 'string') return null
  const normalized = value.trim()
  return normalized.length > 0 && normalized.length <= maxLength ? normalized : null
}

function importRequestPayload(payload) {
  if (payload === null || typeof payload !== 'object' || Array.isArray(payload)) return null
  const workspaceKey = payload.workspace_key
  const fileName = payload.file_name
  const contentBase64 = payload.content_base64
  if (typeof workspaceKey !== 'string' || !WORKSPACE_KEY.test(workspaceKey)) return null
  if (typeof fileName !== 'string' || !SAFE_UPLOAD_NAME.test(fileName)
    || !SUPPORTED_UPLOAD_EXTENSION.test(fileName)
    || fileName !== fileName.trim().replace(/[. ]+$/u, '') || fileName === '.' || fileName === '..') return null
  if (typeof contentBase64 !== 'string' || contentBase64.length === 0 || contentBase64.length > MAX_BASE64_LENGTH) return null
  const options = {}
  for (const [key, limit] of [
    ['name', 120], ['source_layer', 180], ['longitude_field', 120],
    ['latitude_field', 120], ['crs', 80],
  ]) {
    const value = optionalString(payload[key], limit)
    if (value === null) return null
    if (value !== undefined) options[key] = value
  }
  return { workspaceKey, fileName, contentBase64, options }
}

function layerRequestPayload(payload) {
  const workspace = agentWorkspacePayload(payload)
  if (workspace === null || typeof payload.layer_id !== 'string' || !LAYER_ID.test(payload.layer_id)) return null
  return { ...workspace, layerId: payload.layer_id }
}

function verifyWorkspaceProjection(projection, preferences = {}) {
  const ids = new Set(projection.map(item => item.metadata?.layer_id))
  const issues = []
  for (const item of projection) {
    const metadata = item.metadata ?? {}
    const featureCount = item.geojson?.type === 'FeatureCollection' && Array.isArray(item.geojson.features)
      ? item.geojson.features.length
      : -1
    if (featureCount !== metadata.feature_count) issues.push(`Feature count mismatch for ${metadata.layer_id ?? 'unknown layer'}`)
    if (!Array.isArray(metadata.parents) || metadata.parents.some(parent => !ids.has(parent))) {
      issues.push(`Missing parent Layer for ${metadata.layer_id ?? 'unknown layer'}`)
    }
  }
  return {
    status: issues.length === 0 ? 'ready' : 'failed',
    checks: {
      feature_counts_match: !issues.some(issue => issue.startsWith('Feature count')),
      parent_layers_present: !issues.some(issue => issue.startsWith('Missing parent')),
    },
    issues,
    layers: projection,
    preferences: Object.fromEntries(Object.entries(preferences).filter(([layerId]) => ids.has(layerId))),
  }
}

function toMeters(value, unit) {
  const distance = ['公里', '千米', 'km', 'kilometer', 'kilometers'].includes(unit.toLowerCase())
    ? value * 1000
    : value
  return Number.isFinite(distance) && distance > 0 && distance <= 100_000 ? distance : null
}

export function parseDistanceMentions(prompt) {
  if (typeof prompt !== 'string') return []
  return [...prompt.matchAll(DISTANCE_PATTERN)]
    .map(match => ({ distance: toMeters(Number(match[1]), match[2]), index: match.index ?? 0 }))
    .filter(item => item.distance !== null)
}

export function parseDistanceRevision(prompt) {
  return parseDistanceMentions(prompt)[0]?.distance ?? null
}

function patchesForDistance(stepId, distance) {
  return distance === undefined ? {} : { [stepId]: { distance, unit: 'meter' } }
}

/** Resolve a natural-language goal only into the seven bounded v1.0 workflows. */
export function resolveGeoGoal(prompt) {
  if (typeof prompt !== 'string' || prompt.trim() === '') return null
  const normalized = prompt.trim().toLowerCase()
  const requestedDistanceCount = [...prompt.matchAll(DISTANCE_PATTERN)].length
  const distances = parseDistanceMentions(prompt).map(item => item.distance)
  if (requestedDistanceCount !== distances.length) return null
  const hasRoad = /broadway|主要道路|道路|公路|road|street/u.test(normalized)
  const hasRiver = /hudson|east river|河流|河道|河|江|river/u.test(normalized)
  const hasDistrict = /community district|社区区|行政区|分区|district/u.test(normalized)
  const hasOfficialInspection = /官方|official|lower manhattan|屋顶|roof|建成年份|construction year/u.test(normalized)
  const hasBuilding = /建筑|building/u.test(normalized)

  if (hasRoad && hasRiver) {
    const parameterPatches = {
      ...patchesForDistance('buffer_major_roads', distances[0]),
      ...patchesForDistance('buffer_rivers', distances[1]),
    }
    return {
      scenarioId: '06-multi-constraint-selection',
      parameterPatches,
      parameters: {
        road_distance_m: distances[0] ?? 300,
        river_distance_m: distances[1] ?? 800,
      },
    }
  }
  if (hasRoad) {
    const scenarioId = hasDistrict ? '04-road-accessibility' : '05-parameter-revision'
    return {
      scenarioId,
      parameterPatches: patchesForDistance('buffer_major_roads', distances[0]),
      parameters: { road_distance_m: distances[0] ?? (hasDistrict ? 300 : 500) },
    }
  }
  if (hasRiver) {
    return {
      scenarioId: '02-river-building-query',
      parameterPatches: patchesForDistance('buffer_rivers', distances[0]),
      parameters: { river_distance_m: distances[0] ?? 500 },
    }
  }
  if (hasOfficialInspection) {
    return { scenarioId: '07-official-nyc-building-inspection', parameterPatches: {}, parameters: {} }
  }
  if (hasDistrict) {
    return { scenarioId: '03-building-statistics-by-district', parameterPatches: {}, parameters: {} }
  }
  if (hasBuilding) {
    return { scenarioId: '01-building-data-inspection', parameterPatches: {}, parameters: {} }
  }
  return null
}

/** Loopback-only browser bridge for running and retrieving Scenario verification projections. */
export function registerGeoRpc(ctx) {
  const jobs = new Map()

  const startJob = ({ scenarioId, workspaceKey, execute }) => {
    const key = `${workspaceKey}:${scenarioId}`
    const existing = [...jobs.values()].find(job => job.workspaceKey === workspaceKey && job.status === 'running')
    if (existing?.status === 'running') return null
    const job = {
      scenarioId,
      workspaceKey,
      status: 'running',
      execution: null,
      mapPreview: null,
      previewSequence: 0,
      error: null,
    }
    jobs.set(key, job)
    const onTransition = (event, snapshot) => {
      job.execution = snapshot
      if (event.to !== 'success' || event.outputs?.length === 0
        || typeof ctx.taskGraph.buildMapVerification !== 'function') return
      const previewSequence = event.sequence
      void ctx.taskGraph.buildMapVerification(snapshot, workspaceKey)
        .then(mapPreview => {
          if (job.status === 'running' && previewSequence > job.previewSequence) {
            job.mapPreview = mapPreview
            job.previewSequence = previewSequence
          }
        })
        .catch(() => {})
    }
    void Promise.resolve()
      .then(() => execute(onTransition))
      .then(value => {
        job.execution = value
        job.mapPreview = value.map_verification ?? job.mapPreview
        if (value.status === 'success' && value.map_verification?.status === 'ready') {
          job.status = 'success'
          return
        }
        job.status = 'failed'
        job.error = value.steps?.find(step => step.status === 'failed')?.error
          ?? value.map_verification?.issues?.join('; ')
          ?? 'GIS workflow did not complete successfully'
      })
      .catch(error => {
        job.status = 'failed'
        job.error = (error instanceof Error ? error.message : String(error)).slice(0, 500)
      })
    return job
  }

  return ctx.connection.rpc.handle('/geoharness', async (endpoint, payload, signal) => {
    if (endpoint === 'agent/workspace') {
      const request = agentWorkspacePayload(payload)
      if (request === null) return badRequest('A valid workspace_key is required')
      const [projection, manifest] = await Promise.all([
        ctx.geo.execute({ action: 'projection', workspaceKey: request.workspaceKey }, signal),
        ctx.geo.execute({ action: 'workspace_manifest', workspaceKey: request.workspaceKey }, signal),
      ])
      return { ok: true, value: verifyWorkspaceProjection(projection, manifest.layer_preferences) }
    }
    if (endpoint === 'data/import-capabilities') {
      const request = agentWorkspacePayload(payload)
      if (request === null) return badRequest('A valid workspace_key is required')
      const value = await ctx.geo.execute({ action: 'import_capabilities', workspaceKey: request.workspaceKey }, signal)
      return { ok: true, value }
    }
    if (endpoint === 'data/import') {
      const request = importRequestPayload(payload)
      if (request === null) return badRequest('A valid bounded upload payload is required')
      try {
        const value = await ctx.geo.execute({
          action: 'import_upload',
          workspaceKey: request.workspaceKey,
          file_name: request.fileName,
          content_base64: request.contentBase64,
          ...request.options,
        }, signal)
        return { ok: true, value }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        return badRequest(message.slice(0, 800))
      }
    }
    if (endpoint === 'layer/details') {
      const request = layerRequestPayload(payload)
      if (request === null) return badRequest('A valid workspace_key and layer_id are required')
      try {
        const value = await ctx.geo.execute({
          action: 'layer_details', workspaceKey: request.workspaceKey, layer_id: request.layerId, limit: 100,
        }, signal)
        return { ok: true, value }
      } catch (error) {
        return badRequest((error instanceof Error ? error.message : String(error)).slice(0, 800))
      }
    }
    if (endpoint === 'layer/rename') {
      const request = layerRequestPayload(payload)
      const name = optionalString(payload?.name, 120)
      if (request === null || name === null || name === undefined) {
        return badRequest('A valid workspace_key, layer_id and name are required')
      }
      try {
        const value = await ctx.geo.execute({
          action: 'layer_rename', workspaceKey: request.workspaceKey, layer_id: request.layerId, name,
        }, signal)
        return { ok: true, value }
      } catch (error) {
        return badRequest((error instanceof Error ? error.message : String(error)).slice(0, 800))
      }
    }
    if (endpoint === 'layer/remove') {
      const request = layerRequestPayload(payload)
      if (request === null) return badRequest('A valid workspace_key and layer_id are required')
      try {
        const value = await ctx.geo.execute({
          action: 'layer_remove', workspaceKey: request.workspaceKey, layer_id: request.layerId,
        }, signal)
        return { ok: true, value }
      } catch (error) {
        return badRequest((error instanceof Error ? error.message : String(error)).slice(0, 800))
      }
    }
    if (endpoint === 'layer/preference') {
      const request = layerRequestPayload(payload)
      const visible = payload?.visible
      const opacity = payload?.opacity
      if (request === null
        || (visible === undefined && opacity === undefined)
        || (visible !== undefined && typeof visible !== 'boolean')
        || (opacity !== undefined && (typeof opacity !== 'number' || !Number.isFinite(opacity) || opacity < 0 || opacity > 1))) {
        return badRequest('Layer preference requires a valid visible and/or opacity value')
      }
      try {
        const value = await ctx.geo.execute({
          action: 'layer_preference', workspaceKey: request.workspaceKey, layer_id: request.layerId,
          ...visible === undefined ? {} : { visible },
          ...opacity === undefined ? {} : { opacity },
        }, signal)
        return { ok: true, value }
      } catch (error) {
        return badRequest((error instanceof Error ? error.message : String(error)).slice(0, 800))
      }
    }
    if (endpoint === 'goal/run' || endpoint === 'goal/start') {
      const request = goalRequestPayload(payload)
      if (request === null) return badRequest('A non-empty goal_prompt and valid workspace_key are required')
      const resolution = resolveGeoGoal(request.prompt)
      if (resolution === null) {
        return badRequest('The goal does not match a supported GeoHarness v1.0 GIS workflow')
      }
      if (endpoint === 'goal/start') {
        const job = startJob({
          scenarioId: resolution.scenarioId,
          workspaceKey: request.workspaceKey,
          execute: onTransition => ctx.taskGraph.runScenario({
            scenarioId: resolution.scenarioId,
            workspaceKey: request.workspaceKey,
            parameterPatches: resolution.parameterPatches,
            goal: request.prompt,
            onTransition,
          }),
        })
        if (job === null) return badRequest('A GIS workflow is already running in this workspace')
        return {
          ok: true,
          value: {
            job_status: job.status,
            goal_resolution: {
              prompt: request.prompt,
              scenario_id: resolution.scenarioId,
              parameters: resolution.parameters,
            },
          },
        }
      }
      const value = await ctx.taskGraph.runScenario({
        scenarioId: resolution.scenarioId,
        workspaceKey: request.workspaceKey,
        parameterPatches: resolution.parameterPatches,
        goal: request.prompt,
        signal,
      })
      return {
        ok: true,
        value: {
          ...value,
          goal_resolution: {
            prompt: request.prompt,
            scenario_id: resolution.scenarioId,
            parameters: resolution.parameters,
          },
        },
      }
    }
    const request = scenarioRequestPayload(payload)
    if (request === null) return badRequest('A valid scenario_id and workspace_key are required')
    if (endpoint === 'scenario/progress') {
      const job = jobs.get(`${request.workspaceKey}:${request.scenarioId}`)
      if (job === undefined) return badRequest('No active or completed GIS job exists for this Scenario')
      return {
        ok: true,
        value: {
          job_status: job.status,
          execution: job.execution,
          map_preview: job.mapPreview,
          error: job.error,
        },
      }
    }
    if (endpoint === 'scenario/run') {
      const value = await ctx.taskGraph.runScenario({ ...request, signal })
      return { ok: true, value }
    }
    if (endpoint === 'scenario/latest') {
      return { ok: true, value: ctx.taskGraph.latest(request.workspaceKey, request.scenarioId) }
    }
    if (endpoint === 'scenario/revise' || endpoint === 'scenario/revise/start') {
      if (request.scenarioId !== '05-parameter-revision') {
        return badRequest('Conversational revision is supported only for Scenario 05 in v1.0')
      }
      const distance = parseDistanceRevision(payload.revision_prompt)
      if (distance === null) return badRequest('Revision prompt must contain a valid distance')
      if (endpoint === 'scenario/revise/start') {
        const job = startJob({
          scenarioId: request.scenarioId,
          workspaceKey: request.workspaceKey,
          execute: onTransition => ctx.taskGraph.reviseScenario({
            ...request,
            stepId: 'buffer_major_roads',
            parameterPatch: { distance, unit: 'meter' },
            reason: payload.revision_prompt,
            onTransition,
          }),
        })
        if (job === null) return badRequest('A GIS workflow is already running in this workspace')
        return { ok: true, value: { job_status: job.status } }
      }
      const value = await ctx.taskGraph.reviseScenario({
        ...request,
        stepId: 'buffer_major_roads',
        parameterPatch: { distance, unit: 'meter' },
        reason: payload.revision_prompt,
        signal,
      })
      return { ok: true, value }
    }
    return badRequest(`Unknown GeoHarness endpoint: ${endpoint}`)
  }, { authority: 'loopback' })
}

export default registerGeoRpc
