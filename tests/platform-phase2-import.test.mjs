import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { pathToFileURL, fileURLToPath } from 'node:url'
import test from 'node:test'

import { HARD_UPLOAD_BYTES, LocalPythonGeoProvider } from '../bundle/geoharness-bundle/host/provider.js'

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const bundleRoot = join(repositoryRoot, 'bundle', 'geoharness-bundle')
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
    scenarioRoot: join(repositoryRoot, 'examples', 'scenarios'),
    datasetRoot: join(repositoryRoot, 'examples', 'datasets'),
  })
  return ctx
}

async function execute(ctx, sessionId, name, args, callId) {
  return ctx.tools.execute({
    signal: new AbortController().signal,
    callId,
    name,
    arguments: args,
    agent: { session: { id: sessionId } },
  })
}

test('loopback upload makes real user layers discoverable for a nonpreset 275 m Agent workflow', async () => {
  const temporary = await mkdtemp(join(tmpdir(), 'geoharness-platform-phase2-'))
  try {
    const ctx = await setup(temporary)
    const { registerGeoRpc } = await import('../bundle/geoharness-bundle/host/rpc.js')
    let registration
    registerGeoRpc({
      connection: { rpc: { handle: (channel, handler, options) => { registration = { channel, handler, options }; return () => {} } } },
      geo: ctx.geo,
      taskGraph: ctx.taskGraph,
    })
    assert.equal(registration.channel, '/geoharness')
    assert.deepEqual(registration.options, { authority: 'loopback' })
    const sessionId = 'platform-phase2-user-data'
    const capabilities = await registration.handler('data/import-capabilities', { workspace_key: sessionId })
    assert.equal(capabilities.ok, true)
    assert.equal(capabilities.value.max_file_bytes, 20 * 1024 * 1024)
    assert.deepEqual(capabilities.value.formats, ['geojson', 'shapefile_zip', 'gpkg', 'csv_lon_lat'])

    for (const name of ['buildings', 'roads']) {
      const source = join(
        repositoryRoot, 'examples', 'scenarios', '05-parameter-revision', 'data', `${name}.geojson`,
      )
      const response = await registration.handler('data/import', {
        workspace_key: sessionId,
        file_name: `${name}.geojson`,
        content_base64: (await readFile(source)).toString('base64'),
        name,
      })
      assert.equal(response.ok, true, response.error?.message)
      assert.equal(response.value.metadata.source, 'upload')
      assert.equal(response.value.metadata.name, name)
      assert.equal(response.value.format, 'geojson')
      assert.ok(!('content_base64' in response.value))
    }

    const listed = await execute(ctx, sessionId, 'list_layers', {}, 'phase2-list')
    assert.equal(listed.value.success, true)
    const byName = Object.fromEntries(listed.value.data.layers.map(layer => [layer.name, layer.layer_id]))
    assert.deepEqual(Object.keys(byName), ['buildings', 'roads'])

    const majorRoads = await execute(ctx, sessionId, 'spatial_filter', {
      input_layer: byName.roads,
      where: { road_class: 'major' },
      output_name: 'major_roads',
    }, 'phase2-road-filter')
    const transformed = await execute(ctx, sessionId, 'transform_crs', {
      input_layer: majorRoads.value.outputs[0],
      target_crs: 'EPSG:32618',
      output_name: 'roads_metric',
    }, 'phase2-transform')
    const buffered = await execute(ctx, sessionId, 'create_buffer', {
      input_layer: transformed.value.outputs[0],
      distance: 275,
      unit: 'meter',
      output_name: 'roads_275m_buffer',
    }, 'phase2-buffer')
    const filtered = await execute(ctx, sessionId, 'spatial_filter', {
      input_layer: byName.buildings,
      mask_layer: buffered.value.outputs[0],
      predicate: 'intersects',
      output_name: 'buildings_within_275m',
    }, 'phase2-filter')
    assert.equal(filtered.value.success, true)
    assert.equal(buffered.value.parameters.distance_m, 275)
    assert.equal(filtered.value.data.selected_count, 241)

    const projection = await registration.handler('agent/workspace', { workspace_key: sessionId })
    assert.equal(projection.ok, true)
    assert.equal(projection.value.status, 'ready')
    assert.equal(projection.value.layers.length, 6)
    const manifest = await ctx.geo.execute({ action: 'workspace_manifest', workspaceKey: sessionId })
    assert.equal(manifest.active_dataset, null)
    assert.equal(manifest.active_scenario, null)
    assert.equal(manifest.imports.length, 2)
    assert.equal(manifest.input_layers.length, 2)
    assert.equal(manifest.derived_layers.length, 4)
  } finally {
    await rm(temporary, { recursive: true, force: true })
  }
})

