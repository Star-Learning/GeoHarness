import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'

import {
  GeoProviderTimeoutError,
  LocalPythonGeoProvider,
  workspaceIdFor,
} from '../bundle/geoharness-bundle/host/provider.js'
import { registerGeoRpc } from '../bundle/geoharness-bundle/host/rpc.js'

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const backendRoot = join(repositoryRoot, 'backend', 'geo-service')
const scenarioRoot = join(repositoryRoot, 'examples', 'scenarios')
const datasetRoot = join(repositoryRoot, 'examples', 'datasets')

function provider(options) {
  return new LocalPythonGeoProvider({
    backendRoot,
    scenarioRoot,
    datasetRoot,
    workspaceRoot: options.workspaceRoot,
    python: process.env.GEOHARNESS_PYTHON ?? 'python',
    requestTimeoutMs: options.requestTimeoutMs ?? 30_000,
  })
}

async function sleepingBackend(root) {
  const packageRoot = join(root, 'geoharness_geo')
  await mkdir(packageRoot, { recursive: true })
  await writeFile(join(packageRoot, '__init__.py'), '', 'utf8')
  await writeFile(join(packageRoot, 'runner.py'), [
    'import json, sys, time',
    'payload = json.loads(sys.stdin.buffer.read().decode("utf-8"))',
    'if payload.get("action") == "exit": raise SystemExit(7)',
    'time.sleep(10)',
    'print(json.dumps({"ok": True, "value": {"finished": True}}))',
    '',
  ].join('\n'), 'utf8')
}

test('provider timeout and AbortSignal terminate Python and emit bounded diagnostics', async t => {
  const temporary = await mkdtemp(join(tmpdir(), 'geoharness-provider-'))
  t.after(() => rm(temporary, { recursive: true, force: true }))
  const backend = join(temporary, 'backend')
  const scenarios = join(temporary, 'scenarios')
  const datasets = join(temporary, 'datasets')
  const workspaces = join(temporary, 'workspaces')
  await Promise.all([sleepingBackend(backend), mkdir(scenarios), mkdir(datasets), mkdir(workspaces)])

  const timeoutProvider = new LocalPythonGeoProvider({
    backendRoot: backend, scenarioRoot: scenarios, datasetRoot: datasets, workspaceRoot: workspaces,
    python: process.env.GEOHARNESS_PYTHON ?? 'python', requestTimeoutMs: 150,
  })
  await assert.rejects(
    timeoutProvider.execute({ action: 'sleep', workspaceKey: 'timeout-session' }),
    error => error instanceof GeoProviderTimeoutError && error.code === 'GEO_PROVIDER_TIMEOUT',
  )
  assert.equal(timeoutProvider.activeProcessCount(), 0)
  assert.equal(timeoutProvider.diagnostics('timeout-session').requests.at(-1).status, 'timeout')

  const abortProvider = new LocalPythonGeoProvider({
    backendRoot: backend, scenarioRoot: scenarios, datasetRoot: datasets, workspaceRoot: workspaces,
    python: process.env.GEOHARNESS_PYTHON ?? 'python', requestTimeoutMs: 5_000,
  })
  const controller = new AbortController()
  const operation = abortProvider.execute({ action: 'sleep', workspaceKey: 'abort-session' }, controller.signal)
  setTimeout(() => controller.abort(new Error('user cancelled GIS operation')), 150)
  await assert.rejects(operation, /user cancelled GIS operation/u)
  assert.equal(abortProvider.activeProcessCount(), 0)
  assert.equal(abortProvider.diagnostics('abort-session').requests.at(-1).status, 'aborted')

  await assert.rejects(
    abortProvider.execute({ action: 'exit', workspaceKey: 'exit-session' }),
    /invalid JSON \(exit 7\)/u,
  )
  assert.equal(abortProvider.activeProcessCount(), 0)
  assert.equal(abortProvider.diagnostics('exit-session').requests.at(-1).status, 'error')
})

test('colliding-looking Session ids map to isolated workspaces and run concurrently', async t => {
  const temporary = await mkdtemp(join(tmpdir(), 'geoharness-isolation-'))
  t.after(() => rm(temporary, { recursive: true, force: true }))
  const runtime = provider({ workspaceRoot: temporary })
  const colonSession = 'browser:alpha'
  const dashSession = 'browser-alpha'
  assert.notEqual(workspaceIdFor(colonSession), workspaceIdFor(dashSession))
  assert.notEqual(workspaceIdFor('CON'), 'CON')
  assert.notEqual(workspaceIdFor('session.'), 'session.')
  assert.notEqual(runtime.workspaceFor(colonSession), runtime.workspaceFor(dashSession))

  const [colon, dash] = await Promise.all([
    runtime.execute({ action: 'workspace_manifest', workspaceKey: colonSession }),
    runtime.execute({ action: 'workspace_manifest', workspaceKey: dashSession }),
  ])
  assert.equal(colon.session_id, colonSession)
  assert.equal(dash.session_id, dashSession)
  assert.notEqual(colon.workspace_id, dash.workspace_id)
  assert.equal(runtime.activeProcessCount(), 0)
  assert.equal(runtime.diagnostics(colonSession).requests.length, 1)
  assert.equal(runtime.diagnostics(dashSession).requests.length, 1)
})

