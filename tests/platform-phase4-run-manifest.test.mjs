import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { pathToFileURL, fileURLToPath } from 'node:url'
import test from 'node:test'

import { projectRunManifests } from '../bundle/geoharness-bundle/host/run-manifest.js'
import { LocalPythonGeoProvider } from '../bundle/geoharness-bundle/host/provider.js'

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const bundleRoot = join(repositoryRoot, 'bundle', 'geoharness-bundle')
const requireFromBundle = createRequire(join(bundleRoot, 'package.json'))

async function importFromBundle(packageName) {
  return import(pathToFileURL(requireFromBundle.resolve(packageName)).href)
}

function at(seq, type, data, time = Date.UTC(2026, 7, 31, 4, 0, seq)) {
  return { seq, type, data, time }
}

test('Native Harness events project to reasoning-free versioned Run Manifests', () => {
  const runs = projectRunManifests('native-session', [
    at(0, 'user/message', { source: { kind: 'user' }, content: [{ type: 'text', text: '把 275 米改成 200 米。' }] }),
    at(1, 'turn/start', { turn: 2 }),
    at(2, 'request/header', { header: { config: { provider: 'ustc', model: 'deepseek-v4' } }, reason: 'initial' }),
    at(3, 'assistant/chunk', { turn: 2, step: 1, chunk: { type: 'reasoning-delta', text: 'hidden reasoning' } }),
    at(4, 'tool/call', { turn: 2, step: 1, callId: 'call-buffer', name: 'create_buffer', arguments: JSON.stringify({ input_layer: 'layer_0001', distance: 200 }) }),
    at(5, 'tool/result', {
      turn: 2,
      step: 1,
      message: { source: { kind: 'tool', callId: 'call-buffer' }, content: [{ type: 'tool-result', content: [{ type: 'text', text: 'Created 200 m buffer' }] }] },
      meta: { success: true, summary: 'Created 200 m buffer', outputs: ['layer_0002'] },
    }),
    at(6, 'assistant/message', { turn: 2, step: 2, message: { content: [{ type: 'text', text: '已按 200 米重新计算。' }] } }),
    at(7, 'turn/end', { turn: 2, reason: { kind: 'completed' } }),
  ])

  assert.equal(runs.length, 1)
  assert.deepEqual(runs[0], {
    schema_version: '1.0',
    run_id: 'run-turn-0002',
    session_id: 'native-session',
    turn: 2,
    user_goal: '把 275 米改成 200 米。',
    user_event_seq: 0,
    started_at: '2026-08-31T04:00:01.000Z',
    finished_at: '2026-08-31T04:00:07.000Z',
    status: 'success',
    provider: 'ustc',
    model: 'deepseek-v4',
    max_event_seq: 7,
    tool_calls: [{
      call_id: 'call-buffer',
      name: 'create_buffer',
      status: 'success',
      event_seq: 4,
      result_event_seq: 5,
      arguments: { input_layer: 'layer_0001', distance: 200 },
      input_layers: ['layer_0001'],
      output_layers: ['layer_0002'],
      summary: 'Created 200 m buffer',
      warnings: [],
      result_data: {},
    }],
    input_layers: ['layer_0001'],
    output_layers: ['layer_0002'],
    reused_layers: ['layer_0001'],
    final_answer: { event_seq: 6, text: '已按 200 米重新计算。' },
    errors: [],
    retries: [],
  })
  assert.doesNotMatch(JSON.stringify(runs), /hidden reasoning/)
})

