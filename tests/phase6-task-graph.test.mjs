import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { pathToFileURL, fileURLToPath } from 'node:url'
import test from 'node:test'

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const bundleRoot = join(repositoryRoot, 'bundle', 'geoharness-bundle')
const scenarioRoot = join(repositoryRoot, 'examples', 'scenarios')
const requireFromBundle = createRequire(join(bundleRoot, 'package.json'))

async function importFromBundle(packageName) {
  return import(pathToFileURL(requireFromBundle.resolve(packageName)).href)
}

async function setup(workspaceRoot) {
  const [{ Context }, { default: SystemPrompt }, { default: ToolRuntime }, GeoPlugin] = await Promise.all([
    importFromBundle('@deepseek-ai/cordis'),
    importFromBundle('@deepseek-ai/dsh-system-prompt'),
    importFromBundle('@deepseek-ai/dsh-tools'),
    import('../bundle/geoharness-bundle/index.js'),
  ])
  const ctx = new Context()
  await ctx.plugin(SystemPrompt)
  await ctx.plugin(ToolRuntime)
  await ctx.plugin(GeoPlugin, {
    workspaceRoot,
    backendRoot: join(repositoryRoot, 'backend', 'geo-service'),
    scenarioRoot,
  })
  return ctx
}

test('all deterministic Scenario regression DAGs validate without being bundled into the Agent UI', async () => {
  const { TaskGraphExecution } = await import('../bundle/geoharness-bundle/host/task-graph.js')
  const entries = (await readdir(scenarioRoot, { withFileTypes: true }))
    .filter(entry => entry.isDirectory())
    .sort((left, right) => left.name.localeCompare(right.name))
  assert.equal(entries.length, 7)
  for (const entry of entries) {
    const definition = JSON.parse(await readFile(join(scenarioRoot, entry.name, 'task-graph.json'), 'utf8'))
    const execution = new TaskGraphExecution(definition, {
      initialLayers: {},
      executor: async () => ({ success: true, outputs: [] }),
    })
    const snapshot = execution.snapshot()
    assert.equal(snapshot.scenario_id, entry.name)
    assert.equal(snapshot.status, 'pending')
    assert.ok(snapshot.steps.every(step => step.status === 'pending'))
    assert.ok(snapshot.steps.some(step => step.dependencies.length > 0))
    assert.ok(snapshot.steps.some(step => step.outputs.length > 0))
  }
  const client = await readFile(join(bundleRoot, 'client.js'), 'utf8')
  assert.match(client, /data-task-graph/)
  assert.match(client, /data-step-status/)
  assert.match(client, /Native Harness Agent/)
  for (const entry of entries) assert.doesNotMatch(client, new RegExp(entry.name))
})

test('TaskGraphRuntime executes Scenario 02 through the real Geo provider and records every state transition', async () => {
  const temporary = await mkdtemp(join(tmpdir(), 'geoharness-phase6-real-'))
  try {
    const ctx = await setup(temporary)
    const transitions = []
    const result = await ctx.taskGraph.runScenario({
      scenarioId: '02-river-building-query',
      workspaceKey: 'phase6-real',
      onTransition: event => transitions.push(event),
    })
    assert.equal(result.status, 'success')
    assert.equal(result.steps.length, 6)
    assert.ok(result.steps.every(step => step.status === 'success'))
    assert.equal(result.steps.find(step => step.id === 'filter_buildings').result.data.selected_count, 132)
    assert.match(result.layers.river_buffer, /^layer[_-]/)
    assert.match(result.layers.candidate_buildings, /^layer[_-]/)
    assert.equal(transitions.length, 12)
    assert.deepEqual(new Set(transitions.map(event => event.to)), new Set(['running', 'success']))
    assert.deepEqual(ctx.taskGraph.latest('phase6-real', '02-river-building-query'), result)
    await assert.rejects(ctx.taskGraph.runScenario({
      scenarioId: '02-river-building-query',
      workspaceKey: 'phase6-invalid-step',
      parameterPatches: { not_a_step: { distance: 275 } },
    }), error => error.code === 'TASK_GRAPH_PATCH_INVALID')
    await assert.rejects(ctx.taskGraph.runScenario({
      scenarioId: '02-river-building-query',
      workspaceKey: 'phase6-invalid-parameter',
      parameterPatches: { buffer_rivers: { invented_parameter: 275 } },
    }), error => error.code === 'TASK_GRAPH_PATCH_INVALID')
  } finally {
    await rm(temporary, { recursive: true, force: true })
  }
})

test('a failed step is recorded and only its dependent branch is failed', async () => {
  const { TaskGraphExecution, TaskGraphError } = await import('../bundle/geoharness-bundle/host/task-graph.js')
  const graph = {
    goal: 'Exercise deterministic failure propagation.',
    steps: [
      { id: 'bad_source', title: 'Fail source', tool: 'fail', dependencies: [], parameters: {}, outputs: [] },
      { id: 'blocked_child', title: 'Dependent child', tool: 'never', dependencies: ['bad_source'], parameters: {}, outputs: [] },
      { id: 'independent_step', title: 'Independent branch', tool: 'ok', dependencies: [], parameters: {}, outputs: [] },
    ],
  }
  const invoked = []
  const execution = new TaskGraphExecution(graph, {
    executor: async step => {
      invoked.push(step.id)
      return step.tool === 'fail'
        ? { success: false, summary: 'deliberate failure', outputs: [] }
        : { success: true, summary: 'independent success', outputs: [] }
    },
  })
  const result = await execution.run()
  assert.equal(result.status, 'failed')
  assert.deepEqual(invoked, ['bad_source', 'independent_step'])
  assert.equal(result.steps.find(step => step.id === 'bad_source').error, 'deliberate failure')
  assert.match(result.steps.find(step => step.id === 'blocked_child').error, /Blocked by failed dependencies/)
  assert.equal(result.steps.find(step => step.id === 'independent_step').status, 'success')

  assert.throws(() => new TaskGraphExecution({
    goal: 'cycle',
    steps: [
      { id: 'step_a', title: 'A', tool: 'a', dependencies: ['step_b'], parameters: {}, outputs: [] },
      { id: 'step_b', title: 'B', tool: 'b', dependencies: ['step_a'], parameters: {}, outputs: [] },
    ],
  }, { executor: async () => ({ success: true, outputs: [] }) }), error => error instanceof TaskGraphError && error.code === 'TASK_GRAPH_CYCLE')
})
