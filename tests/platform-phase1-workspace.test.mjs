import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'

import { LocalPythonGeoProvider } from '../bundle/geoharness-bundle/host/provider.js'

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')

function providerOptions(workspaceRoot) {
  return {
    workspaceRoot,
    backendRoot: join(repositoryRoot, 'backend', 'geo-service'),
    scenarioRoot: join(repositoryRoot, 'examples', 'scenarios'),
    datasetRoot: join(repositoryRoot, 'examples', 'datasets'),
  }
}

test('one Harness Session keeps one persistent workspace across Provider recreation and package changes', async () => {
  const temporary = await mkdtemp(join(tmpdir(), 'geoharness-platform-phase1-'))
  try {
    const firstProvider = new LocalPythonGeoProvider(providerOptions(temporary))
    const sessionId = 'platform:session-a'
    const workspacePath = firstProvider.workspaceFor(sessionId)
    assert.equal(firstProvider.workspaceFor(sessionId, 'ignored-dataset'), workspacePath)
    assert.equal(firstProvider.workspaceFor(sessionId, 'ignored-scenario'), workspacePath)

    const loaded = await firstProvider.execute({
      action: 'load_dataset', workspaceKey: sessionId, datasetId: 'nyc-core-official', reset: true,
    })
    assert.equal(loaded.layers.length, 5)
    const buildings = loaded.layers.find(layer => layer.name === 'buildings')

    const transformed = await firstProvider.execute({
      action: 'tool', workspaceKey: sessionId, tool: 'transform_crs', step_id: 'phase1-transform',
      parameters: { input_layer: buildings.layer_id, target_crs: 'EPSG:32618', output_name: 'buildings_metric' },
    })
    assert.equal(transformed.success, true)
    const exported = await firstProvider.execute({
      action: 'tool', workspaceKey: sessionId, tool: 'export_layer', step_id: 'phase1-export',
      parameters: { input_layer: transformed.outputs[0], format: 'geojson', file_name: 'buildings-metric' },
    })
    assert.equal(exported.success, true)
    await firstProvider.execute({
      action: 'workspace_record_run', workspaceKey: sessionId, run_id: 'run-001',
      run: { status: 'success', goal: 'transform and export the uploaded data' },
    })

    const recreatedProvider = new LocalPythonGeoProvider(providerOptions(temporary))
    const restoredLayers = await recreatedProvider.execute({ action: 'layers', workspaceKey: sessionId })
    assert.equal(restoredLayers.length, 6)
    assert.equal(restoredLayers.at(-1).layer_id, transformed.outputs[0])
    const manifest = await recreatedProvider.execute({ action: 'workspace_manifest', workspaceKey: sessionId })
    assert.equal(manifest.schema_version, '1.0')
    assert.equal(manifest.session_id, sessionId)
    assert.equal(manifest.active_dataset, 'nyc-core-official')
    assert.equal(manifest.input_layers.length, 5)
    assert.equal(manifest.derived_layers.length, 1)
    assert.equal(manifest.exports.length, 1)
    assert.equal(manifest.runs.length, 1)
    assert.equal(JSON.parse(await readFile(join(workspacePath, 'workspace.json'), 'utf8')).session_id, sessionId)

    const isolated = await recreatedProvider.execute({ action: 'workspace_manifest', workspaceKey: 'platform:session-b' })
    assert.deepEqual(isolated.input_layers, [])
    assert.deepEqual(isolated.derived_layers, [])
    assert.notEqual(recreatedProvider.workspaceFor('platform:session-b'), workspacePath)

    await recreatedProvider.execute({
      action: 'load_scenario', workspaceKey: sessionId, scenarioId: '01-building-data-inspection', reset: true,
    })
    const switched = await recreatedProvider.execute({ action: 'workspace_manifest', workspaceKey: sessionId })
    assert.equal(recreatedProvider.workspaceFor(sessionId), workspacePath)
    assert.equal(switched.active_dataset, null)
    assert.equal(switched.active_scenario, '01-building-data-inspection')
    assert.equal(switched.input_layers.length, 1)
    assert.deepEqual(switched.exports, [])
    assert.deepEqual(switched.runs, [])
  } finally {
    await rm(temporary, { recursive: true, force: true })
  }
})

test('safe path mapping isolates collision-shaped Session ids and rejects invalid ids', async () => {
  const temporary = await mkdtemp(join(tmpdir(), 'geoharness-platform-phase1-collision-'))
  try {
    const provider = new LocalPythonGeoProvider(providerOptions(temporary))
    await provider.execute({ action: 'workspace_manifest', workspaceKey: 'session:a' })
    const isolated = await provider.execute({ action: 'workspace_manifest', workspaceKey: 'session-a' })
    assert.equal(isolated.session_id, 'session-a')
    assert.notEqual(provider.workspaceFor('session:a'), provider.workspaceFor('session-a'))
    await assert.rejects(
      provider.execute({ action: 'workspace_manifest', workspaceKey: '.' }),
      /Invalid Geo workspace Session id/,
    )
  } finally {
    await rm(temporary, { recursive: true, force: true })
  }
})
