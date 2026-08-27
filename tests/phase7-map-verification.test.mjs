import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { pathToFileURL, fileURLToPath } from 'node:url'
import vm from 'node:vm'
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

async function clientPlugin() {
  const code = await readFile(join(bundleRoot, 'client.js'), 'utf8')
  let handoff
  vm.runInNewContext(code, {
    document: { querySelector: () => null, createElement: () => ({ dataset: {} }), head: { appendChild: () => {} } },
    JSON,
    window: { __ModuleLoader__: { load: value => { handoff = value } } },
  }, { filename: 'client.js' })
  const jsx = (type, props, key) => ({ type, props: props ?? {}, key })
  return handoff.factory(specifier => {
    if (specifier === 'react') return {}
    if (specifier === 'react/jsx-runtime') return { Fragment: Symbol('fragment'), jsx, jsxs: jsx }
    throw new Error(`unexpected external: ${specifier}`)
  })
}

test('successful Task steps resolve to registry lineage and canonical map GeoJSON', async () => {
  const temporary = await mkdtemp(join(tmpdir(), 'geoharness-phase7-real-'))
  try {
    const ctx = await setup(temporary)
    const result = await ctx.taskGraph.runScenario({
      scenarioId: '02-river-building-query',
      workspaceKey: 'phase7-real',
    })
    const verification = result.map_verification
    assert.equal(verification.status, 'ready')
    assert.deepEqual(verification.issues, [])
    assert.ok(Object.values(verification.checks).every(Boolean))
    assert.equal(verification.map_layers.length, 5)

    const candidate = verification.map_layers.find(layer => layer.aliases.includes('candidate_buildings'))
    assert.equal(candidate.step_id, 'filter_buildings')
    assert.equal(candidate.metadata.generated_by, 'filter_buildings')
    assert.equal(candidate.metadata.feature_count, 132)
    assert.equal(candidate.geojson.features.length, 132)
    assert.ok(Object.values(candidate.checks).every(Boolean))
    assert.deepEqual(
      verification.step_bindings.find(binding => binding.step_id === 'filter_buildings').outputs,
      [{ alias: 'candidate_buildings', layer_id: candidate.layer_id, map_layer_present: true }],
    )
  } finally {
    await rm(temporary, { recursive: true, force: true })
  }
})

test('repeating a full Scenario run resets stale derived layers before map verification', async () => {
  const temporary = await mkdtemp(join(tmpdir(), 'geoharness-phase7-repeat-'))
  try {
    const ctx = await setup(temporary)
    const request = {
      scenarioId: '07-official-nyc-building-inspection',
      workspaceKey: 'phase7-repeat-official',
    }
    const first = await ctx.taskGraph.runScenario(request)
    const second = await ctx.taskGraph.runScenario(request)
    for (const result of [first, second]) {
      assert.equal(result.status, 'success')
      assert.equal(result.map_verification.status, 'ready')
      assert.deepEqual(result.map_verification.issues, [])
      assert.equal(result.map_verification.map_layers.length, 2)
      assert.deepEqual(
        result.map_verification.map_layers.map(layer => layer.layer_id),
        ['layer_0001', 'layer_0002'],
      )
    }
  } finally {
    await rm(temporary, { recursive: true, force: true })
  }
})

test('the browser projection adds derived layers and selects map layers by Task step', async () => {
  const temporary = await mkdtemp(join(tmpdir(), 'geoharness-phase7-client-'))
  try {
    const ctx = await setup(temporary)
    const result = await ctx.taskGraph.runScenario({
      scenarioId: '02-river-building-query',
      workspaceKey: 'phase7-client',
    })
    const plugin = await clientPlugin()
    const layers = plugin.mergeVerificationLayers([], result.map_verification)
    assert.deepEqual([...layers].map(layer => layer.name), ['rivers_metric', 'river_buffer', 'candidate_buildings'])
    const candidate = layers.find(layer => layer.name === 'candidate_buildings')
    assert.equal(candidate.featureCount, 132)
    assert.equal(candidate.generatedBy, 'filter_buildings')
    assert.equal(candidate.source, 'derived')
    assert.deepEqual(
      [...plugin.layerIdsForStep(result.map_verification, 'filter_buildings')],
      [candidate.id],
    )
    assert.equal(plugin.stepStatus(result.map_verification, 'filter_buildings'), 'success')
    assert.throws(() => plugin.mergeVerificationLayers([], {
      ...result.map_verification,
      status: 'failed',
      issues: ['deliberate verification failure'],
    }), /Map verification is not ready/)
  } finally {
    await rm(temporary, { recursive: true, force: true })
  }
})

