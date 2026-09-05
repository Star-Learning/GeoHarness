import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'
import vm from 'node:vm'
import ts from 'typescript'

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const sourceRoot = join(repositoryRoot, 'bundle', 'geoharness-bundle', 'src')

async function loadBasemap() {
  const fileName = join(sourceRoot, 'raster-basemap.ts')
  const output = ts.transpileModule(await readFile(fileName, 'utf8'), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
    fileName,
  }).outputText
  const module = { exports: {} }
  vm.runInNewContext(output, { module, exports: module.exports }, { filename: fileName })
  return module.exports
}

test('Web Mercator projection aligns known world coordinates and NYC bounds', async () => {
  const basemap = await loadBasemap()
  assert.equal(basemap.longitudeToWorldX(0), 0.5)
  assert.ok(Math.abs(basemap.latitudeToWorldY(0) - 0.5) < 1e-12)
  const projection = basemap.createMercatorProjection([-74.02, 40.69, -73.95, 40.73])
  const lowerLeft = projection.project([-74.02, 40.69])
  const upperRight = projection.project([-73.95, 40.73])
  assert.ok(lowerLeft[0] < upperRight[0])
  assert.ok(lowerLeft[1] > upperRight[1])
  assert.ok(projection.scale > 0)
})

test('visible satellite tile set is bounded, HTTPS and gains detail while zooming', async () => {
  const basemap = await loadBasemap()
  const projection = basemap.createMercatorProjection([-74.02, 40.69, -73.95, 40.73])
  const initial = basemap.visibleEsriWorldImageryTiles(projection, 1, { x: 0, y: 0 })
  const zoomed = basemap.visibleEsriWorldImageryTiles(projection, 4, { x: 50, y: -25 })
  assert.ok(initial.length >= 4 && initial.length <= 64)
  assert.ok(zoomed.length >= 4 && zoomed.length <= 64)
  assert.ok(initial.every(tile => tile.url.startsWith('https://server.arcgisonline.com/')))
  assert.ok(initial.every(tile => tile.width > 0 && tile.height > 0))
  assert.ok(zoomed[0].zoom > initial[0].zoom)
})

test('flight overview tiles retain stable sources and align with Mercator geometry', async () => {
  const basemap = await loadBasemap()
  const start = basemap.createMercatorProjection([-74.02, 40.69, -73.95, 40.73])
  const end = basemap.createMercatorProjection([114.18, 30.38, 114.64, 30.70])
  const before = basemap.overviewEsriWorldImageryTiles(start)
  const after = basemap.overviewEsriWorldImageryTiles(end)
  assert.equal(before.length, 16)
  assert.equal(new Set(before.map(tile => tile.key)).size, 16)
  assert.deepEqual(Array.from(before, tile => tile.url), Array.from(after, tile => tile.url))
  const equatorTile = after.find(tile => tile.key === 'overview/2/2/2')
  const origin = end.project([0, 0])
  assert.ok(Math.abs(equatorTile.x - origin[0]) < 1e-7)
  assert.ok(Math.abs(equatorTile.y - origin[1]) < 1e-7)
  assert.ok(Math.abs(after[1].x - after[0].x - (after[0].width - .35)) < 1e-7)
})

test('named-place flight builds zoom-out, travel and zoom-in view stops', async () => {
  const basemap = await loadBasemap()
  const current = [-74.02, 40.69, -73.95, 40.73]
  const target = [114.1669704, 30.3805998, 114.6358804, 30.6957241]
  const stops = basemap.createGeoViewFlightStops(current, target)
  const departureCenter = [(stops.departure[0] + stops.departure[2]) / 2, (stops.departure[1] + stops.departure[3]) / 2]
  const approachCenter = [(stops.approach[0] + stops.approach[2]) / 2, (stops.approach[1] + stops.approach[3]) / 2]

  assert.ok(stops.departure[2] - stops.departure[0] > current[2] - current[0])
  assert.ok(stops.approach[2] - stops.approach[0] > target[2] - target[0])
  assert.ok(Math.abs(departureCenter[0] - (-73.985)) < 1e-6)
  assert.ok(Math.abs(approachCenter[0] - 114.4014254) < 1e-6)
  assert.deepEqual(Array.from(basemap.interpolateGeoBounds(current, target, 0)), current)
  assert.deepEqual(Array.from(basemap.interpolateGeoBounds(current, target, 1)), target)
})

test('production map exposes satellite, offline fallback and attribution states', async () => {
  const [client, styles, build] = await Promise.all([
    readFile(join(sourceRoot, 'client.tsx'), 'utf8'),
    readFile(join(sourceRoot, 'styles.css'), 'utf8'),
    readFile(join(repositoryRoot, 'bundle', 'geoharness-bundle', 'scripts', 'build-client.mjs'), 'utf8'),
  ])
  for (const marker of ['visibleEsriWorldImageryTiles', 'createGeoViewFlight', "'satellite'", '卫星 / 网格 / 纯色底图', 'Esri World Imagery']) {
    assert.ok(client.includes(marker), `client is missing ${marker}`)
  }
  for (const selector of ['.gh-map.is-satellite', '.gh-map-raster', '.gh-map-raster-shade', '.gh-map-flight', '.gh-admin-boundary-outline']) {
    assert.ok(styles.includes(selector), `styles are missing ${selector}`)
  }
  assert.ok(build.includes("'./raster-basemap'"))
})

