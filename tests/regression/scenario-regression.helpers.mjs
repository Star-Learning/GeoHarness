import { createRequire } from 'node:module'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { pathToFileURL, fileURLToPath } from 'node:url'

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')
export const scenarioRoot = join(repositoryRoot, 'examples', 'scenarios')
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
    import('../../bundle/geoharness-bundle/index.js'),
  ])
  const ctx = new Context()
  await ctx.plugin(SessionStore)
  await ctx.plugin(SystemPrompt)
  await ctx.plugin(ToolRuntime)
  await ctx.plugin(GeoPlugin, {
    workspaceRoot,
    backendRoot: join(repositoryRoot, 'backend', 'geo-service'),
    scenarioRoot,
  })
  return ctx
}

export async function runIndependentScenario(scenarioId) {
  const temporary = await mkdtemp(join(tmpdir(), `geoharness-phase8-${scenarioId}-`))
  try {
    const [{ runScenarioRegression }, ctx] = await Promise.all([
      import('../../bundle/geoharness-bundle/host/scenario-regression.js'),
      setup(temporary),
    ])
    return await runScenarioRegression(ctx, {
      scenarioId,
      scenarioRoot,
      workspaceKey: `phase8:${scenarioId}`,
    })
  } finally {
    await rm(temporary, { recursive: true, force: true })
  }
}
