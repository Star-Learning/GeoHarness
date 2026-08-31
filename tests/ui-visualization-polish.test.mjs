import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'
import vm from 'node:vm'
import ts from 'typescript'

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const sourceRoot = join(repositoryRoot, 'bundle', 'geoharness-bundle', 'src')

function evaluateCommonJs(source, fileName, require = () => { throw new Error('unexpected import') }) {
  const output = ts.transpileModule(source, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
    fileName,
  }).outputText
  const module = { exports: {} }
  vm.runInNewContext(output, { module, exports: module.exports, require }, { filename: fileName })
  return module.exports
}

async function loadModels() {
  const registryPath = join(sourceRoot, 'layer-registry.ts')
  const modelPath = join(sourceRoot, 'ui-model.ts')
  const registry = evaluateCommonJs(await readFile(registryPath, 'utf8'), registryPath)
  const model = evaluateCommonJs(
    await readFile(modelPath, 'utf8'),
    modelPath,
    specifier => specifier === './layer-registry' ? registry : null,
  )
  return { model, registry }
}

test('Result Center derives bounded charts only from structured Layer and Tool values', async () => {
  const { model } = await loadModels()
  const inputs = [{ layer_id: 'input', name: 'buildings', role: 'input', feature_count: 360 }]
  const outputs = Array.from({ length: 10 }, (_, index) => ({
    layer_id: `output-${index}`,
    name: `output ${index}`,
    role: 'output',
    feature_count: 300 - index * 20,
  }))
  const flow = model.buildFeatureFlow(inputs, outputs)
  assert.equal(flow.items.length, 8)
  assert.equal(flow.omitted, 3)
  assert.equal(flow.items[0].layer_id, 'input')
  assert.equal(flow.items.at(-1).layer_id, 'output-9')
  assert.ok(flow.items.every(item => item.width >= 4 && item.width <= 100))

  const statistics = model.buildNumericStatistics({ selected_count: 11, area: { sum_m2: 4426.92 }, note: 'verified' })
  assert.deepEqual(Array.from(statistics, item => item.path), ['selected_count', 'area.sum_m2'])
  assert.equal(statistics.at(-1).width, 100)
})

test('Layer grouping uses actual lineage leaves instead of names or preset Scenario rules', async () => {
  const { model } = await loadModels()
  const layers = [
    { id: 'input', source: 'upload', parents: [] },
    { id: 'buffer', source: 'derived', parents: ['input'] },
    { id: 'selected', source: 'derived', parents: ['buffer'] },
    { id: 'export-ready', source: 'derived', parents: ['selected'] },
  ]
  const groups = model.groupWorkspaceLayers(layers)
  assert.deepEqual(Array.from(groups.input, layer => layer.id), ['input'])
  assert.deepEqual(Array.from(groups.intermediate, layer => layer.id), ['buffer', 'selected'])
  assert.deepEqual(Array.from(groups.final, layer => layer.id), ['export-ready'])
})

test('CSV import preview detects quoted fields and coordinate mapping before canonical import', async () => {
  const { model } = await loadModels()
  const preview = model.parseCsvPreview('name,longitude,latitude,note\r\nA,-74.01,40.71,"near, river"\r\nB,-74.00,40.72,ok')
  assert.ok(preview)
  assert.equal(preview.delimiter, ',')
  assert.deepEqual(Array.from(preview.fields), ['name', 'longitude', 'latitude', 'note'])
  assert.equal(preview.rows[0][3], 'near, river')
  assert.equal(model.suggestCoordinateField(preview.fields, 'longitude'), 'longitude')
  assert.equal(model.suggestCoordinateField(preview.fields, 'latitude'), 'latitude')
})

test('map scale and temporary Layer styling remain bounded', async () => {
  const { model, registry } = await loadModels()
  assert.match(model.mapScaleLabel([-74.02, 40.69, -73.95, 40.73], 1), /^≈ [\d.]+ (m|km)$/u)
  const layer = {
    id: 'layer_0001',
    name: 'final_result',
    style: { color: '#e11d48', fillOpacity: 0.9, lineWidth: 3.1 },
  }
  const changed = registry.setLayerStyle([layer], layer.id, { color: '#ABCDEF', lineWidth: 99, fillOpacity: -1 })
  assert.deepEqual({ ...changed[0].style }, { color: '#abcdef', fillOpacity: 0, lineWidth: 6 })
  assert.equal(registry.setLayerStyle(changed, layer.id, { color: 'red' })[0].style.color, '#abcdef')
  assert.equal(registry.resetLayerStyle(changed, layer.id)[0].style.color, '#e11d48')
})

test('production UI contains synchronized status, charts, grouped layers and presentation controls', async () => {
  const [client, styles] = await Promise.all([
    readFile(join(sourceRoot, 'client.tsx'), 'utf8'),
    readFile(join(sourceRoot, 'styles.css'), 'utf8'),
  ])
  for (const marker of [
    'gh-execution-strip', 'buildFeatureFlow', 'buildNumericStatistics', 'groupWorkspaceLayers',
    'Intermediate layers', 'Final result layers', 'gh-map-legend', 'mapScaleLabel',
    'parseCsvPreview', '筛选当前 100 行属性', 'requestFullscreen',
  ]) assert.ok(client.includes(marker), `client is missing ${marker}`)
  for (const selector of [
    '.gh-execution-strip', '.gh-result-flow', '.gh-stat-chart', '.gh-map-legend',
    '.gh-layer-style-controls', '.gh-table-controls', '.gh-shell.is-presentation',
  ]) assert.ok(styles.includes(selector), `styles are missing ${selector}`)
})
