import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'
import vm from 'node:vm'
import ts from 'typescript'

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const sourcePath = join(repositoryRoot, 'bundle', 'geoharness-bundle', 'src', 'browser-location.ts')

async function loadLocation(navigator) {
  const output = ts.transpileModule(await readFile(sourcePath, 'utf8'), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
    fileName: sourcePath,
  }).outputText
  const module = { exports: {} }
  vm.runInNewContext(output, { module, exports: module.exports, navigator }, { filename: sourcePath })
  return module.exports
}

test('a fresh empty session automatically requests location for prompt or granted permission', async () => {
  const location = await loadLocation({
    permissions: { query: async () => ({ state: 'prompt' }) },
    geolocation: { getCurrentPosition: () => {} },
  })
  assert.equal(await location.browserLocationPermission(), 'prompt')
  assert.equal(location.shouldAutoRequestBrowserLocation('prompt'), true)
  assert.equal(location.shouldAutoRequestBrowserLocation('granted'), true)
  assert.equal(location.shouldAutoRequestBrowserLocation('denied'), false)
  assert.equal(location.shouldAutoRequestBrowserLocation('unsupported'), false)
})

test('granted browser location returns bounded coordinates and an accuracy-aware viewport', async () => {
  let options
  const location = await loadLocation({
    permissions: { query: async () => ({ state: 'granted' }) },
    geolocation: {
      getCurrentPosition: (success, _failure, requestOptions) => {
        options = requestOptions
        success({
        coords: { longitude: 116.3975, latitude: 39.9087, accuracy: 35 },
        timestamp: 1234,
        })
      },
    },
  })
  const result = await location.requestBrowserLocation()
  assert.equal(result.ok, true)
  assert.equal(result.location.longitude, 116.3975)
  const bounds = location.locationViewportBounds(result.location)
  assert.ok(bounds[0] < result.location.longitude && bounds[2] > result.location.longitude)
  assert.ok(bounds[1] < result.location.latitude && bounds[3] > result.location.latitude)
  assert.equal(location.locationAccuracyLabel(35), '精度约 35 m')
  assert.equal(options.timeout, 30_000)
  assert.equal(options.enableHighAccuracy, true)
})

test('browser location classifies denied and unavailable states without throwing', async () => {
  const denied = await loadLocation({
    geolocation: { getCurrentPosition: (_success, failure) => failure({ code: 1 }) },
  })
  const unavailable = await loadLocation({
    geolocation: { getCurrentPosition: (_success, failure) => failure({ code: 2 }) },
  })
  assert.deepEqual({ ...(await denied.requestBrowserLocation()) }, { ok: false, reason: 'denied' })
  assert.deepEqual({ ...(await unavailable.requestBrowserLocation()) }, { ok: false, reason: 'unavailable' })
})

test('production client keeps location local and exposes explicit permission UI', async () => {
  const [client, styles, build] = await Promise.all([
    readFile(join(repositoryRoot, 'bundle', 'geoharness-bundle', 'src', 'client.tsx'), 'utf8'),
    readFile(join(repositoryRoot, 'bundle', 'geoharness-bundle', 'src', 'styles.css'), 'utf8'),
    readFile(join(repositoryRoot, 'bundle', 'geoharness-bundle', 'scripts', 'build-client.mjs'), 'utf8'),
  ])
  for (const marker of ['browserLocationPermission', 'requestBrowserLocation', 'shouldAutoRequestBrowserLocation', 'YOUR LOCATION · LOCAL ONLY', '定位到当前位置']) {
    assert.ok(client.includes(marker), `client is missing ${marker}`)
  }
  assert.doesNotMatch(client, /workspace_key:\s*sessionId,\s*(?:latitude|longitude):/u)
  assert.doesNotMatch(client, /(?:latitude|longitude):\s*userLocation/u)
  assert.ok(styles.includes('.gh-user-location'))
  assert.ok(build.includes("'./browser-location'"))
})
