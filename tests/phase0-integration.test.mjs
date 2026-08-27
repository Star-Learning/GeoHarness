import assert from 'node:assert/strict'
import { readFile, access } from 'node:fs/promises'
import { constants } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import vm from 'node:vm'
import test from 'node:test'

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const upstreamRoot = resolve(repositoryRoot, '..', 'deepseek-harness')
const bundleRoot = join(repositoryRoot, 'bundle', 'geoharness-bundle')
const packageName = '@geoharness/harness-plugin'

async function readJson(path) {
  return JSON.parse(await readFile(path, 'utf8'))
}

test('the inspected DeepSeek Harness baseline is readable and still exposes the required integration points', async () => {
  const manifestPath = join(upstreamRoot, 'package.json')
  await access(manifestPath, constants.R_OK)
  const manifest = await readJson(manifestPath)
  assert.equal(manifest.version, '0.1.1-rc.2')
  const cordisManifest = await readJson(join(upstreamRoot, 'vendor', 'cordis', 'package.json'))
  assert.equal(cordisManifest.version, '4.0.1')

  const architecture = await readFile(join(upstreamRoot, 'docs', 'architecture.md'), 'utf8')
  const pluginSource = await readFile(join(upstreamRoot, 'apps', 'cli', 'src', 'plugin.ts'), 'utf8')
  const profileSource = await readFile(
    join(upstreamRoot, 'packages', 'boot', 'app-boot', 'src', 'profile.ts'),
    'utf8',
  )
  const clientModules = await readFile(
    join(upstreamRoot, 'packages', 'client', 'modules', 'src', 'index.ts'),
    'utf8',
  )
  const slotRuntime = await readFile(
    join(upstreamRoot, 'packages', 'client', 'runtime', 'src', 'client', 'slots.ts'),
    'utf8',
  )
  const conversationSlots = await readFile(
    join(upstreamRoot, 'packages', 'client', 'ui-conversation', 'src', 'client', 'contract', 'slots.ts'),
    'utf8',
  )
  const layoutSlots = await readFile(
    join(upstreamRoot, 'packages', 'client', 'ui-layout', 'src', 'client', 'index.ts'),
    'utf8',
  )
  const serviceGuide = await readFile(
    join(upstreamRoot, 'docs', 'user', 'develop', 'framework', 'service.md'),
    'utf8',
  )
  const webServiceReadme = await readFile(
    join(upstreamRoot, 'packages', 'web', 'web', 'README.md'),
    'utf8',
  )
  const toolsSource = await readFile(
    join(upstreamRoot, 'packages', 'core', 'tools', 'src', 'index.ts'),
    'utf8',
  )

  assert.match(architecture, /There is no privileged core to patch/)
  assert.match(pluginSource, /reconcilePlugins/)
  assert.match(profileSource, /dsh\.profile\.bundles/)
  assert.match(clientModules, /exports\["\.\/client"\]/)
  assert.match(clientModules, /dsh\.client/)
  assert.match(slotRuntime, /inject\(key: keyof SlotMap & string/)
  assert.match(conversationSlots, /'conversation\.view'/)
  assert.match(conversationSlots, /'conversation\.session\.header\.actions'/)
  assert.match(layoutSlots, /'shell\.overlay'/)
  assert.match(serviceGuide, /## Provide a service/)
  assert.match(serviceGuide, /## Consume a service/)
  assert.match(webServiceReadme, /Service Definition/)
  assert.match(webServiceReadme, /Providers register \*\*capabilities\*\*, not tools/)
  assert.match(webServiceReadme, /Consumer: the model-facing/)
  assert.match(toolsSource, /\bdefineTool,/)
})

test('the bundle manifest and patch form one installable dual-face plugin layer', async () => {
  const manifest = await readJson(join(bundleRoot, 'package.json'))
  assert.equal(manifest.name, packageName)
  assert.equal(manifest.dsh.bundle.patch, './cordis.patch.yml')
  assert.equal(manifest.dsh.client.platform, 'web')
  assert.equal(manifest.exports['./client'].default, './client.js')
  assert.deepEqual(manifest.peerDependencies, {
    '@deepseek-ai/cordis': '4.0.1',
    '@deepseek-ai/dsh-client-connection': '0.1.1-rc.2',
    '@deepseek-ai/dsh-system-prompt': '0.1.1-rc.2',
    '@deepseek-ai/dsh-tools': '0.1.1-rc.2',
  })
  assert.deepEqual(manifest.peerDependenciesMeta, {
    '@deepseek-ai/dsh-client-connection': { optional: true },
  })

  const patch = await readFile(join(bundleRoot, 'cordis.patch.yml'), 'utf8')
  assert.match(patch, /id: geoharness-plugin/)
  assert.match(patch, /name: '@geoharness\/harness-plugin'/)

  const hostPlugin = await import(pathToFileURL(join(bundleRoot, 'index.js')).href)
  assert.equal(hostPlugin.name, 'geoharness')
  assert.deepEqual(hostPlugin.inject, ['tools', 'systemPrompt'])
  assert.equal(typeof hostPlugin.apply, 'function')
  assert.equal(typeof hostPlugin.GeoRuntime, 'function')
  assert.equal(typeof hostPlugin.LocalPythonGeoProvider, 'function')
  assert.equal(typeof hostPlugin.registerGeoTools, 'function')
})

test('the browser artifact preserves native root chrome and replaces only GeoHarness product slots', async () => {
  const code = await readFile(join(bundleRoot, 'client.js'), 'utf8')
  let handoff
  const appendedStyles = []
  const document = {
    querySelector: () => null,
    createElement: (tagName) => ({ tagName, dataset: {}, textContent: '' }),
    head: { appendChild: (node) => appendedStyles.push(node) },
  }
  const window = {
    __ModuleLoader__: {
      load: (registration) => { handoff = registration },
    },
  }
  vm.runInNewContext(code, { document, JSON, window }, { filename: 'client.js' })

  assert.equal(handoff.id, packageName)
  const jsx = (type, props, key) => ({ type, props: props ?? {}, key })
  const React = {
    useEffect: effect => { effect() },
    useMemo: factory => factory(),
    useRef: initial => ({ current: initial }),
    useState: initial => [typeof initial === 'function' ? initial() : initial, () => {}],
  }
  const plugin = handoff.factory((specifier) => {
    if (specifier === 'react') return React
    if (specifier === 'react/jsx-runtime') return { Fragment: Symbol('fragment'), jsx, jsxs: jsx }
    throw new Error(`unexpected external: ${specifier}`)
  })
  assert.deepEqual([...plugin.inject], ['slots', 'connection'])

  const registrations = []
  const ctx = {
    slots: {
      register: (options, component) => {
        registrations.push({ options, component })
        return () => {}
      },
    },
    connection: { api: { sessions: {} }, rpc: {} },
  }
  plugin.apply(ctx)

  assert.equal(appendedStyles.length, 1)
  assert.equal(appendedStyles[0].dataset.plugin, packageName)
  assert.deepEqual(
    registrations.map(({ options }) => ({ name: options.name, priority: options.priority })),
    [
      { name: 'conversation.session', priority: -100 },
      { name: 'sidebar.brand.mark', priority: -100 },
      { name: 'sidebar.brand.name', priority: -100 },
    ],
  )
  assert.ok(registrations.every(({ options }) => options.children === undefined))
  assert.doesNotMatch(code, /name:\s*["']root["']/)
  assert.doesNotMatch(code, /name:\s*["']sidebar\.workspaces["']/)
  assert.doesNotMatch(code, /sidebar\.settings|conversation\.input\.model/)
})

test('the repository does not vendor DeepSeek Harness source', async () => {
  const rootManifest = await readJson(join(repositoryRoot, 'package.json'))
  assert.equal(rootManifest.private, true)
  assert.equal(createRequire(import.meta.url).resolve('./phase0-integration.test.mjs'), fileURLToPath(import.meta.url))
  await assert.rejects(access(join(repositoryRoot, 'deepseek-harness'), constants.F_OK))
})
