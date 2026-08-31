import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { access, readFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { pathToFileURL, fileURLToPath } from 'node:url'
import test from 'node:test'

import { registerGeoTools, SCENARIO_IDS } from '../bundle/geoharness-bundle/host/tools.js'

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const bundleRoot = join(repositoryRoot, 'bundle', 'geoharness-bundle')
const datasetRoot = join(repositoryRoot, 'examples', 'datasets')
const requireFromBundle = createRequire(join(bundleRoot, 'package.json'))

async function importFromBundle(packageName) {
  return import(pathToFileURL(requireFromBundle.resolve(packageName)).href)
}

test('seven official-data Scenario packages retain data, one test and one Demo each', async () => {
  assert.equal(SCENARIO_IDS.length, 7)
  for (const scenarioId of SCENARIO_IDS) {
    const root = join(repositoryRoot, 'examples', 'scenarios', scenarioId)
    await Promise.all([
      access(join(root, 'scenario.json')),
      access(join(root, 'prompt.txt')),
      access(join(root, 'data')),
      access(join(root, 'media', 'demo.gif')),
      access(join(repositoryRoot, 'tests', 'scenarios', `${scenarioId}.test.mjs`)),
      access(join(repositoryRoot, 'tests', 'regression', `${scenarioId}.regression.test.mjs`)),
    ])
  }
})

test('Native Agent reports unsupported v1 capabilities instead of fabricating results', async () => {
  const [{ Context }, { default: SystemPrompt }, { default: ToolRuntime }] = await Promise.all([
    importFromBundle('@deepseek-ai/cordis'),
    importFromBundle('@deepseek-ai/dsh-system-prompt'),
    importFromBundle('@deepseek-ai/dsh-tools'),
  ])
  const ctx = new Context()
  await ctx.plugin(SystemPrompt)
  await ctx.plugin(ToolRuntime)
  const diagnostics = registerGeoTools(ctx, { datasetRoot })
  const assembly = await ctx.systemPrompt.assemble()
  const prompt = assembly.sections.map(section => section.text).join('\n')

  assert.deepEqual(diagnostics.unsupported_capabilities, ['raster', 'network-analysis'])
  assert.match(prompt, /vector GIS capabilities only/u)
  assert.match(prompt, /raster, network-analysis/u)
  assert.match(prompt, /explicitly report the capability gap/u)
  assert.match(prompt, /do not fabricate a Layer or result/u)
  assert.equal(ctx.tools.schemas().some(schema => /raster|network/u.test(schema.name)), false)
})

test('production client remains Native Session driven and does not invoke Scenario planners', async () => {
  const client = await readFile(join(bundleRoot, 'src', 'client.tsx'), 'utf8')
  assert.match(client, /sessions\.history/u)
  assert.match(client, /projectAgentHistory\(/u)
  assert.match(client, /agent\/workspace/u)
  assert.doesNotMatch(client, /scenario\/(?:run|progress|latest|revise)/u)
  assert.doesNotMatch(client, /goal\/(?:run|start)/u)
  assert.doesNotMatch(client, /load_scenario|runScenario|reviseScenario/u)
  assert.doesNotMatch(client, /01-building-data-inspection|05-parameter-revision/u)
})

test('release artifacts pin compatibility and automate clean Windows/Linux lifecycle smoke', async () => {
  const [packageJson, bundleJson, workflow, lifecycle, release, compatibility, security, changelog] = await Promise.all([
    readFile(join(repositoryRoot, 'package.json'), 'utf8').then(JSON.parse),
    readFile(join(bundleRoot, 'package.json'), 'utf8').then(JSON.parse),
    readFile(join(repositoryRoot, '.github', 'workflows', 'ci.yml'), 'utf8'),
    readFile(join(repositoryRoot, 'scripts', 'verify-plugin-lifecycle.mjs'), 'utf8'),
    readFile(join(repositoryRoot, 'docs', 'releases', 'v1.0.0.md'), 'utf8'),
    readFile(join(repositoryRoot, 'docs', 'releases', 'compatibility-matrix.md'), 'utf8'),
    readFile(join(repositoryRoot, 'SECURITY.md'), 'utf8'),
    readFile(join(repositoryRoot, 'CHANGELOG.md'), 'utf8'),
  ])

  assert.equal(packageJson.version, '1.0.0')
  assert.equal(bundleJson.version, '1.0.0')
  assert.equal(bundleJson.peerDependencies['@deepseek-ai/cordis'], '4.0.1')
  for (const peer of ['@deepseek-ai/dsh-session', '@deepseek-ai/dsh-system-prompt', '@deepseek-ai/dsh-tools']) {
    assert.equal(bundleJson.peerDependencies[peer], '0.1.1-rc.2')
  }
  assert.match(workflow, /release-smoke:/u)
  assert.match(workflow, /os: \[ubuntu-latest, windows-latest\]/u)
  assert.match(workflow, /verify:plugin-lifecycle/u)
  assert.match(lifecycle, /mkdtemp\(join\(tmpdir\(\), 'geoharness-release-smoke-'/u)
  assert.match(lifecycle, /process\.env\.npm_execpath/u)
  assert.match(lifecycle, /command: process\.execPath/u)
  assert.match(lifecycle, /--host', '127\.0\.0\.1', '--port', '0'/u)
  assert.match(lifecycle, /plugin', '--profile', 'web', 'remove'/u)
  assert.match(release, /三个非预设用户上传 E2E/u)
  assert.match(release, /独立 GeoPandas\/Shapely oracle/u)
  assert.match(compatibility, /0\.1\.1-rc\.2/u)
  assert.match(compatibility, /Windows（主验收）、Ubuntu Linux（CI）/u)
  assert.match(security, /`1\.0\.x` \| Yes/u)
  assert.match(changelog, /\[1\.0\.0\] - 2026-08-31/u)
})
