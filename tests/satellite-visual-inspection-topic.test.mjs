import assert from 'node:assert/strict'
import { access, readFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const topicRoot = join(repositoryRoot, 'examples', 'topics', '03-satellite-visual-inspection')

test('satellite visual inspection Topic owns one prompt, source audit, test and real Demo', async () => {
  const [prompt, readme, source] = await Promise.all([
    readFile(join(topicRoot, 'prompt.md'), 'utf8'),
    readFile(join(topicRoot, 'README.md'), 'utf8'),
    readFile(join(topicRoot, 'data', 'source.json'), 'utf8').then(JSON.parse),
    access(join(topicRoot, 'media', 'final.png')),
  ])
  assert.match(prompt, /inspect_satellite_view/u)
  assert.match(prompt, /不得把显示像素占比写成真实面积/u)
  assert.match(readme, /最多读取 16 张瓦片/u)
  assert.equal(source.source, 'Esri World Imagery display tiles')
  assert.equal(source.classes.length, 4)
  assert.equal(source.limitations.length, 5)
  assert.equal(source.boundary_source, 'OpenStreetMap Nominatim')
  assert.ok(source.limitations.some((item) => /not an official or legal boundary/u.test(item)))
})

test('the client and Host connect progressive target, imagery Tool and map overlay without vector fallback', async () => {
  const [client, tools, runner, imagery, rpc, provider] = await Promise.all([
    readFile(join(repositoryRoot, 'bundle', 'geoharness-bundle', 'src', 'client.tsx'), 'utf8'),
    readFile(join(repositoryRoot, 'bundle', 'geoharness-bundle', 'host', 'tools.js'), 'utf8'),
    readFile(join(repositoryRoot, 'backend', 'geo-service', 'geoharness_geo', 'runner.py'), 'utf8'),
    readFile(join(repositoryRoot, 'backend', 'geo-service', 'geoharness_geo', 'imagery.py'), 'utf8'),
    readFile(join(repositoryRoot, 'bundle', 'geoharness-bundle', 'host', 'rpc.js'), 'utf8'),
    readFile(join(repositoryRoot, 'bundle', 'geoharness-bundle', 'host', 'provider.js'), 'utf8'),
  ])
  for (const marker of ['imagery/view', 'imagery/target', 'imagery/latest', 'imagery/preference', 'Prepare satellite visual inspection', 'Raster analysis layers', 'ADMIN BOUNDARY ANALYSIS', 'gh-imagery-inspection-overlay', 'gh-admin-boundary-outline', 'gh-map-inspection-progress', 'VISUAL SCREENING']) {
    assert.ok(client.includes(marker), `client is missing ${marker}`)
  }
  assert.match(tools, /call inspect_satellite_view/u)
  assert.match(runner, /inspect_satellite_view/u)
  assert.match(imagery, /MAX_TILES = 16/u)
  assert.match(imagery, /Esri World Geocoding Service/u)
  assert.match(imagery, /OpenStreetMap Nominatim/u)
  assert.match(imagery, /rasterize_boundary_mask/u)
  assert.match(imagery, /set_imagery_preference/u)
  assert.match(imagery, /latest_imagery_target/u)
  assert.match(imagery, /classifying-pixels/u)
  assert.match(rpc, /action: 'imagery_target'/u)
  assert.match(provider, /request\.action === 'imagery_target'/u)
  assert.doesNotMatch(imagery, /geopandas|GeoDataFrame|LayerRegistry/u)
  assert.doesNotMatch(client, /useEffect\(\(\) => \{[^}]*onViewChange/su)
  assert.match(client, /Decrease \$\{layer\.name\} opacity/u)
  assert.match(client, /Math\.round\(layer\.opacity \* 100\)/u)
})