async function realHongshanBounds() {
  const cache = JSON.parse(await readFile(join(repositoryRoot,
    'examples/topics/03-satellite-visual-inspection/data/hongshan-place-cache.json'), 'utf8'))
  const geometry = cache.places.find(place => place.query === '武汉市洪山区').resolved_place.administrative_boundary.geometry
  const points = geometry.type === 'Polygon' ? geometry.coordinates.flat() : geometry.coordinates.flat(2)
  return [Math.min(...points.map(p => p[0])), Math.min(...points.map(p => p[1])),
    Math.max(...points.map(p => p[0])), Math.max(...points.map(p => p[1]))]
}

function camera(basemap, bounds) {
  const projection = basemap.createMercatorProjection(bounds)
  return [
    (basemap.longitudeToWorldX(bounds[0]) + basemap.longitudeToWorldX(bounds[2])) / 2,
    (basemap.latitudeToWorldY(bounds[1]) + basemap.latitudeToWorldY(bounds[3])) / 2,
    Math.log2(projection.scale),
  ]
}

test('continuous flight to real Hongshan boundary has smooth speed and no intermediate stop', async () => {
  const basemap = await loadBasemap()
  const target = await realHongshanBounds()
  for (const start of [[-74.02, 40.69, -73.95, 40.73], [120.5, 31.1, 120.8, 31.4], [114.0, 30.1, 114.2, 30.3]]) {
    const flight = basemap.createGeoViewFlight(start, target)
    assert.ok(flight.duration >= 2800 && flight.duration <= 7600)
    assert.deepEqual(Array.from(flight.sample(0)), start)
    assert.deepEqual(Array.from(flight.sample(1)), target)
    const steps = Math.ceil(flight.duration / (1000 / 60))
    let previous = camera(basemap, start)
    for (let i = 1; i <= steps; i++) {
      const sample = flight.sample(i / steps)
      assert.ok(sample.every(Number.isFinite))
      const current = camera(basemap, sample)
      assert.ok(Math.abs(current[2] - previous[2]) < .12, 'zoom must not jump between animation frames')
      const screenTravel = Math.hypot(current[0] - previous[0], current[1] - previous[1]) * 2 ** current[2]
      assert.ok(screenTravel < 20, `camera moved ${screenTravel} viewport pixels in one 60 Hz sample`)
      previous = current
    }
    const middleBefore = camera(basemap, flight.sample(.499))
    const middleAfter = camera(basemap, flight.sample(.501))
    assert.ok(Math.hypot(middleAfter[0] - middleBefore[0], middleAfter[1] - middleBefore[1]) > 1e-8,
      'camera should still travel while zoom direction changes')
    for (const t of [.24, .3, .5, .7, .76]) {
      const h = .0001
      const left = camera(basemap, flight.sample(t - h))
      const mid = camera(basemap, flight.sample(t))
      const right = camera(basemap, flight.sample(t + h))
      for (let j = 0; j < 3; j++) {
        assert.ok(Math.abs((mid[j] - left[j]) / h - (right[j] - mid[j]) / h) < .06,
          `velocity discontinuity at ${t}, camera dimension ${j}`)
      }
    }
  }
})

test('flight preserves current pan/zoom and does not fly away from an already reached place', async () => {
  const basemap = await loadBasemap()
  const bounds = await realHongshanBounds()
  const projection = basemap.createMercatorProjection(bounds)
  const zoom = 2.4
  const pan = { x: 95, y: -44 }
  const transformed = basemap.geoBoundsForView(bounds, zoom, pan)
  const next = basemap.createMercatorProjection(transformed)
  for (const point of [[bounds[0], bounds[1]], [bounds[2], bounds[3]]]) {
    const oldPoint = projection.project(point)
    const newPoint = next.project(point)
    assert.ok(Math.abs(newPoint[0] - (500 + (oldPoint[0] - 500) * zoom + pan.x)) < 1e-7)
    assert.ok(Math.abs(newPoint[1] - (350 + (oldPoint[1] - 350) * zoom + pan.y)) < 1e-7)
  }
  const flight = basemap.createGeoViewFlight(bounds, bounds)
  assert.equal(flight.duration, 900)
  const start = camera(basemap, bounds)
  for (const progress of [.1, .5, .9]) {
    const sample = camera(basemap, flight.sample(progress))
    sample.forEach((value, i) => assert.ok(Math.abs(value - start[i]) < 1e-9))
  }
})

