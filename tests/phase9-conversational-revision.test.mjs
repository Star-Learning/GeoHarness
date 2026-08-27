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

test('Scenario 05 uses the real RPC and GeoPandas provider to revise 500 m to 200 m', async () => {
  const temporary = await mkdtemp(join(tmpdir(), 'geoharness-phase9-revision-'))
  try {
    const ctx = await setup(temporary)
    const { registerGeoRpc } = await import('../bundle/geoharness-bundle/host/rpc.js')
    let registration
    registerGeoRpc({
      connection: {
        rpc: {
          handle: (channel, handler, options) => {
            registration = { channel, handler, options }
            return async () => {}
          },
        },
      },
      taskGraph: ctx.taskGraph,
    })
    assert.equal(registration.channel, '/geoharness')
    assert.deepEqual(registration.options, { authority: 'loopback' })

    const workspaceKey = 'phase9-revision'
    const expected = JSON.parse(await readFile(join(scenarioRoot, scenarioId, 'expected-result.json'), 'utf8'))
    const signal = new AbortController().signal
    const initialResponse = await registration.handler('scenario/run', {
      scenario_id: scenarioId,
      workspace_key: workspaceKey,
    }, signal)
    assert.equal(initialResponse.ok, true)
    const initial = initialResponse.value
    assert.equal(initial.steps.find(step => step.id === 'filter_candidate_buildings').result.data.selected_count, expected.expected.initial_candidate_count)
    assert.equal(initial.run_history.length, 1)
    assert.equal(initial.run_history[0].kind, 'initial')
    const initialLayers = { ...initial.layers }

    const revisionPrompt = (await readFile(join(scenarioRoot, scenarioId, 'revision-prompt.txt'), 'utf8')).trim()
    assert.equal(revisionPrompt, '改成 200 米。')
    const revisedResponse = await registration.handler('scenario/revise/start', {
      scenario_id: scenarioId,
      workspace_key: workspaceKey,
      revision_prompt: revisionPrompt,
    }, signal)
    assert.equal(revisedResponse.ok, true)
    assert.equal(revisedResponse.value.job_status, 'running')
    const observedRevisionSuccessCounts = new Set()
    let revised
    for (let attempt = 0; attempt < 600; attempt += 1) {
      const progress = await registration.handler('scenario/progress', {
        scenario_id: scenarioId,
        workspace_key: workspaceKey,
      })
      assert.equal(progress.ok, true)
      if (progress.value.execution?.steps !== undefined) {
        observedRevisionSuccessCounts.add(progress.value.execution.steps.filter(step => step.status === 'success').length)
      }
      if (progress.value.job_status === 'failed') assert.fail(progress.value.error)
      if (progress.value.job_status === 'success') {
        revised = progress.value.execution
        break
      }
      await new Promise(resolve => setTimeout(resolve, 30))
    }
    assert.notEqual(revised, undefined, 'background revision did not complete')
    assert.ok(observedRevisionSuccessCounts.size >= 2, 'revision steps did not complete progressively')

    assert.equal(revised.status, 'success')
    assert.equal(revised.map_verification.status, 'ready')
    assert.equal(revised.steps.find(step => step.id === 'filter_candidate_buildings').result.data.selected_count, expected.expected.revised_candidate_count)
    assert.equal(revised.steps.find(step => step.id === 'buffer_major_roads').result.parameters.distance_m, 200)
    assert.equal(revised.steps.find(step => step.id === 'buffer_major_roads').title, 'Create 200 m road buffer')
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
    assert.equal(newBuffer.metadata.parameters.distance_m, 200)
    assert.equal(candidate.active, true)
    assert.equal(candidate.geojson.features.length, 205)

    const oracle = await ctx.geo.execute({
      action: 'regression', workspaceKey, scenario_id: scenarioId, layer_aliases: revised.layers,
    })
    assert.equal(oracle.statistics.revised_candidate_count, 205)
    assert.equal(oracle.statistics.revised_buffer_distance_m, 200)
    assert.equal(oracle.checks.all_revised_candidates_within_200m, true)
    assert.ok(Object.values(oracle.checks).every(Boolean))
  } finally {
    await rm(temporary, { recursive: true, force: true })
  }
})