test('native Harness Session events become live Agent tool steps and a final answer', async () => {
  const plugin = await clientPlugin()
  const entries = [
    { event: { type: 'user/message', seq: 10, data: {
      source: { kind: 'user' }, content: [{ type: 'text', text: '请创建 275 米缓冲区。' }],
    } } },
    { event: { type: 'turn/start', seq: 11, data: { turn: 2 } } },
    { event: { type: 'tool/call', seq: 12, data: {
      turn: 2, step: 1, callId: 'call-1', name: 'create_buffer',
      arguments: '{"input_layer":"layer_0001","distance":275,"unit":"meter"}',
    } } },
    { event: { type: 'tool/result', seq: 13, data: {
      turn: 2, step: 1,
      message: {
        source: { kind: 'tool', callId: 'call-1' },
        content: [{ type: 'tool-result', toolCallId: 'call-1', content: [{ type: 'text', text: 'Geo operation succeeded: Created a 275 m buffer.' }] }],
      },
      meta: { summary: 'Created a 275 m buffer.', outputs: ['layer_0002'] },
    } } },
    { event: { type: 'assistant/message', seq: 14, data: {
      turn: 2, step: 2,
      message: { content: [{ type: 'text', text: '275 米缓冲区已完成并通过图层验证。' }] },
    } } },
    { event: { type: 'turn/end', seq: 15, data: { turn: 2, reason: { kind: 'completed' } } } },
  ]
  const projection = plugin.projectAgentHistory(entries, 10)
  assert.deepEqual(JSON.parse(JSON.stringify(plugin.latestHumanGoal(entries))), { seq: 10, text: '请创建 275 米缓冲区。' })
  assert.equal(plugin.humanGoalCount([
    ...entries,
    { event: { type: 'user/message', seq: 16, data: {
      source: { kind: 'plugin', plugin: 'test' }, content: [{ type: 'text', text: 'not a human goal' }],
    } } },
  ]), 1)
  assert.equal(projection.finished, true)
  assert.equal(projection.succeeded, true)
  assert.equal(projection.answer, '275 米缓冲区已完成并通过图层验证。')
  assert.deepEqual(JSON.parse(JSON.stringify(projection.steps)), [{
    id: 'call-1', name: 'create_buffer', title: 'Geo · create_buffer',
    arguments: { input_layer: 'layer_0001', distance: 275, unit: 'meter' },
    status: 'success', summary: 'Created a 275 m buffer.', outputs: ['layer_0002'],
  }])

  const failed = plugin.projectAgentHistory([{
    event: { type: 'turn/end', seq: 21, data: {
      turn: 3, reason: { kind: 'error', error: { message: 'Connection error.' } },
    } },
  }], 20)
  assert.equal(failed.finished, true)
  assert.equal(failed.succeeded, false)
  assert.match(failed.error, /Connection error.*LLM Provider.*API Key.*不会回退/u)
})

test('the Agent workspace RPC verifies and returns canonical live Registry projection', async () => {
  const { registerGeoRpc } = await import('../bundle/geoharness-bundle/host/rpc.js')
  let registration
  const projection = [{
    metadata: {
      layer_id: 'layer_0001', name: 'buildings', feature_count: 1,
      parents: [], source: 'scenario', generated_by: null,
    },
    geojson: { type: 'FeatureCollection', features: [{ type: 'Feature', geometry: { type: 'Point', coordinates: [0, 0] }, properties: {} }] },
  }]
  registerGeoRpc({
    connection: { rpc: { handle: (channel, handler, options) => { registration = { channel, handler, options }; return () => {} } } },
    geo: { execute: async request => {
      assert.deepEqual(request, { action: 'projection', workspaceKey: 'geoharness-main' })
      return projection
    } },
  })
  const response = await registration.handler('agent/workspace', { workspace_key: 'geoharness-main' })
  assert.equal(response.ok, true)
  assert.equal(response.value.status, 'ready')
  assert.deepEqual(response.value.checks, { feature_counts_match: true, parent_layers_present: true })
  assert.deepEqual(response.value.layers, projection)
})

