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
