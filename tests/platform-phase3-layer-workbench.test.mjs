import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'

import { LocalPythonGeoProvider } from '../bundle/geoharness-bundle/host/provider.js'

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')

function provider(workspaceRoot) {
  return new LocalPythonGeoProvider({
    workspaceRoot,
    backendRoot: join(repositoryRoot, 'backend', 'geo-service'),
    scenarioRoot: join(repositoryRoot, 'examples', 'scenarios'),
    datasetRoot: join(repositoryRoot, 'examples', 'datasets'),
  })
}

function register(providerInstance) {
  let registration
  return import('../bundle/geoharness-bundle/host/rpc.js').then(({ registerGeoRpc }) => {
    registerGeoRpc({
      connection: { rpc: { handle: (channel, handler, options) => {
        registration = { channel, handler, options }
        return () => {}
      } } },
      geo: providerInstance,
    })
    return registration
  })
}

test('Layer workbench RPC reads canonical data and persists rename, preferences and safe removal', async t => {
  const temporary = await mkdtemp(join(tmpdir(), 'geoharness-platform-phase3-'))
  t.after(() => rm(temporary, { recursive: true, force: true }))
  const sessionId = 'platform-phase3-layer-workbench'
  const initialProvider = provider(temporary)
  const rpc = await register(initialProvider)
  const source = join(
    repositoryRoot, 'examples', 'scenarios', '01-building-data-inspection', 'data', 'buildings.geojson',
  )
  const imported = await rpc.handler('data/import', {
    workspace_key: sessionId,
    file_name: 'buildings.geojson',
    content_base64: (await readFile(source)).toString('base64'),
    name: 'buildings',
  })
  assert.equal(imported.ok, true, imported.error?.message)
  const sourceLayer = imported.value.metadata.layer_id

  const details = await rpc.handler('layer/details', {
    workspace_key: sessionId,
    layer_id: sourceLayer,
  })
  assert.equal(details.ok, true, details.error?.message)
  assert.equal(details.value.metadata.feature_count, 360)
  assert.equal(details.value.preview.returned_rows, 100)
  assert.equal(details.value.preview.rows_truncated, true)
  assert.ok(details.value.fields.some(field => field.name === 'name'))
  assert.equal(details.value.rows[0].__row_index, 0)

  const renamed = await rpc.handler('layer/rename', {
    workspace_key: sessionId,
    layer_id: sourceLayer,
    name: 'NYC user buildings',
  })
  assert.equal(renamed.ok, true, renamed.error?.message)
  const preference = await rpc.handler('layer/preference', {
    workspace_key: sessionId,
    layer_id: sourceLayer,
    visible: false,
    opacity: 0.3,
  })
  assert.equal(preference.ok, true, preference.error?.message)

  const transformed = await initialProvider.execute({
    action: 'tool',
    workspaceKey: sessionId,
    tool: 'transform_crs',
    step_id: 'phase3-transform',
    parameters: { input_layer: sourceLayer, target_crs: 'EPSG:32618', output_name: 'buildings metric' },
  })
  assert.equal(transformed.success, true)
  const derivedLayer = transformed.outputs[0]

  const protectedRemoval = await rpc.handler('layer/remove', {
    workspace_key: sessionId,
    layer_id: sourceLayer,
  })
  assert.equal(protectedRemoval.ok, false)
  assert.match(protectedRemoval.error.message, /derived Layers depend on it/)

  const recreatedRpc = await register(provider(temporary))
  const restored = await recreatedRpc.handler('agent/workspace', { workspace_key: sessionId })
  assert.equal(restored.ok, true, restored.error?.message)
  assert.equal(restored.value.status, 'ready')
  assert.equal(restored.value.layers.find(item => item.metadata.layer_id === sourceLayer).metadata.name, 'NYC user buildings')
  assert.deepEqual(restored.value.preferences[sourceLayer], { visible: false, opacity: 0.3 })

  const removedDerived = await recreatedRpc.handler('layer/remove', {
    workspace_key: sessionId,
    layer_id: derivedLayer,
  })
  assert.equal(removedDerived.ok, true, removedDerived.error?.message)
  const removedSource = await recreatedRpc.handler('layer/remove', {
    workspace_key: sessionId,
    layer_id: sourceLayer,
  })
  assert.equal(removedSource.ok, true, removedSource.error?.message)
  assert.deepEqual(removedSource.value.imports, [])
  assert.deepEqual(removedSource.value.input_layers, [])
  assert.deepEqual(removedSource.value.derived_layers, [])
  assert.deepEqual(removedSource.value.layer_preferences, {})

  const finalProjection = await recreatedRpc.handler('agent/workspace', { workspace_key: sessionId })
  assert.equal(finalProjection.value.status, 'ready')
  assert.deepEqual(finalProjection.value.layers, [])
  const workspaceDirectory = initialProvider.workspaceFor(sessionId)
  assert.equal((await stat(workspaceDirectory)).isDirectory(), true)
})

test('Layer workbench RPC rejects malformed identifiers and preferences before Provider execution', async () => {
  let calls = 0
  const rpc = await register({ execute: async () => { calls += 1; return {} } })
  for (const [endpoint, payload] of [
    ['layer/details', { workspace_key: 'safe', layer_id: '../layer_0001' }],
    ['layer/rename', { workspace_key: 'safe', layer_id: 'layer_0001', name: '' }],
    ['layer/preference', { workspace_key: 'safe', layer_id: 'layer_0001', opacity: 1.1 }],
    ['layer/preference', { workspace_key: 'safe', layer_id: 'layer_0001' }],
  ]) {
    const response = await rpc.handler(endpoint, payload)
    assert.equal(response.ok, false)
    assert.equal(response.error.code, 'bad-request')
  }
  assert.equal(calls, 0)
})

test('native Layer workbench is wired to canonical RPC and selection persistence controls', async () => {
  const client = await readFile(join(repositoryRoot, 'bundle', 'geoharness-bundle', 'src', 'client.tsx'), 'utf8')
  for (const marker of [
    'GeoHarnessDataWorkbench', "'layer/details'", "'layer/rename'", "'layer/remove'", "'layer/preference'",
    'workspace.preferences ?? {}', 'onSelectRow', 'setSelectedFeature', '前 100 行之外',
  ]) assert.ok(client.includes(marker), `Layer workbench is missing ${marker}`)

  const styles = await readFile(join(repositoryRoot, 'bundle', 'geoharness-bundle', 'src', 'styles.css'), 'utf8')
  for (const selector of [
    '.gh-data-workbench', '.gh-data-summary', '.gh-data-fields', '.gh-attribute-table', '.gh-layer-row.is-data-selected',
  ]) assert.ok(styles.includes(selector), `Layer workbench styles are missing ${selector}`)
})
