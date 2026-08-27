import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { basename, dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import vm from 'node:vm'
import test from 'node:test'
import ts from 'typescript'
import { renderClientBundle } from '../bundle/geoharness-bundle/scripts/build-client.mjs'

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const bundleRoot = join(repositoryRoot, 'bundle', 'geoharness-bundle')

async function readJson(path) {
  return JSON.parse(await readFile(path, 'utf8'))
}

async function loadScenario(id) {
  const root = join(repositoryRoot, 'examples', 'scenarios', id)
  const manifest = await readJson(join(root, 'scenario.json'))
  const data = {}
  for (const reference of manifest.data) {
    data[basename(reference, '.geojson')] = await readJson(join(root, ...reference.split('/')))
  }
  return {
    manifest,
    prompt: (await readFile(join(root, manifest.prompt), 'utf8')).trim(),
    expectedPlan: await readJson(join(root, manifest.expected_plan)),
    expectedResult: await readJson(join(root, manifest.expected_result)),
    data,
  }
}

async function loadRegistryModule() {
  const sourcePath = join(bundleRoot, 'src', 'layer-registry.ts')
  const source = await readFile(sourcePath, 'utf8')
  const output = ts.transpileModule(source, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
    fileName: sourcePath,
  }).outputText
  const module = { exports: {} }
  vm.runInNewContext(output, { module, exports: module.exports }, { filename: 'layer-registry.js' })
  return module.exports
}

test('Layer Registry loads a Scenario package into canonical layer records', async () => {
  const registry = await loadRegistryModule()
  const scenario = await loadScenario('04-road-accessibility')
  const layers = registry.registerScenarioLayers(scenario)
  assert.equal(layers.length, 3)
  assert.deepEqual(Array.from(layers, layer => layer.name), ['buildings', 'roads', 'districts'])
  assert.equal(new Set(Array.from(layers, layer => layer.id)).size, layers.length)
  for (const layer of layers) {
    assert.equal(layer.type, 'vector')
    assert.equal(layer.source, 'scenario')
    assert.equal(layer.scenarioId, scenario.manifest.id)
    assert.equal(layer.crs, 'OGC:CRS84')
    assert.equal(layer.visible, true)
    assert.equal(layer.featureCount, layer.data.features.length)
    assert.equal(layer.generatedBy, null)
    assert.deepEqual(Array.from(layer.parents), [])
  }
})

test('Layer Registry visibility and opacity updates are immutable and bounded', async () => {
  const registry = await loadRegistryModule()
  const layers = registry.registerScenarioLayers(await loadScenario('02-river-building-query'))
  const toggled = registry.toggleLayerVisibility(layers, layers[0].id)
  const faded = registry.setLayerOpacity(toggled, layers[1].id, 2)
  assert.notEqual(toggled, layers)
  assert.equal(layers[0].visible, true)
  assert.equal(toggled[0].visible, false)
  assert.equal(faded[1].opacity, 1)
})

test('uploaded GeoJSON is validated before registration', async () => {
  const registry = await loadRegistryModule()
  const scenario = await loadScenario('01-building-data-inspection')
  const layer = registry.registerUploadedLayer('my-buildings.geojson', scenario.data.buildings)
  assert.equal(layer.source, 'upload')
  assert.equal(layer.featureCount, 360)
  assert.equal(layer.geometry, 'MultiPolygon')
  assert.throws(() => registry.registerUploadedLayer('bad.json', { type: 'FeatureCollection' }), /valid GeoJSON/)
})

test('the Phase 3 client embeds all Scenario data and implements map interaction surfaces', async () => {
  const [source, output] = await Promise.all([
    readFile(join(bundleRoot, 'src', 'client.tsx'), 'utf8'),
    renderClientBundle(),
  ])
  assert.match(source, /registerScenarioLayers/)
  assert.match(source, /toggleLayerVisibility/)
  assert.match(source, /Feature inspection/i)
  assert.match(source, /onPointerMove/)
  assert.match(source, /Fit bounds/)
  assert.match(source, /NYC OPEN DATA/)
  assert.match(source, /Official NYC Open Data/)
  assert.match(source, /type="range"/)
  assert.match(source, /const opacity = Number\(event\.currentTarget\.value\)/)
  assert.doesNotMatch(source, /setLayerOpacity\(current, layer\.id, Number\(event\.currentTarget\.value\)\)/)
  assert.match(source, /name: 'conversation'/)
  assert.doesNotMatch(source, /conversation\.session\.header\.actions|shell\.overlay/)
  assert.doesNotMatch(source, /name: 'conversation\.view'/)
  assert.match(output, /__GEOHARNESS_SCENARIOS__/)
  for (const id of [
    '01-building-data-inspection', '02-river-building-query',
    '03-building-statistics-by-district', '04-road-accessibility',
    '05-parameter-revision', '06-multi-constraint-selection',
    '07-official-nyc-building-inspection',
  ]) assert.match(output, new RegExp(id))
})