test('retained detail tiles survive zoom changes, stay aligned and remain memory-bounded', async () => {
  const basemap = await loadBasemap()
  const target = await realHongshanBounds()
  const flight = basemap.createGeoViewFlight([-74.02, 40.69, -73.95, 40.73], target)
  let cache = []
  for (let i = 0; i <= 120; i++) {
    const projection = basemap.createMercatorProjection(flight.sample(i / 120))
    const visible = basemap.visibleEsriWorldImageryTiles(projection, 1, { x: 0, y: 0 })
    const old = cache
    cache = basemap.retainRasterTiles(cache, visible)
    assert.ok(cache.length <= 128)
    assert.equal(cache.length, new Set(cache.map(tile => tile.key)).size)
    for (const tile of visible) {
      assert.ok(cache.some(retained => retained.key === tile.key))
      const positioned = basemap.reprojectRasterTile(tile, projection)
      for (const key of ['x', 'y', 'width', 'height']) assert.ok(Math.abs(positioned[key] - tile[key]) < 1e-7)
    }
    if (old.length && old.length + visible.length < 128) {
      assert.ok(old.every(tile => cache.some(retained => retained.key === tile.key)), 'do not drop the old zoom level while new tiles load')
    }
    for (const tile of cache) {
      const positioned = basemap.reprojectRasterTile(tile, projection)
      assert.ok([positioned.x, positioned.y, positioned.width, positioned.height].every(Number.isFinite))
    }
  }
  assert.equal(basemap.retainRasterTiles(cache, cache.slice(0, 3), 3).length, 3)
})

test('candidate-to-boundary refinement and wide polar views preserve camera endpoints', async () => {
  const basemap = await loadBasemap()
  const target = await realHongshanBounds()
  for (const source of [[113.8568431, 30.021804299, 114.8188431, 30.983804299], [-90, 80, 90, 84]]) {
    const start = camera(basemap, source)
    const first = camera(basemap, basemap.interpolateMercatorView(source, target, .00001))
    first.forEach((value, i) => assert.ok(Math.abs(value - start[i]) < 1e-8))
    const end = camera(basemap, target)
    const last = camera(basemap, basemap.interpolateMercatorView(source, target, .99999))
    last.forEach((value, i) => assert.ok(Math.abs(value - end[i]) < 1e-8))
    assert.deepEqual(Array.from(basemap.interpolateMercatorView(source, target, 1)), target)
  }
})

test('production flight uses continuous camera, tile fade and soft boundary refinement', async () => {
  const client = await readFile(join(sourceRoot, 'client.tsx'), 'utf8')
  const styles = await readFile(join(sourceRoot, 'styles.css'), 'utf8')
  assert.match(client, /applyBounds\(flight\.sample\(progress\)\)/u)
  assert.match(client, /geoBoundsForView\(boundsRef\.current, cameraView\.current\.zoom, cameraView\.current\.pan\)/u)
  assert.match(client, /interpolateMercatorView\(arrivedBounds, boundaryBounds, progress\)/u)
  assert.match(client, /key=\{tile\.key\} tile=\{reprojectRasterTile/u)
  assert.match(styles, /\.gh-raster-tile \{ opacity: 0; transition: opacity \.32s ease-out/u)
  assert.doesNotMatch(styles.match(/@keyframes gh-flight-arrived \{[^\n]+/u)[0], /transform/u)
})

test('named-place inspection waits for a real target before flight, boundary reveal and imagery progress', async () => {
  const [client, styles] = await Promise.all([
    readFile(join(sourceRoot, 'client.tsx'), 'utf8'),
    readFile(join(sourceRoot, 'styles.css'), 'utf8'),
  ])
  assert.match(client, /const targetChanged = analysisTargetId !== null\s+&& analysisPlace !== null\s+&& analysisBounds !== null\s+&& lastFlightTargetId\.current !== analysisTargetId/u)
  assert.match(client, /if \(targetChanged\) \{\s+lastFlightTargetId\.current = analysisTargetId/u)
  assert.match(client, /data-inspection-stage=\{inspectionStage\}/u)
  assert.match(client, /boundaryRevealed && administrativeBoundaryPath !== ''/u)
  assert.match(client, /inspectionStage === 'inspection' && imageryTarget !== null/u)
  assert.match(client, /inspectionRevealed && activeInspection !== null/u)

  const boundaryResolving = client.indexOf("setInspectionStage('boundary-resolving')")
  const boundaryReady = client.indexOf("setInspectionStage('boundary-ready')")
  const inspection = client.indexOf("setInspectionStage('inspection')")
  const result = client.indexOf("setInspectionStage('result')")
  assert.ok(boundaryResolving > 0 && boundaryResolving < boundaryReady)
  assert.ok(boundaryReady < inspection)
  assert.ok(inspection < result)
  for (const selector of ['.gh-map-boundary-progress', '.gh-map-boundary-progress.is-ready', '.gh-agent { min-width: 0', '.gh-map-stage { position: relative; min-width: 0; min-height: 0; overflow: hidden']) {
    assert.ok(styles.includes(selector), `ordered inspection layout is missing ${selector}`)
  }
})
