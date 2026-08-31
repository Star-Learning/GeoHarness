import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { readFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { pathToFileURL, fileURLToPath } from 'node:url'
import test from 'node:test'

import {
  loadBuiltinToolCatalog,
  loadDatasetCatalogs,
  mergeToolCatalogs,
  validateDatasetCatalog,
  validateToolCatalog,
} from '../bundle/geoharness-bundle/host/catalog.js'
import { projectRunManifests } from '../bundle/geoharness-bundle/host/run-manifest.js'
import { registerGeoTools } from '../bundle/geoharness-bundle/host/tools.js'

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const bundleRoot = join(repositoryRoot, 'bundle', 'geoharness-bundle')
const datasetRoot = join(repositoryRoot, 'examples', 'datasets')
const fixturePath = join(repositoryRoot, 'tests', 'fixtures', 'extensions', 'fixture-tool-catalog.json')
const requireFromBundle = createRequire(join(bundleRoot, 'package.json'))

async function importFromBundle(packageName) {
  return import(pathToFileURL(requireFromBundle.resolve(packageName)).href)
}

async function fixtureCatalog() {
  return JSON.parse(await readFile(fixturePath, 'utf8'))
}

async function contextWithCatalog(options = {}) {
  const [{ Context }, { default: SystemPrompt }, { default: ToolRuntime }] = await Promise.all([
    importFromBundle('@deepseek-ai/cordis'),
    importFromBundle('@deepseek-ai/dsh-system-prompt'),
    importFromBundle('@deepseek-ai/dsh-tools'),
  ])
  const ctx = new Context()
  await ctx.plugin(SystemPrompt)
  await ctx.plugin(ToolRuntime)
  const diagnostics = registerGeoTools(ctx, { datasetRoot, ...options })
  return { ctx, diagnostics }
}

test('versioned catalogs are the single registration and generated-document source', async () => {
  const toolSchema = JSON.parse(await readFile(join(bundleRoot, 'catalog', 'schemas', 'tool-manifest.schema.json'), 'utf8'))
  const datasetSchema = JSON.parse(await readFile(join(bundleRoot, 'catalog', 'schemas', 'dataset-catalog.schema.json'), 'utf8'))
  assert.equal(toolSchema.$id, 'https://geoharness.dev/schemas/tool-manifest-1.0.json')
  assert.equal(datasetSchema.$id, 'https://geoharness.dev/schemas/dataset-catalog-1.0.json')

  const tools = mergeToolCatalogs([loadBuiltinToolCatalog()])
  assert.equal(tools.length, 13)
  assert.deepEqual(tools.map(tool => tool.name), [
    'discover_datasets', 'inspect_dataset', 'list_layers', 'transform_crs', 'create_buffer',
    'spatial_filter', 'spatial_join', 'clip_layer', 'aggregate_by_region',
    'calculate_geometry', 'nearest_features', 'analyze_distribution', 'export_layer',
  ])
  assert.ok(tools.every(tool => tool.version === '1.0.0' && tool.output.contract === 'ToolResult@1.0'))

  const datasets = loadDatasetCatalogs(datasetRoot)
  assert.equal(datasets.length, 1)
  assert.equal(datasets[0].id, 'nyc-core-official')
  assert.deepEqual(datasets[0].layers.map(layer => layer.name), [
    'buildings', 'roads', 'rivers', 'districts', 'lower_manhattan_buildings',
  ])
  const reference = await readFile(join(repositoryRoot, 'docs', 'architecture', 'catalog-reference.md'), 'utf8')
  for (const tool of tools) assert.ok(reference.includes(`| \`${tool.name}\` |`))
  assert.match(reference, /`nyc-core-official`/u)
})

test('a fixture Tool registers and executes without changing Agent, Layer or Result Center UI code', async () => {
  const fixture = await fixtureCatalog()
  const executor = async (args, { stepId }) => ({
    success: true,
    tool: 'fixture_layer_note',
    step_id: stepId,
    inputs: [args.input_layer],
    parameters: { note: args.note },
    outputs: [],
    summary: `Recorded fixture note for ${args.input_layer}.`,
    warnings: [],
    data: { note: args.note, verified: true },
  })
  const { ctx, diagnostics } = await contextWithCatalog({
    toolCatalogs: [fixture],
    executors: { fixture_layer_note: executor },
  })
  assert.equal(diagnostics.registered.length, 14)
  assert.deepEqual(diagnostics.unavailable, [])
  const schema = ctx.tools.schemas().find(item => item.name === 'fixture_layer_note')
  assert.equal(schema.description, fixture.tools[0].description)
  const result = await ctx.tools.execute({
    signal: new AbortController().signal,
    callId: 'fixture-call',
    name: 'fixture_layer_note',
    arguments: { input_layer: 'layer_0001', note: 'external catalog works' },
    agent: { session: { id: 'fixture-session' } },
  })
  assert.equal(result.value.data.verified, true)
  assert.equal(result.meta.tool_version, '1.2.0')
  assert.equal(result.meta.capability, 'vector.fixture-note')
  assert.equal(result.meta.map_effect, 'none')

  const runs = projectRunManifests('fixture-session', [
    { seq: 0, type: 'user/message', data: { source: { kind: 'user' }, content: [{ type: 'text', text: '添加结构化图层备注。' }] } },
    { seq: 1, type: 'turn/start', data: { turn: 1 } },
    { seq: 2, type: 'tool/call', data: { turn: 1, callId: 'fixture-call', name: 'fixture_layer_note', arguments: '{"input_layer":"layer_0001","note":"external catalog works"}' } },
    { seq: 3, type: 'tool/result', data: { turn: 1, message: { source: { callId: 'fixture-call' }, content: [] }, meta: result.meta } },
    { seq: 4, type: 'turn/end', data: { turn: 1, reason: { kind: 'completed' } } },
  ])
  assert.deepEqual(runs[0].tool_calls[0].result_data, { note: 'external catalog works', verified: true })
  const client = await readFile(join(bundleRoot, 'src', 'client.tsx'), 'utf8')
  assert.doesNotMatch(client, /fixture_layer_note|fixture-note/u)
  assert.match(client, /run\.tool_calls|result\.statistics|result\.output_layers/u)
})

test('missing executors and incompatible manifests fail explicitly', async () => {
  const fixture = await fixtureCatalog()
  const { ctx, diagnostics } = await contextWithCatalog({ toolCatalogs: [fixture] })
  assert.equal(diagnostics.registered.length, 13)
  assert.deepEqual(diagnostics.unavailable.map(item => item.capability), ['vector.fixture-note'])
  assert.equal(ctx.tools.schemas().some(item => item.name === 'fixture_layer_note'), false)
  const assembly = await ctx.systemPrompt.assemble()
  const prompt = assembly.sections.map(section => section.text).join('\n')
  assert.match(prompt, /Unavailable declared capabilities: vector\.fixture-note/u)
  assert.match(prompt, /never fabricate their results/u)

  const conflict = structuredClone(fixture)
  conflict.id = 'geoharness.conflict'
  conflict.tools[0].name = 'create_buffer'
  conflict.tools[0].version = '9.0.0'
  assert.throws(() => mergeToolCatalogs([loadBuiltinToolCatalog(), conflict]), /Tool version conflict for create_buffer/u)

  const incompatible = structuredClone(fixture)
  incompatible.schema_version = '2.0'
  assert.throws(() => validateToolCatalog(incompatible), /unsupported schema_version 2\.0/u)
  const invalidDataset = structuredClone(loadDatasetCatalogs(datasetRoot)[0])
  invalidDataset.schema_version = '2.0'
  assert.throws(() => validateDatasetCatalog(invalidDataset), /unsupported schema_version 2\.0/u)
})

test('dataset discovery publishes capabilities without leaking server paths', async () => {
  const { ctx } = await contextWithCatalog()
  const result = await ctx.tools.execute({
    signal: new AbortController().signal,
    callId: 'discover-call',
    name: 'discover_datasets',
    arguments: {},
    agent: { session: { id: 'catalog-session' } },
  })
  assert.equal(result.value.success, true)
  assert.equal(result.value.data.datasets[0].id, 'nyc-core-official')
  assert.equal(result.value.data.datasets[0].layers.includes('buildings'), true)
  assert.doesNotMatch(JSON.stringify(result.value), /\.\.\/|\\scenarios\\|\/scenarios\//u)
  const listLayers = ctx.tools.schemas().find(item => item.name === 'list_layers')
  assert.deepEqual(listLayers.parameters.properties.dataset_id.enum, ['nyc-core-official'])
})