test('Run Manifest binds the real request when Harness starts a turn before appending user/message', () => {
  const runs = projectRunManifests('current-order-session', [
    at(0, 'turn/start', { turn: 1 }),
    at(1, 'user/message', { source: { kind: 'user' }, content: [{ type: 'text', text: '巡检第一处卫星影像。' }] }),
    at(2, 'tool/call', { turn: 1, step: 1, callId: 'inspect-1', name: 'inspect_satellite_view', arguments: '{}' }),
    at(3, 'tool/result', {
      turn: 1,
      step: 1,
      message: { source: { kind: 'tool', callId: 'inspect-1' }, content: [{ type: 'tool-result', content: [{ type: 'text', text: 'Inspected current view' }] }] },
      meta: { success: true, summary: 'Inspected current view', outputs: [], data: { classified_pixel_ratio: 0.81 } },
    }),
    at(4, 'turn/end', { turn: 1, reason: { kind: 'completed' } }),
    at(5, 'turn/start', { turn: 2 }),
    at(6, 'user/message', { source: { kind: 'user' }, content: [{ type: 'text', text: '巡检第二处卫星影像。' }] }),
    at(7, 'tool/call', { turn: 2, step: 1, callId: 'inspect-2', name: 'inspect_satellite_view', arguments: '{}' }),
    at(8, 'tool/result', {
      turn: 2,
      step: 1,
      message: { source: { kind: 'tool', callId: 'inspect-2' }, content: [{ type: 'tool-result', content: [{ type: 'text', text: 'Inspected revised view' }] }] },
      meta: { success: true, summary: 'Inspected revised view', outputs: [], data: { classified_pixel_ratio: 0.91 } },
    }),
    at(9, 'turn/end', { turn: 2, reason: { kind: 'completed' } }),
  ])

  assert.equal(runs.length, 2)
  assert.deepEqual(runs.map(run => [run.turn, run.user_event_seq, run.user_goal]), [
    [1, 1, '巡检第一处卫星影像。'],
    [2, 6, '巡检第二处卫星影像。'],
  ])
  assert.equal(runs[0].tool_calls[0].result_data.classified_pixel_ratio, 0.81)
  assert.equal(runs[1].tool_calls[0].result_data.classified_pixel_ratio, 0.91)
})

test('the mounted plugin persists a real Native Session Run and restores it through RPC', async t => {
  const temporary = await mkdtemp(join(tmpdir(), 'geoharness-platform-phase4-run-'))
  t.after(() => rm(temporary, { recursive: true, force: true }))
  const [{ Context }, { default: SessionStore, SessionId }, llm, { default: SystemPrompt }, { default: ToolRuntime }, GeoPlugin] = await Promise.all([
    importFromBundle('@deepseek-ai/cordis'),
    importFromBundle('@deepseek-ai/dsh-session'),
    importFromBundle('@deepseek-ai/dsh-llm'),
    importFromBundle('@deepseek-ai/dsh-system-prompt'),
    importFromBundle('@deepseek-ai/dsh-tools'),
    import('../bundle/geoharness-bundle/index.js'),
  ])
  const ctx = new Context()
  await ctx.plugin(SessionStore)
  await ctx.plugin(SystemPrompt)
  await ctx.plugin(ToolRuntime)
  await ctx.plugin(GeoPlugin, {
    workspaceRoot: temporary,
    backendRoot: join(repositoryRoot, 'backend', 'geo-service'),
    scenarioRoot: join(repositoryRoot, 'examples', 'scenarios'),
    datasetRoot: join(repositoryRoot, 'examples', 'datasets'),
  })
  await new Promise(resolvePromise => setImmediate(resolvePromise))

  const sessionId = SessionId('platform-phase4-native-session')
  let observedEvents = 0
  ctx.on('session/event', () => { observedEvents += 1 })
  const session = ctx.sessions.create(sessionId)
  session.append('user/message', llm.createUserMessage({
    source: { kind: 'user' },
    content: [{ type: 'text', text: '检查现有 Layer 并给出结果。' }],
  }), { surfaceOp: 'append' })
  session.append('turn/start', { turn: 1 })
  session.append('step/start', { turn: 1, step: 1 })
  session.append('request/header', {
    header: { config: { provider: 'mock-provider', model: 'mock-model' } },
    reason: 'initial',
  })
  session.append('tool/call', {
    turn: 1,
    step: 1,
    callId: llm.CallId('call-native-list'),
    name: 'list_layers',
    arguments: '{}',
  })
  session.append('tool/result', {
    turn: 1,
    step: 1,
    message: llm.createToolResultMessage({
      callId: llm.CallId('call-native-list'),
      content: [{ type: 'text', text: 'Geo operation succeeded: 0 layers.' }],
      isError: false,
    }),
    meta: { success: true, summary: '0 canonical layers', outputs: [] },
  }, { surfaceOp: 'append' })
  session.append('step/end', { turn: 1, step: 1 })
  session.append('step/start', { turn: 1, step: 2 })
  session.append('assistant/message', {
    turn: 1,
    step: 2,
    message: llm.createAssistantMessage({
      source: { provider: 'mock-provider', model: 'mock-model' },
      content: [{ type: 'text', text: '当前 Workspace 还没有图层。' }],
    }),
  }, { surfaceOp: 'append' })
  session.append('step/end', { turn: 1, step: 2 })
  session.append('turn/end', { turn: 1, reason: { kind: 'completed' } })
  await ctx.sessions.flush(session)
  assert.ok(observedEvents > 0)

  const persisted = await ctx.geo.execute({ action: 'workspace_runs', workspaceKey: sessionId })
  assert.equal(persisted.length, 1)
  assert.equal(persisted[0].status, 'success')
  assert.equal(persisted[0].provider, 'mock-provider')
  assert.equal(persisted[0].tool_calls[0].name, 'list_layers')
  assert.equal(persisted[0].final_answer.text, '当前 Workspace 还没有图层。')
  assert.equal('reasoning' in persisted[0], false)

  const { registerGeoRpc } = GeoPlugin
  let registration
  registerGeoRpc({
    connection: { rpc: { handle: (_channel, handler) => { registration = { handler }; return () => {} } } },
    geo: ctx.geo,
  })
  const response = await registration.handler('agent/runs', { workspace_key: sessionId })
  assert.equal(response.ok, true, response.error?.message)
  assert.equal(response.value[0].run_id, 'run-turn-0001')
})

