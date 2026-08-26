import { readFile } from 'node:fs/promises'
import { resolve, sep } from 'node:path'
import { isDeepStrictEqual } from 'node:util'

const PHASE9_DEFERRED = new Set(['revised_candidate_count', 'retained_history_entries'])

function safeScenarioRoot(scenarioRoot, scenarioId) {
  const root = resolve(scenarioRoot, scenarioId)
  if (root !== scenarioRoot && !root.startsWith(`${scenarioRoot}${sep}`)) {
    throw new Error(`Unsafe Scenario regression path: ${scenarioId}`)
  }
  return root
}

function gate(required, available) {
  const current = new Set(available)
  const missing = required.filter(item => !current.has(item))
  return { passed: missing.length === 0, required, available: [...current].sort(), missing }
}

/** Execute one independent Scenario and enforce all four Phase 8 acceptance gates. */
export async function runScenarioRegression(ctx, options) {
  const scenarioId = options.scenarioId
  const scenarioRoot = resolve(options.scenarioRoot)
  const root = safeScenarioRoot(scenarioRoot, scenarioId)
  const [expectedPlan, expectedResult] = await Promise.all([
    readFile(resolve(root, 'expected-plan.json'), 'utf8').then(JSON.parse),
    readFile(resolve(root, 'expected-result.json'), 'utf8').then(JSON.parse),
  ])
  const execution = await ctx.taskGraph.runScenario({
    scenarioId,
    workspaceKey: options.workspaceKey,
    signal: options.signal,
  })
  const oracle = await ctx.geo.execute({
    action: 'regression',
    workspaceKey: options.workspaceKey,
    scenario_id: scenarioId,
    layer_aliases: execution.layers,
  }, options.signal)

  const successfulTools = execution.steps
    .filter(step => step.status === 'success')
    .map(step => step.tool)
  const capability = gate(expectedPlan.required_capabilities, successfulTools)
  const layers = gate(expectedResult.required_output_layers, Object.keys(execution.layers))
  const spatialCorrectness = {
    passed: Object.values(oracle.checks).every(Boolean),
    checks: oracle.checks,
  }

  const checked = {}
  const deferred = []
  const mismatches = []
  for (const [name, expected] of Object.entries(expectedResult.expected)) {
    if (!(name in oracle.statistics)) {
      if (scenarioId === '05-parameter-revision' && PHASE9_DEFERRED.has(name)) {
        deferred.push(name)
        continue
      }
      mismatches.push({ name, expected, actual: '<missing>' })
      continue
    }
    const actual = oracle.statistics[name]
    checked[name] = actual
    if (!isDeepStrictEqual(actual, expected)) mismatches.push({ name, expected, actual })
  }
  const expectedStatistics = {
    passed: mismatches.length === 0,
    checked,
    deferred,
    mismatches,
  }
  const gates = {
    required_capability: capability,
    required_layers: layers,
    spatial_correctness: spatialCorrectness,
    expected_statistics: expectedStatistics,
  }
  const passed = execution.status === 'success'
    && execution.map_verification.status === 'ready'
    && Object.values(gates).every(item => item.passed)
  return {
    schema_version: '1.0',
    scenario_id: scenarioId,
    passed,
    task_graph_status: execution.status,
    map_verification_status: execution.map_verification.status,
    gates,
    statistics: oracle.statistics,
    execution,
  }
}

export default runScenarioRegression