test('same-Session requests serialize while independent Sessions can overlap', async () => {
  class ProbeProvider extends LocalPythonGeoProvider {
    active = new Map()
    maxByWorkspace = new Map()
    maxGlobal = 0

    available() { return true }

    async run(payload) {
      const key = payload.workspace_id
      this.active.set(key, (this.active.get(key) ?? 0) + 1)
      const global = [...this.active.values()].reduce((sum, value) => sum + value, 0)
      this.maxGlobal = Math.max(this.maxGlobal, global)
      this.maxByWorkspace.set(key, Math.max(this.maxByWorkspace.get(key) ?? 0, this.active.get(key)))
      await new Promise(resolvePromise => setTimeout(resolvePromise, 60))
      this.active.set(key, this.active.get(key) - 1)
      return { workspace_id: key }
    }
  }
  const runtime = new ProbeProvider({
    backendRoot, scenarioRoot, datasetRoot, workspaceRoot: repositoryRoot,
  })
  await Promise.all([
    runtime.execute({ action: 'probe-1', workspaceKey: 'same' }),
    runtime.execute({ action: 'probe-2', workspaceKey: 'same' }),
    runtime.execute({ action: 'probe-3', workspaceKey: 'other' }),
  ])
  assert.equal(runtime.maxByWorkspace.get('same'), 1)
  assert.equal(runtime.maxGlobal, 2)
})

test('RPC accepts truncated projections, pages Layer data and exports structured diagnostics', async () => {
  let handler
  const calls = []
  const manifest = {
    workspace_id: 'phase7', session_id: 'phase7', active_dataset: null, active_scenario: null,
    input_layers: [{ layer_id: 'layer_0001' }], derived_layers: [], imports: [], exports: [], runs: [],
    layer_preferences: {},
  }
  const projection = [{
    metadata: { layer_id: 'layer_0001', feature_count: 5, parents: [] },
    geojson: {
      type: 'FeatureCollection',
      features: [{ type: 'Feature', properties: {}, geometry: { type: 'Point', coordinates: [0, 0] } }],
      geoharness: { total_features: 5, returned_features: 1, truncated: true },
    },
  }]
  registerGeoRpc({
    geo: {
      async execute(request) {
        calls.push(request)
        if (request.action === 'projection') return projection
        if (request.action === 'workspace_manifest') return manifest
        if (request.action === 'geojson') return projection[0].geojson
        throw new Error(`Unexpected action ${request.action}`)
      },
      diagnostics: workspaceKey => ({ schema_version: '1.0', workspace_id: workspaceKey, requests: [] }),
    },
    connection: { rpc: { handle(_channel, callback) { handler = callback; return () => {} } } },
    taskGraph: {},
  })

  const workspace = await handler('agent/workspace', { workspace_key: 'phase7' })
  assert.equal(workspace.value.status, 'ready')
  const page = await handler('layer/geojson', {
    workspace_key: 'phase7', layer_id: 'layer_0001', offset: 2, limit: 25,
  })
  assert.equal(page.ok, true)
  assert.deepEqual(calls.at(-1), {
    action: 'geojson', workspaceKey: 'phase7', layer_id: 'layer_0001',
    offset: 2, limit: 25, max_bytes: 2 * 1024 * 1024,
  })

  const exported = await handler('diagnostics/export', { workspace_key: 'phase7' })
  assert.equal(exported.ok, true)
  const bytes = Buffer.from(exported.value.content_base64, 'base64')
  assert.equal(bytes.length, exported.value.size_bytes)
  assert.equal(createHash('sha256').update(bytes).digest('hex'), exported.value.sha256)
  const report = JSON.parse(bytes.toString('utf8'))
  assert.equal(report.workspace.input_layers, 1)
  assert.equal(report.geo_provider.workspace_id, 'phase7')
  assert.equal('workspace_root' in report, false)

  const source = await readFile(join(repositoryRoot, 'bundle', 'geoharness-bundle', 'src', 'client.tsx'), 'utf8')
  assert.match(source, /diagnostics\/export/u)
  assert.match(source, /导出结构化诊断/u)
})
