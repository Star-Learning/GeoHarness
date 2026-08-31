import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
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

test('one Native Agent turn restores verified Result Center statistics and safe exports', async t => {
  const temporary = await mkdtemp(join(tmpdir(), 'geoharness-platform-phase5-result-'))
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
  const sessionId = sessionApi.SessionId('platform-phase5-result-center')
  const session = ctx.sessions.create(sessionId)
  const buildingsPath = join(repositoryRoot, 'examples', 'scenarios', '01-building-data-inspection', 'data', 'buildings.geojson')
  const imported = await ctx.geo.execute({
    action: 'import_upload', workspaceKey: sessionId, file_name: 'buildings.geojson',
    content_base64: (await readFile(buildingsPath)).toString('base64'), name: 'User buildings',
  })

  session.append('user/message', llm.createUserMessage({
    source: { kind: 'user' },
    content: [{ type: 'text', text: '筛选 use=feature_code_2100 的建筑，统计 height_m，并导出 GeoJSON、GeoPackage 和 CSV。' }],
  }), { surfaceOp: 'append' })
  session.append('turn/start', { turn: 1 })
  session.append('request/header', {
    header: { config: { provider: 'phase5-provider', model: 'native-result-fixture' } }, reason: 'initial',
  })
  const results = {}
  const definitions = [
    { key: 'filtered', name: 'spatial_filter', args: { input_layer: imported.metadata.layer_id, where: { use: 'feature_code_2100' }, output_name: 'Filtered buildings' } },
    { key: 'statistics', name: 'analyze_distribution', args: () => ({ input_layer: results.filtered.outputs[0], fields: ['height_m'] }) },
    ...['geojson', 'gpkg', 'csv'].map(format => ({
      key: format,
      name: 'export_layer',
      args: () => ({ input_layer: results.filtered.outputs[0], format, file_name: `phase5-buildings.${format}` }),
    })),
  ]
  let step = 0
  for (const definition of definitions) {
    step += 1
    const args = typeof definition.args === 'function' ? definition.args() : definition.args
    const callId = llm.CallId(`phase5-call-${step}`)
    session.append('step/start', { turn: 1, step })
    session.append('tool/call', { turn: 1, step, callId, name: definition.name, arguments: JSON.stringify(args) })
    const outcome = await ctx.tools.execute({
      signal: new AbortController().signal,
      callId,
      name: definition.name,
      arguments: args,
      agent: { session },
    })
    assert.equal(outcome.value.success, true, outcome.value.summary)
    session.append('tool/result', {
      turn: 1,
      step,
      message: llm.createToolResultMessage({
        callId,
        content: [{ type: 'text', text: `Geo operation succeeded: ${outcome.value.summary}` }],
        isError: false,
      }),
      meta: {
        tool: outcome.value.tool,
        success: true,
        outputs: outcome.value.outputs,
        summary: outcome.value.summary,
        warnings: outcome.value.warnings,
        data: outcome.value.data,
      },
    }, { surfaceOp: 'append' })
    session.append('step/end', { turn: 1, step })
    results[definition.key] = outcome.value
  }
  step += 1
  session.append('step/start', { turn: 1, step })
  session.append('assistant/message', {
    turn: 1,
    step,
    message: llm.createAssistantMessage({
      source: { provider: 'phase5-provider', model: 'native-result-fixture' },
      content: [{ type: 'text', text: '筛选得到 357 栋建筑，统计与三种导出均已完成。' }],
    }),
  }, { surfaceOp: 'append' })
  session.append('step/end', { turn: 1, step })
  session.append('turn/end', { turn: 1, reason: { kind: 'completed' } })
  await ctx.sessions.flush(session)

  let registration
  GeoPlugin.registerGeoRpc({
    connection: { rpc: { handle: (_channel, handler) => { registration = { handler }; return () => {} } } },
    geo: ctx.geo,
  })
  const center = await registration.handler('result/center', { workspace_key: sessionId })
  assert.equal(center.ok, true, center.error?.message)
  assert.equal(center.value.final_answer, '筛选得到 357 栋建筑，统计与三种导出均已完成。')
  assert.deepEqual(center.value.tools, { total: 5, success: 5, failed: 0, running: 0 })
  assert.equal(center.value.input_layers[0].source, 'upload')
  assert.equal(center.value.output_layers[0].feature_count, 357)
  assert.equal(center.value.statistics.find(item => item.tool === 'spatial_filter').data.selected_count, 357)
  assert.equal(center.value.statistics.find(item => item.tool === 'analyze_distribution').data.statistics.height_m.count, 357)
  assert.equal(center.value.sources[0].detail, 'workspace import: buildings.geojson')
  assert.deepEqual(new Set(center.value.assets.map(asset => asset.format)), new Set(['geojson', 'gpkg', 'csv', 'json']))

  for (const asset of center.value.assets) {
    const response = await registration.handler('result/download', {
      workspace_key: sessionId, asset_type: asset.asset_type, asset_id: asset.asset_id,
    })
    assert.equal(response.ok, true, response.error?.message)
    const bytes = Buffer.from(response.value.content_base64, 'base64')
    assert.equal(bytes.length, asset.size_bytes)
    assert.equal(createHash('sha256').update(bytes).digest('hex'), response.value.sha256)
    if (asset.format === 'geojson') assert.equal(JSON.parse(bytes).features.length, 357)
    if (asset.format === 'gpkg') assert.equal(bytes.subarray(0, 16).toString(), 'SQLite format 3\0')
    if (asset.format === 'csv') assert.equal(bytes.toString('utf8').trim().split(/\r?\n/u).length, 358)
    if (asset.format === 'json') assert.equal(JSON.parse(bytes).run_id, 'run-turn-0001')
  }

  const rejected = await registration.handler('result/download', {
    workspace_key: sessionId, asset_type: 'export', asset_id: '../workspace.json',
  })
  assert.equal(rejected.ok, false)
  const isolated = await registration.handler('result/download', {
    workspace_key: 'another-session', asset_type: 'export', asset_id: center.value.assets[0].asset_id,
  })
  assert.equal(isolated.ok, false)
})

test('the native workspace renders an authoritative Result Center and indexed downloads', async () => {
  const client = await readFile(join(bundleRoot, 'src', 'client.tsx'), 'utf8')
  for (const marker of [
    "'result/center'", "'result/download'", 'RESULT CENTER · TURN', 'Verified Tool statistics',
    'result.final_answer', 'result.sources', 'result.crs', 'result.units', 'saveResultDownload',
  ]) assert.ok(client.includes(marker), `Result Center UI is missing ${marker}`)
  const styles = await readFile(join(bundleRoot, 'src', 'styles.css'), 'utf8')
  for (const selector of ['.gh-result-center', '.gh-result-statistics', '.gh-result-assets']) {
    assert.ok(styles.includes(selector), `Result Center styles are missing ${selector}`)
  }
})