test('upload RPC rejects path-like names and malformed payloads before the Python provider', async () => {
  const { registerGeoRpc } = await import('../bundle/geoharness-bundle/host/rpc.js')
  let registration
  let providerCalls = 0
  registerGeoRpc({
    connection: { rpc: { handle: (_channel, handler) => { registration = { handler }; return () => {} } } },
    geo: { execute: async () => { providerCalls += 1; return {} } },
  })
  for (const payload of [
    { workspace_key: 'secure', file_name: '../escape.geojson', content_base64: 'e30=' },
    { workspace_key: 'secure', file_name: 'C:\\escape.gpkg', content_base64: 'e30=' },
    { workspace_key: 'secure', file_name: 'data.geojson', content_base64: '' },
    { workspace_key: 'secure', file_name: 'data.exe', content_base64: 'e30=' },
  ]) {
    const response = await registration.handler('data/import', payload)
    assert.equal(response.ok, false)
    assert.equal(response.error.code, 'bad-request')
  }
  assert.equal(providerCalls, 0)
})

test('the native Harness conversation surface owns a format-aware upload dialog and progress state', async () => {
  const source = await readFile(join(bundleRoot, 'src', 'client.tsx'), 'utf8')
  for (const marker of [
    '导入矢量数据', 'data/import-capabilities', "'data/import'", 'readFileAsBase64',
    '.geojson,.json,.zip,.gpkg,.csv', 'longitudeField', 'latitudeField', 'sourceLayer',
    "setImportPhase('reading')", "setImportPhase('uploading')", "setImportPhase('success')",
    'layerWorkspace.project(sessionId, workspace.layers, workspace.preferences ?? {})',
  ]) assert.ok(source.includes(marker), `upload UI is missing ${marker}`)
  assert.doesNotMatch(source, /sessions\.(?:prompt|create|models)|registerUploadedLayer\(/u)

  const styles = await readFile(join(bundleRoot, 'src', 'styles.css'), 'utf8')
  for (const selector of ['.gh-import-button', '.gh-import-dialog', '.gh-import-progress', '.gh-import-summary']) {
    assert.ok(styles.includes(selector), `upload UI is missing ${selector}`)
  }
})

test('Provider upload limit is configurable below a fixed hard ceiling', async () => {
  const temporary = await mkdtemp(join(tmpdir(), 'geoharness-platform-phase2-limit-'))
  try {
    const options = {
      workspaceRoot: temporary,
      backendRoot: join(repositoryRoot, 'backend', 'geo-service'),
      scenarioRoot: join(repositoryRoot, 'examples', 'scenarios'),
      datasetRoot: join(repositoryRoot, 'examples', 'datasets'),
      uploadMaxBytes: 1024,
    }
    const provider = new LocalPythonGeoProvider(options)
    const capabilities = await provider.execute({ action: 'import_capabilities', workspaceKey: 'limit-test' })
    assert.equal(capabilities.max_file_bytes, 1024)
    await assert.rejects(provider.execute({
      action: 'import_upload',
      workspaceKey: 'limit-test',
      file_name: 'oversize.geojson',
      content_base64: Buffer.alloc(1025, 65).toString('base64'),
    }), /exceeds the configured 1024 byte limit/)
    const manifest = await provider.execute({ action: 'workspace_manifest', workspaceKey: 'limit-test' })
    assert.deepEqual(manifest.imports, [])
    assert.deepEqual(manifest.input_layers, [])
    assert.throws(() => new LocalPythonGeoProvider({ ...options, uploadMaxBytes: HARD_UPLOAD_BYTES + 1 }), /uploadMaxBytes/)
  } finally {
    await rm(temporary, { recursive: true, force: true })
  }
})