test('Provider, Tool and Data failures remain explicitly classified', () => {
  const runs = projectRunManifests('failed-session', [
    at(0, 'user/message', { source: { kind: 'user' }, content: [{ type: 'text', text: '运行空间分析。' }] }),
    at(1, 'turn/start', { turn: 1 }),
    at(2, 'tool/call', { turn: 1, step: 1, callId: 'bad-layer', name: 'spatial_filter', arguments: '{"input_layer":"layer_9999"}' }),
    at(3, 'tool/result', {
      turn: 1, step: 1,
      message: { source: { callId: 'bad-layer' }, content: [{ type: 'tool-result', isError: true, content: [{ type: 'text', text: 'Unknown Layer layer_9999' }] }] },
      error: { code: 'LayerNotFoundError' },
    }),
    at(4, 'llm/retry', { turn: 1, step: 2, provider: 'remote', retry: 1, maxRetries: 3, failure: { code: 'TRANSPORT' } }),
    at(5, 'turn/end', { turn: 1, reason: { kind: 'error', error: { code: 'TRANSPORT', message: 'Connection error' } } }),
  ])
  assert.deepEqual(runs[0].errors.map(error => error.classification), ['data', 'provider'])
  assert.equal(runs[0].status, 'failed')
  assert.deepEqual(runs[0].retries, [{ event_seq: 4, provider: 'remote', code: 'TRANSPORT', retry: 1, max_retries: 3 }])
})

test('Provider serializes one Workspace while allowing independent Sessions to proceed', async t => {
  const temporary = await mkdtemp(join(tmpdir(), 'geoharness-platform-phase4-queue-'))
  t.after(() => rm(temporary, { recursive: true, force: true }))
  const provider = new LocalPythonGeoProvider({
    workspaceRoot: temporary,
    backendRoot: join(repositoryRoot, 'backend', 'geo-service'),
    scenarioRoot: join(repositoryRoot, 'examples', 'scenarios'),
    datasetRoot: join(repositoryRoot, 'examples', 'datasets'),
  })
  const started = []
  const releases = []
  provider.run = payload => new Promise(resolvePromise => {
    started.push(payload.session_id)
    releases.push(() => resolvePromise(payload.session_id))
  })

  const first = provider.execute({ action: 'workspace_manifest', workspaceKey: 'same-session' })
  await new Promise(resolvePromise => setImmediate(resolvePromise))
  const second = provider.execute({ action: 'workspace_runs', workspaceKey: 'same-session' })
  const independent = provider.execute({ action: 'workspace_manifest', workspaceKey: 'other-session' })
  await new Promise(resolvePromise => setImmediate(resolvePromise))
  assert.deepEqual(started, ['same-session', 'other-session'])
  releases[1]()
  assert.equal(await independent, 'other-session')
  releases[0]()
  assert.equal(await first, 'same-session')
  await new Promise(resolvePromise => setImmediate(resolvePromise))
  assert.deepEqual(started, ['same-session', 'other-session', 'same-session'])
  releases[2]()
  assert.equal(await second, 'same-session')
})

test('the Agent workspace renders persisted Run comparison without exposing reasoning', async () => {
  const client = await readFile(join(bundleRoot, 'src', 'client.tsx'), 'utf8')
  for (const marker of [
    "'agent/runs'", '运行历史', 'Executed', 'Reused', 'New outputs',
    'run.errors', 'run.tool_calls',
  ]) assert.ok(client.includes(marker), `Run history UI is missing ${marker}`)
  const styles = await readFile(join(bundleRoot, 'src', 'styles.css'), 'utf8')
  assert.ok(styles.includes('.gh-run-history'))
})
