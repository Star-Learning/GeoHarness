import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { pathToFileURL, fileURLToPath } from 'node:url'
import test from 'node:test'

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const bundleRoot = join(repositoryRoot, 'bundle', 'geoharness-bundle')
const scenarioRoot = join(repositoryRoot, 'examples', 'scenarios')
const scenarioId = '05-parameter-revision'
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

test('Scenario 05 revises 500 m to 1 km and reruns only the affected downstream steps', async () => {
  const temporary = await mkdtemp(join(tmpdir(), 'geoharness-phase9-revision-'))
  try {
    const ctx = await setup(temporary)
    const workspaceKey = 'phase9-revision'
    const expected = JSON.parse(await readFile(join(scenarioRoot, scenarioId, 'expected-result.json'), 'utf8'))
    const initial = await ctx.taskGraph.runScenario({ scenarioId, workspaceKey })
    assert.equal(initial.steps.find(step => step.id === 'filter_candidate_buildings').result.data.selected_count, expected.expected.initial_candidate_count)
    assert.equal(initial.run_history.length, 1)
    assert.equal(initial.run_history[0].kind, 'initial')
    const initialLayers = { ...initial.layers }

    const revisionPrompt = (await readFile(join(scenarioRoot, scenarioId, 'revision-prompt.txt'), 'utf8')).trim()
    assert.equal(revisionPrompt, '改成 1 公里。')
    const revised = await ctx.taskGraph.reviseScenario({
      scenarioId,
      workspaceKey,
      stepId: 'buffer_major_roads',
      parameterPatch: { distance: 1000, unit: 'meter' },
      reason: revisionPrompt,
    })

    assert.equal(revised.status, 'success')
    assert.equal(revised.map_verification.status, 'ready')
    assert.equal(revised.steps.find(step => step.id === 'filter_candidate_buildings').result.data.selected_count, expected.expected.revised_candidate_count)
    assert.equal(revised.steps.find(step => step.id === 'buffer_major_roads').result.parameters.distance_m, 1000)
    assert.equal(revised.run_history.length, expected.expected.retained_history_entries)
    assert.deepEqual(revised.run_history[1].executed_steps, ['buffer_major_roads', 'filter_candidate_buildings'])
    assert.deepEqual(revised.run_history[1].reused_steps, ['inspect_buildings', 'filter_major_roads', 'transform_major_roads'])
    assert.equal(revised.run_history[1].reason, revisionPrompt)

    assert.equal(revised.layers.major_roads, initialLayers.major_roads)
    assert.equal(revised.layers.major_roads_metric, initialLayers.major_roads_metric)
    assert.notEqual(revised.layers.major_road_buffer, initialLayers.major_road_buffer)
    assert.notEqual(revised.layers.candidate_buildings, initialLayers.candidate_buildings)
    assert.deepEqual(revised.revision.affected_steps, ['buffer_major_roads', 'filter_candidate_buildings'])
    assert.deepEqual(
      revised.revision.invalidated_outputs.map(output => output.layer_id),
      [initialLayers.major_road_buffer, initialLayers.candidate_buildings],
    )

    const oldBuffer = revised.map_verification.map_layers.find(layer => layer.layer_id === initialLayers.major_road_buffer)
    const newBuffer = revised.map_verification.map_layers.find(layer => layer.layer_id === revised.layers.major_road_buffer)
    const candidate = revised.map_verification.map_layers.find(layer => layer.layer_id === revised.layers.candidate_buildings)
    assert.equal(oldBuffer.active, false)
    assert.equal(oldBuffer.checks.lineage_matches, true)
    assert.equal(newBuffer.active, true)
    assert.equal(newBuffer.metadata.parameters.distance_m, 1000)
    assert.equal(candidate.active, true)
    assert.equal(candidate.geojson.features.length, 8)

    const oracle = await ctx.geo.execute({
      action: 'regression', workspaceKey, scenario_id: scenarioId, layer_aliases: revised.layers,
    })
    assert.equal(oracle.statistics.revised_candidate_count, 8)
    assert.equal(oracle.statistics.revised_buffer_distance_m, 1000)
    assert.ok(Object.values(oracle.checks).every(Boolean))
  } finally {
    await rm(temporary, { recursive: true, force: true })
  }
})

test('the conversational RPC parses bounded distance revisions and rejects out-of-scope requests', async () => {
  const { parseDistanceRevision, registerGeoRpc } = await import('../bundle/geoharness-bundle/host/rpc.js')
  assert.equal(parseDistanceRevision('改成 1 公里。'), 1000)
  assert.equal(parseDistanceRevision('Use 750 m instead'), 750)
  assert.equal(parseDistanceRevision('no distance here'), null)
  assert.equal(parseDistanceRevision('改成 1000 公里'), null)

  let registration
  const revisions = []
  const ctx = {
    connection: { rpc: { handle: (channel, handler, options) => { registration = { channel, handler, options }; return async () => {} } } },
    taskGraph: {
      reviseScenario: async request => { revisions.push(request); return { status: 'success', run_history: [{}, {}] } },
      runScenario: async () => ({ status: 'success' }),
      latest: () => null,
    },
  }
  registerGeoRpc(ctx)
  const signal = new AbortController().signal
  const accepted = await registration.handler('scenario/revise', {
    scenario_id: scenarioId,
    workspace_key: 'phase9-rpc',
    revision_prompt: '改成 1 公里。',
  }, signal)
  assert.equal(accepted.ok, true)
  assert.deepEqual(revisions[0].parameterPatch, { distance: 1000, unit: 'meter' })
  assert.equal(revisions[0].stepId, 'buffer_major_roads')

  const badDistance = await registration.handler('scenario/revise', {
    scenario_id: scenarioId, workspace_key: 'phase9-rpc', revision_prompt: '更远一点',
  }, signal)
  assert.equal(badDistance.ok, false)
  const wrongScenario = await registration.handler('scenario/revise', {
    scenario_id: '02-river-building-query', workspace_key: 'phase9-rpc', revision_prompt: '1 km',
  }, signal)
  assert.equal(wrongScenario.ok, false)

  const client = await readFile(join(bundleRoot, 'client.js'), 'utf8')
  assert.match(client, /scenario\/revise/)
  assert.match(client, /revisionPrompt/)
  assert.match(client, /rerun.*reused/)
})
