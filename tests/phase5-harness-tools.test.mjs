import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { mkdtemp, rm } from 'node:fs/promises'
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

async function setup(workspaceRoot) {
  const [{ Context }, { default: SessionStore }, { default: SystemPrompt }, { default: ToolRuntime }, GeoPlugin] = await Promise.all([
    importFromBundle('@deepseek-ai/cordis'),
    importFromBundle('@deepseek-ai/dsh-session'),
    importFromBundle('@deepseek-ai/dsh-system-prompt'),
    importFromBundle('@deepseek-ai/dsh-tools'),
    import('../bundle/geoharness-bundle/index.js'),
  ])
  const ctx = new Context()
  await ctx.plugin(SessionStore)
  await ctx.plugin(SystemPrompt)
  await ctx.plugin(ToolRuntime)
  await ctx.plugin(GeoPlugin, {
    workspaceRoot,
    backendRoot: join(repositoryRoot, 'backend', 'geo-service'),
    scenarioRoot: join(repositoryRoot, 'examples', 'scenarios'),
  })
  return ctx
}

async function execute(ctx, name, args, callId) {
  return ctx.tools.execute({
    signal: new AbortController().signal,
    callId,
    name,
    arguments: args,
  })
}

test('the GeoHarness host plugin registers dataset discovery plus the 12 GIS Tool schemas', async () => {
  const temporary = await mkdtemp(join(tmpdir(), 'geoharness-phase5-schemas-'))
  try {
    const ctx = await setup(temporary)
    const schemas = ctx.tools.schemas()
    const names = schemas.map(schema => schema.name)
    assert.equal(names.length, 13)
    const expectedNames = [
      'discover_datasets', 'inspect_dataset', 'list_layers', 'transform_crs', 'create_buffer',
      'spatial_filter', 'spatial_join', 'clip_layer', 'aggregate_by_region',
      'calculate_geometry', 'nearest_features', 'analyze_distribution', 'export_layer',
    ]
    assert.deepEqual(names, expectedNames)
    const listSchema = schemas.find(schema => schema.name === 'list_layers')
    assert.deepEqual(listSchema.parameters.properties.dataset_id.enum, ['nyc-core-official'])
    const assembly = await ctx.systemPrompt.assemble()
    assert.deepEqual(assembly.tools.map(tool => tool.name), [...names].sort())
  } finally {
    await rm(temporary, { recursive: true, force: true })
  }
})

test('Harness ToolRuntime executes a complete river-buffer workflow through the Python provider', async () => {
  const temporary = await mkdtemp(join(tmpdir(), 'geoharness-phase5-exec-'))
  try {
    const ctx = await setup(temporary)
    const discovered = await execute(ctx, 'discover_datasets', {}, 'phase5-discover')
    assert.equal(discovered.isError, false)
    assert.equal(discovered.value.success, true)
    assert.deepEqual(discovered.value.data.datasets.map(dataset => dataset.id), ['nyc-core-official'])

    const listed = await execute(ctx, 'list_layers', { dataset_id: 'nyc-core-official' }, 'phase5-list')
    assert.equal(listed.isError, false)
    assert.equal(listed.value.success, true)
    const byName = Object.fromEntries(listed.value.data.layers.map(layer => [layer.name, layer.layer_id]))
    assert.deepEqual(Object.keys(byName), ['buildings', 'roads', 'rivers', 'districts', 'lower_manhattan_buildings'])

    const transformed = await execute(ctx, 'transform_crs', {
      input_layer: byName.rivers,
      target_crs: 'EPSG:32618',
      output_name: 'rivers_metric',
    }, 'phase5-transform')
    assert.equal(transformed.value.success, true)

    const buffered = await execute(ctx, 'create_buffer', {
      input_layer: transformed.value.outputs[0],
      distance: 500,
      unit: 'meter',
      output_name: 'river_buffer',
    }, 'phase5-buffer')
    assert.equal(buffered.value.success, true)
    assert.equal(buffered.value.parameters.distance_m, 500)

    const filtered = await execute(ctx, 'spatial_filter', {
      input_layer: byName.buildings,
      mask_layer: buffered.value.outputs[0],
      predicate: 'intersects',
      output_name: 'candidate_buildings',
    }, 'phase5-filter')
    assert.equal(filtered.isError, false)
    assert.equal(filtered.value.success, true)
    assert.equal(filtered.value.data.selected_count, 132)
    assert.match(filtered.content[0].text, /Selected 132 of 360/)
    assert.deepEqual(filtered.meta, {
      tool: 'spatial_filter',
      tool_version: '1.0.0',
      capability: 'vector.spatial-filter',
      map_effect: 'add-layer',
      success: true,
      outputs: filtered.value.outputs,
      summary: 'Selected 132 of 360 input features.',
      warnings: [],
      data: { selected_count: 132, input_count: 360 },
    })
  } finally {
    await rm(temporary, { recursive: true, force: true })
  }
})

test('schema rejection and backend failure remain structured at the Harness boundary', async () => {
  const temporary = await mkdtemp(join(tmpdir(), 'geoharness-phase5-errors-'))
  try {
    const ctx = await setup(temporary)
    const invalidDataset = await execute(ctx, 'list_layers', { dataset_id: 'not-a-dataset' }, 'phase5-invalid')
    assert.equal(invalidDataset.isError, true)
    assert.match(invalidDataset.content[0].text, /INVALID_ARGS|invalid arguments/)

    const failedBuffer = await execute(ctx, 'create_buffer', {
      input_layer: 'layer_missing',
      distance: 500,
    }, 'phase5-missing')
    assert.equal(failedBuffer.isError, false)
    assert.equal(failedBuffer.value.success, false)
    assert.deepEqual(failedBuffer.value.outputs, [])
    assert.match(failedBuffer.value.summary, /Unknown layer/)
  } finally {
    await rm(temporary, { recursive: true, force: true })
  }
})