test('a nonpreset 275 m user goal runs once with real official data and no hidden 500 m execution', async () => {
  const temporary = await mkdtemp(join(tmpdir(), 'geoharness-phase9-goal-'))
  try {
    const ctx = await setup(temporary)
    const { registerGeoRpc } = await import('../bundle/geoharness-bundle/host/rpc.js')
    let registration
    registerGeoRpc({
      connection: {
        rpc: {
          handle: (channel, handler, options) => {
            registration = { channel, handler, options }
            return async () => {}
          },
        },
      },
      taskGraph: ctx.taskGraph,
    })

    const prompt = '找出距离主要道路 Broadway 275 米以内的建筑。'
    const workspaceKey = 'phase9-goal-275m'
    const response = await registration.handler('goal/start', {
      goal_prompt: prompt,
      workspace_key: workspaceKey,
    }, new AbortController().signal)
    assert.equal(response.ok, true)
    assert.equal(response.value.job_status, 'running')
    assert.equal(response.value.goal_resolution.parameters.road_distance_m, 275)
    const observedSuccessCounts = new Set([0])
    const observedPreviewLayerCounts = new Set([0])
    let observedLivePreview = false
    let execution
    for (let attempt = 0; attempt < 600; attempt += 1) {
      const progress = await registration.handler('scenario/progress', {
        scenario_id: scenarioId,
        workspace_key: workspaceKey,
      })
      assert.equal(progress.ok, true)
      if (progress.value.execution?.steps !== undefined) {
        observedSuccessCounts.add(progress.value.execution.steps.filter(step => step.status === 'success').length)
      }
      if (progress.value.map_preview !== null) {
        const derivedPreviewCount = progress.value.map_preview.map_layers.filter(layer =>
          layer.active && layer.metadata.source === 'derived').length
        observedPreviewLayerCounts.add(derivedPreviewCount)
        if (progress.value.job_status === 'running' && derivedPreviewCount > 0) observedLivePreview = true
      }
      if (progress.value.job_status === 'failed') assert.fail(progress.value.error)
      if (progress.value.job_status === 'success') {
        execution = progress.value.execution
        break
      }
      await new Promise(resolve => setTimeout(resolve, 30))
    }
    assert.notEqual(execution, undefined, 'background GIS job did not complete')
    assert.ok(observedSuccessCounts.size >= 3, `expected progressive step completion, saw ${[...observedSuccessCounts]}`)
    assert.ok([...observedPreviewLayerCounts].some(count => count > 0), 'expected a real derived Layer preview before completion')
    assert.equal(observedLivePreview, true, 'expected a verified derived Layer while later GIS steps were still running')
    assert.equal(execution.goal, prompt)
    assert.equal(response.value.goal_resolution.scenario_id, scenarioId)
    assert.equal(response.value.goal_resolution.parameters.road_distance_m, 275)
    assert.equal(execution.run_history.length, 1)
    assert.equal(execution.run_history[0].kind, 'initial')
    assert.deepEqual(execution.run_history[0].executed_steps, [
      'inspect_buildings', 'filter_major_roads', 'transform_major_roads',
      'buffer_major_roads', 'filter_candidate_buildings',
    ])

    const bufferStep = execution.steps.find(step => step.id === 'buffer_major_roads')
    const candidateStep = execution.steps.find(step => step.id === 'filter_candidate_buildings')
    assert.equal(bufferStep.parameters.distance, 275)
    assert.equal(bufferStep.resolved_parameters.distance, 275)
    assert.equal(bufferStep.result.parameters.distance_m, 275)
    assert.equal(bufferStep.title, 'Create 275 m road buffer')
    const activeBuffers = execution.map_verification.map_layers.filter(layer =>
      layer.active && layer.aliases.includes('major_road_buffer'))
    assert.equal(activeBuffers.length, 1)
    assert.equal(activeBuffers[0].metadata.parameters.distance_m, 275)

    const oracle = await ctx.geo.execute({
      action: 'regression', workspaceKey, scenario_id: scenarioId, layer_aliases: execution.layers,
    })
    assert.equal(oracle.statistics.current_buffer_distance_m, 275)
    assert.equal(oracle.statistics.current_candidate_count, 241)
    assert.equal(candidateStep.result.data.selected_count, 241)
    assert.equal(candidateStep.result.data.selected_count, oracle.statistics.current_candidate_count)
    assert.equal(oracle.checks.all_current_candidates_within_distance, true)
    assert.equal(oracle.checks.all_revised_candidates_within_distance, true)
    assert.ok(Object.values(oracle.checks).every(Boolean))
  } finally {
    await rm(temporary, { recursive: true, force: true })
  }
})

test('the conversational RPC parses bounded distance revisions and rejects out-of-scope requests', async () => {
  const {
    parseDistanceMentions, parseDistanceRevision, registerGeoRpc, resolveGeoGoal,
  } = await import('../bundle/geoharness-bundle/host/rpc.js')
  assert.equal(parseDistanceRevision('改成 1 公里。'), 1000)
  assert.equal(parseDistanceRevision('改成 200 米。'), 200)
  assert.equal(parseDistanceRevision('Use 750 m instead'), 750)
  assert.equal(parseDistanceRevision('no distance here'), null)
  assert.equal(parseDistanceRevision('改成 1000 公里'), null)
  assert.deepEqual(parseDistanceMentions('道路 275 米以内，河流至少 1 公里').map(item => item.distance), [275, 1000])
  assert.deepEqual(resolveGeoGoal('找出距离主要道路 Broadway 275 米以内的建筑。'), {
    scenarioId: '05-parameter-revision',
    parameterPatches: { buffer_major_roads: { distance: 275, unit: 'meter' } },
    parameters: { road_distance_m: 275 },
  })
  assert.equal(resolveGeoGoal('找出 Broadway 1000 公里内的建筑'), null)
  assert.equal(resolveGeoGoal('找出 Broadway -1 米内的建筑'), null)
  assert.equal(resolveGeoGoal('给我讲个故事'), null)

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
    revision_prompt: '改成 200 米。',
  }, signal)
  assert.equal(accepted.ok, true)
  assert.deepEqual(revisions[0].parameterPatch, { distance: 200, unit: 'meter' })
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
  assert.match(client, /goal\/start/)
  assert.match(client, /scenario\/progress/)
  assert.match(client, /scenario\/revise\/start/)
  assert.match(client, /revisionPrompt/)
  assert.match(client, /goal_resolution/)
  assert.match(client, /priority: -100/)
  assert.match(client, /rerun.*reused/)
})
