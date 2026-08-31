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

test('Layer Registry assigns legible semantic colors to buffers, candidates and final results', async () => {
  const registry = await loadRegistryModule()
  const scenario = await loadScenario('01-building-data-inspection')
  const collection = scenario.data.buildings
  const names = [
    'buildings_32618',
    'broadway_32618',
    'broadway_300m_buffer',
    'rivers_800m_buffer',
    'bldgs_within_300m_broadway',
    'bldgs_atleast_800m_rivers',
    'final_buildings_intersection',
  ]
  const colors = names.map(name => registry.registerUploadedLayer(`${name}.geojson`, { ...collection, name }).style.color)
  assert.equal(new Set(colors).size, colors.length)
  assert.equal(colors.at(-1), '#e11d48')
  assert.equal(registry.registerUploadedLayer('near_broadway.geojson', { ...collection, name: 'near_broadway' }).style.color, '#f59e0b')
  assert.equal(registry.registerUploadedLayer('far_from_river.geojson', { ...collection, name: 'far_from_river' }).style.color, '#0d9488')
})

test('the production client renders live Agent workspace layers without embedding Scenario fixtures', async () => {
  const [source, output] = await Promise.all([
    readFile(join(bundleRoot, 'src', 'client.tsx'), 'utf8'),
    renderClientBundle(),
  ])
  assert.match(source, /registerWorkspaceProjection/)
  assert.match(source, /toggleLayerVisibility/)
  assert.match(source, /Feature inspection/i)
  assert.match(source, /onPointerMove/)
  assert.match(source, /onWheel/)
  assert.match(source, /Math\.exp\(-event\.deltaY/)
  assert.match(source, /Fit bounds/)
  assert.match(source, /Native Harness Agent/)
  assert.match(source, /type="range"/)
  assert.match(source, /const opacity = Number\(event\.currentTarget\.value\)/)
  assert.doesNotMatch(source, /setLayerOpacity\(current, layer\.id, Number\(event\.currentTarget\.value\)\)/)
  assert.match(source, /Agent workspace/)
  assert.match(source, /data-step-status/)
  assert.match(source, /name: 'conversation\.session'/)
  assert.doesNotMatch(source, /name: 'sidebar\.workspaces'/)
  assert.match(source, /gh-map-layers-toggle/)
  assert.match(source, /gh-map-layer-drawer/)
  assert.match(source, /gh-map-result-focus/)
  assert.match(source, /data-layer-id=/)
  assert.match(source, /selectedInputs/)
  assert.doesNotMatch(source, /name: 'root'/)
  assert.doesNotMatch(source, /conversation\.session\.header\.actions|shell\.overlay/)
  assert.doesNotMatch(source, /name: 'conversation\.view'/)
  assert.doesNotMatch(output, /__GEOHARNESS_SCENARIOS__/)
  for (const id of [
    '01-building-data-inspection', '02-river-building-query',
    '03-building-statistics-by-district', '04-road-accessibility',
    '05-parameter-revision', '06-multi-constraint-selection',
    '07-official-nyc-building-inspection',
  ]) assert.doesNotMatch(output, new RegExp(id))
  assert.match(source, /connection\.api\.sessions\.history/)
  assert.doesNotMatch(source, /connection\.api\.sessions\.(prompt|models|selectModel)/)
  assert.match(source, /agent\/workspace/)
  assert.doesNotMatch(source, /Examples|goal\/start|scenario\/progress/)
})
