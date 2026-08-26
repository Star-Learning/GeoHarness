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
    return badRequest(`Unknown GeoHarness endpoint: ${endpoint}`)
  }, { authority: 'loopback' })
}

export default registerGeoRpc
