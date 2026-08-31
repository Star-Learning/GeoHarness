import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { pathToFileURL, fileURLToPath } from 'node:url'
import test from 'node:test'

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const bundleRoot = join(repositoryRoot, 'bundle', 'geoharness-bundle')
const requireFromBundle = createRequire(join(bundleRoot, 'package.json'))

async function importFromBundle(packageName) {
  return import(pathToFileURL(requireFromBundle.resolve(packageName)).href)
}

test('five conversational revision classes execute real Tools in one Native Session', async t => {
  const temporary = await mkdtemp(join(tmpdir(), 'geoharness-platform-phase4-revisions-'))
  t.after(() => rm(temporary, { recursive: true, force: true }))
  const [{ Context }, sessionApi, llm, { default: SystemPrompt }, { default: ToolRuntime }, GeoPlugin] = await Promise.all([
    importFromBundle('@deepseek-ai/cordis'),
    importFromBundle('@deepseek-ai/dsh-session'),
    importFromBundle('@deepseek-ai/dsh-llm'),
    importFromBundle('@deepseek-ai/dsh-system-prompt'),
    importFromBundle('@deepseek-ai/dsh-tools'),
    import('../bundle/geoharness-bundle/index.js'),
  ])
  const ctx = new Context()
  await ctx.plugin(sessionApi.default)
  await ctx.plugin(SystemPrompt)
  await ctx.plugin(ToolRuntime)
  await ctx.plugin(GeoPlugin, {
    workspaceRoot: temporary,
    backendRoot: join(repositoryRoot, 'backend', 'geo-service'),
    scenarioRoot: join(repositoryRoot, 'examples', 'scenarios'),
    datasetRoot: join(repositoryRoot, 'examples', 'datasets'),
  })

  const sessionId = sessionApi.SessionId('platform-phase4-five-revisions')
  const session = ctx.sessions.create(sessionId)
  const sourceRoot = join(repositoryRoot, 'examples', 'scenarios', '06-multi-constraint-selection', 'data')
  const imported = {}
  for (const name of ['buildings', 'roads', 'rivers']) {
    const value = await ctx.geo.execute({
      action: 'import_upload',
      workspaceKey: sessionId,
      file_name: `${name}.geojson`,
      content_base64: (await readFile(join(sourceRoot, `${name}.geojson`))).toString('base64'),
      name,
    })
    imported[name] = value.metadata.layer_id
  }

  let requestHeaderLogged = false
  let nextCall = 0
  async function runTurn(turn, goal, definitions, answer) {
    session.append('user/message', llm.createUserMessage({
      source: { kind: 'user' }, content: [{ type: 'text', text: goal }],
    }), { surfaceOp: 'append' })
    session.append('turn/start', { turn })
    const results = {}
    let step = 0
    for (const definition of definitions) {
      step += 1
      session.append('step/start', { turn, step })
      if (!requestHeaderLogged) {
        session.append('request/header', {
          header: { config: { provider: 'phase4-test-provider', model: 'native-session-fixture' } },
          reason: 'initial',
        })
        requestHeaderLogged = true
      }
      const args = typeof definition.args === 'function' ? definition.args(results) : definition.args
      const callId = llm.CallId(`phase4-call-${++nextCall}`)
      session.append('tool/call', {
        turn, step, callId, name: definition.name, arguments: JSON.stringify(args),
      })
      const outcome = await ctx.tools.execute({
        signal: new AbortController().signal,
        callId,
        name: definition.name,
        arguments: args,
        agent: { session },
      })
      assert.equal(outcome.value.success, true, `${definition.name}: ${outcome.value.summary}`)
      session.append('tool/result', {
        turn,
        step,
        message: llm.createToolResultMessage({
          callId,
          content: [{ type: 'text', text: `Geo operation succeeded: ${outcome.value.summary}` }],
          isError: false,
        }),
        meta: {
          tool: outcome.value.tool,
          success: outcome.value.success,
          outputs: outcome.value.outputs,
          summary: outcome.value.summary,
          warnings: outcome.value.warnings,
          data: outcome.value.data,
        },
      }, { surfaceOp: 'append' })
      session.append('step/end', { turn, step })
      results[definition.key] = outcome.value
    }
    step += 1
    session.append('step/start', { turn, step })
    session.append('assistant/message', {
      turn,
      step,
      message: llm.createAssistantMessage({
        source: { provider: 'phase4-test-provider', model: 'native-session-fixture' },
        content: [{ type: 'text', text: answer }],
      }),
    }, { surfaceOp: 'append' })
    session.append('step/end', { turn, step })
    session.append('turn/end', { turn, reason: { kind: 'completed' } })
    await ctx.sessions.flush(session)
    return results
  }

  const initial = await runTurn(1, '找出主要道路 275 米范围内且完全位于缓冲区内的建筑，并导出 GeoJSON。', [
    { key: 'major', name: 'spatial_filter', args: { input_layer: imported.roads, where: { road_class: 'major' }, output_name: 'major roads' } },
    { key: 'metric', name: 'transform_crs', args: results => ({ input_layer: results.major.outputs[0], target_crs: 'EPSG:32618', output_name: 'major roads metric' }) },
    { key: 'buffer', name: 'create_buffer', args: results => ({ input_layer: results.metric.outputs[0], distance: 275, unit: 'meter', output_name: 'major roads 275m' }) },
    { key: 'candidates', name: 'spatial_filter', args: results => ({ input_layer: imported.buildings, mask_layer: results.buffer.outputs[0], predicate: 'within', output_name: 'buildings within 275m' }) },
    { key: 'export', name: 'export_layer', args: results => ({ input_layer: results.candidates.outputs[0], format: 'geojson', file_name: 'buildings-within-275m.geojson' }) },
  ], '已按 275 米、within 谓词完成并导出 GeoJSON。')

  const distance = await runTurn(2, '把距离从 275 米改成 200 米，其余条件不变。', [
    { key: 'buffer', name: 'create_buffer', args: { input_layer: initial.metric.outputs[0], distance: 200, unit: 'meter', output_name: 'major roads 200m' } },
    { key: 'candidates', name: 'spatial_filter', args: results => ({ input_layer: imported.buildings, mask_layer: results.buffer.outputs[0], predicate: 'within', output_name: 'buildings within 200m' }) },
  ], '已复用主要道路米制图层，并按 200 米重新计算。')

  const predicate = await runTurn(3, '把空间谓词从 within 改为 intersects。', [
    { key: 'candidates', name: 'spatial_filter', args: { input_layer: imported.buildings, mask_layer: distance.buffer.outputs[0], predicate: 'intersects', output_name: 'buildings intersecting 200m' } },
  ], '已用 intersects 生成新的候选建筑图层。')

  const attribute = await runTurn(4, '道路属性筛选值改为 other_four_plus_lane。', [
    { key: 'roads', name: 'spatial_filter', args: { input_layer: imported.roads, where: { road_class: 'other_four_plus_lane' }, output_name: 'other four plus lane roads' } },
  ], '已按新的 road_class 属性值筛选道路。')

  const output = await runTurn(5, '输出格式从 GeoJSON 改为 CSV。', [
    { key: 'export', name: 'export_layer', args: { input_layer: predicate.candidates.outputs[0], format: 'csv', file_name: 'buildings-intersecting-200m.csv' } },
  ], '已把当前候选建筑结果导出为 CSV。')

  const appended = await runTurn(6, '在当前候选建筑上追加条件：排除 Hudson River 和 East River 800 米范围内的建筑。', [
    { key: 'metric', name: 'transform_crs', args: { input_layer: imported.rivers, target_crs: 'EPSG:32618', output_name: 'rivers metric' } },
    { key: 'buffer', name: 'create_buffer', args: results => ({ input_layer: results.metric.outputs[0], distance: 800, unit: 'meter', output_name: 'river exclusion 800m' }) },
    { key: 'candidates', name: 'spatial_filter', args: results => ({ input_layer: predicate.candidates.outputs[0], mask_layer: results.buffer.outputs[0], predicate: 'disjoint', output_name: 'road candidates outside river 800m' }) },
  ], '已在既有候选结果上追加 800 米河流排除条件。')

  assert.equal(initial.candidates.data.selected_count, 228)
  assert.equal(distance.candidates.data.selected_count, 188)
  assert.equal(predicate.candidates.data.selected_count, 205)
  assert.equal(attribute.roads.data.selected_count, 242)
  assert.equal(output.export.data.format, 'csv')
  assert.equal(appended.candidates.data.selected_count, 14)

  const runs = await ctx.geo.execute({ action: 'workspace_runs', workspaceKey: sessionId })
  assert.equal(runs.length, 6)
  assert.deepEqual(runs.map(run => run.status), Array(6).fill('success'))
  assert.deepEqual(runs.map(run => run.provider), Array(6).fill('phase4-test-provider'))
  assert.equal(runs[1].tool_calls[0].arguments.distance, 200)
  assert.equal(runs[2].tool_calls[0].arguments.predicate, 'intersects')
  assert.equal(runs[3].tool_calls[0].arguments.where.road_class, 'other_four_plus_lane')
  assert.equal(runs[4].tool_calls[0].arguments.format, 'csv')
  assert.ok(runs[5].reused_layers.includes(predicate.candidates.outputs[0]))
  assert.ok(runs[5].output_layers.includes(appended.candidates.outputs[0]))

  const manifest = await ctx.geo.execute({ action: 'workspace_manifest', workspaceKey: sessionId })
  assert.equal(manifest.active_dataset, null)
  assert.equal(manifest.active_scenario, null)
  assert.deepEqual(manifest.exports.map(asset => asset.format).sort(), ['csv', 'geojson'])
  const projection = await ctx.geo.execute({ action: 'projection', workspaceKey: sessionId })
  const canonicalIds = new Set(projection.map(item => item.metadata.layer_id))
  for (const run of runs) {
    for (const layerId of run.output_layers) assert.ok(canonicalIds.has(layerId), `${layerId} must be canonical`)
  }
})