test('the loopback Connection RPC exposes validated Scenario and goal-driven endpoints', async () => {
  const { registerGeoRpc } = await import('../bundle/geoharness-bundle/host/rpc.js')
  let registration
  const calls = []
  const ctx = {
    connection: { rpc: { handle: (channel, handler, options) => { registration = { channel, handler, options }; return async () => {} } } },
    taskGraph: {
      runScenario: async request => { calls.push(request); return { status: 'success' } },
      latest: (workspaceKey, scenarioId) => ({ workspaceKey, scenarioId }),
    },
  }
  registerGeoRpc(ctx)
  assert.equal(registration.channel, '/geoharness')
  assert.deepEqual(registration.options, { authority: 'loopback' })
  const signal = new AbortController().signal
  const run = await registration.handler('scenario/run', {
    scenario_id: '02-river-building-query', workspace_key: 'rpc-test',
  }, signal)
  assert.deepEqual(run, { ok: true, value: { status: 'success' } })
  assert.equal(calls[0].scenarioId, '02-river-building-query')
  assert.equal(calls[0].workspaceKey, 'rpc-test')
  assert.equal(calls[0].signal, signal)
  const goal = await registration.handler('goal/run', {
    goal_prompt: '找出距离主要道路 Broadway 275 米以内的建筑。', workspace_key: 'rpc-goal-test',
  }, signal)
  assert.equal(goal.ok, true)
  assert.equal(goal.value.goal_resolution.scenario_id, '05-parameter-revision')
  assert.equal(goal.value.goal_resolution.parameters.road_distance_m, 275)
  assert.equal(calls[1].scenarioId, '05-parameter-revision')
  assert.equal(calls[1].goal, '找出距离主要道路 Broadway 275 米以内的建筑。')
  assert.deepEqual(calls[1].parameterPatches, {
    buffer_major_roads: { distance: 275, unit: 'meter' },
  })
  const latest = await registration.handler('scenario/latest', {
    scenario_id: '02-river-building-query', workspace_key: 'rpc-test',
  }, signal)
  assert.equal(latest.ok, true)
  assert.deepEqual(latest.value, { workspaceKey: 'rpc-test', scenarioId: '02-river-building-query' })
  const invalid = await registration.handler('scenario/run', { scenario_id: '../unsafe' }, signal)
  assert.equal(invalid.ok, false)
  assert.equal(invalid.error.code, 'bad-request')
  const unsupported = await registration.handler('goal/run', {
    goal_prompt: '给我讲个故事', workspace_key: 'rpc-goal-test',
  }, signal)
  assert.equal(unsupported.ok, false)
  assert.match(unsupported.error.message, /supported GeoHarness v1\.0/)
})

test('the loopback RPC streams real Task Graph transitions through a workspace-scoped background job', async () => {
  const { registerGeoRpc } = await import('../bundle/geoharness-bundle/host/rpc.js')
  let registration
  let finishRun
  const calls = []
  const ctx = {
    connection: { rpc: { handle: (channel, handler, options) => { registration = { channel, handler, options }; return async () => {} } } },
    taskGraph: {
      runScenario: request => new Promise(resolve => {
        calls.push(request)
        request.onTransition({ sequence: 1, to: 'running' }, {
          scenario_id: '05-parameter-revision', status: 'running',
          steps: [{ id: 'inspect_buildings', status: 'running', outputs: [], resolved_outputs: [] }],
          run_history: [],
        })
        finishRun = resolve
      }),
      latest: () => null,
    },
  }
  registerGeoRpc(ctx)
  const payload = {
    goal_prompt: '找出距离主要道路 Broadway 275 米以内的建筑。',
    workspace_key: 'phase7-live-progress',
  }
  const start = await registration.handler('goal/start', payload, new AbortController().signal)
  assert.equal(start.ok, true)
  assert.equal(start.value.job_status, 'running')
  assert.equal(start.value.goal_resolution.parameters.road_distance_m, 275)
  await new Promise(resolve => setImmediate(resolve))

  const running = await registration.handler('scenario/progress', {
    scenario_id: '05-parameter-revision', workspace_key: payload.workspace_key,
  })
  assert.equal(running.ok, true)
  assert.equal(running.value.job_status, 'running')
  assert.equal(running.value.execution.steps[0].status, 'running')
  assert.equal('signal' in calls[0], false, 'detached jobs must not reuse the completed start RPC signal')
  const blocked = await registration.handler('goal/start', {
    goal_prompt: '找出距离 Hudson River 500 米以内的建筑。',
    workspace_key: payload.workspace_key,
  })
  assert.equal(blocked.ok, false)
  assert.match(blocked.error.message, /already running/)

  finishRun({
    scenario_id: '05-parameter-revision', status: 'success', steps: [], run_history: [{}],
    map_verification: { status: 'ready', checks: {}, issues: [], step_bindings: [], map_layers: [] },
  })
  await new Promise(resolve => setImmediate(resolve))
  const completed = await registration.handler('scenario/progress', {
    scenario_id: '05-parameter-revision', workspace_key: payload.workspace_key,
  })
  assert.equal(completed.ok, true)
  assert.equal(completed.value.job_status, 'success')
  assert.equal(completed.value.execution.map_verification.status, 'ready')
})
