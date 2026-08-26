import { SCENARIO_IDS } from './tools.js'

const SCENARIOS = new Set(SCENARIO_IDS)
const WORKSPACE_KEY = /^[A-Za-z0-9._:-]{1,120}$/

function badRequest(message) {
  return {
    ok: false,
    error: { code: 'bad-request', message, details: { issues: [] } },
  }
}

function requestPayload(payload) {
  if (payload === null || typeof payload !== 'object' || Array.isArray(payload)) return null
  const scenarioId = payload.scenario_id
  const workspaceKey = payload.workspace_key ?? `browser:${scenarioId}`
  if (typeof scenarioId !== 'string' || !SCENARIOS.has(scenarioId)) return null
  if (typeof workspaceKey !== 'string' || !WORKSPACE_KEY.test(workspaceKey)) return null
  return { scenarioId, workspaceKey }
}

export function parseDistanceRevision(prompt) {
  if (typeof prompt !== 'string') return null
  const normalized = prompt.trim().toLowerCase()
  const match = normalized.match(/(\d+(?:\.\d+)?)\s*(公里|千米|km|kilometers?|米|m|meters?)/u)
  if (match === null) return null
  const value = Number(match[1])
  const unit = match[2]
  const distance = ['公里', '千米', 'km', 'kilometer', 'kilometers'].includes(unit) ? value * 1000 : value
  return Number.isFinite(distance) && distance > 0 && distance <= 100_000 ? distance : null
}

/** Loopback-only browser bridge for running and retrieving Scenario verification projections. */
export function registerGeoRpc(ctx) {
  return ctx.connection.rpc.handle('/geoharness', async (endpoint, payload, signal) => {
    const request = requestPayload(payload)
    if (request === null) return badRequest('A valid scenario_id and workspace_key are required')
    if (endpoint === 'scenario/run') {
      const value = await ctx.taskGraph.runScenario({ ...request, signal })
      return { ok: true, value }
    }
    if (endpoint === 'scenario/latest') {
      return { ok: true, value: ctx.taskGraph.latest(request.workspaceKey, request.scenarioId) }
    }
    if (endpoint === 'scenario/revise') {
      if (request.scenarioId !== '05-parameter-revision') {
        return badRequest('Conversational revision is supported only for Scenario 05 in v1.0')
      }
      const distance = parseDistanceRevision(payload.revision_prompt)
      if (distance === null) return badRequest('Revision prompt must contain a valid distance')
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
