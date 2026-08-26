import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { basename, dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')
const scenariosRoot = resolve(repositoryRoot, 'examples', 'scenarios')

async function readJson(path) {
  return JSON.parse(await readFile(path, 'utf8'))
}

export async function validateScenarioPackage(id) {
  const root = resolve(scenariosRoot, id)
  const [manifest, plan, result, taskGraph, prompt, readme] = await Promise.all([
    readJson(resolve(root, 'scenario.json')),
    readJson(resolve(root, 'expected-plan.json')),
    readJson(resolve(root, 'expected-result.json')),
    readJson(resolve(root, 'task-graph.json')),
    readFile(resolve(root, 'prompt.txt'), 'utf8'),
    readFile(resolve(root, 'README.md'), 'utf8'),
  ])

  assert.equal(manifest.id, id)
  assert.equal(manifest.schema_version, '1.0')
  assert.equal(manifest.region, 'Manhattan, New York City')
  assert.equal(manifest.prompt, 'prompt.txt')
  assert.equal(manifest.expected_plan, 'expected-plan.json')
  assert.equal(manifest.expected_result, 'expected-result.json')
  assert.equal(manifest.task_graph, 'task-graph.json')
  assert.equal(manifest.fixture_profile, 'deterministic-manhattan-scale-v1')
  assert.ok(prompt.trim().length > 0)
  assert.ok(Array.isArray(manifest.data) && manifest.data.length > 0)
  assert.ok(Array.isArray(plan.required_capabilities) && plan.required_capabilities.length > 0)
  assert.ok(Array.isArray(result.required_output_layers) && result.required_output_layers.length > 0)
  assert.ok(Array.isArray(result.checks) && result.checks.length > 0)
  assert.equal(taskGraph.scenario_id, id)
  assert.equal(taskGraph.goal, prompt.trim())
  assert.ok(Array.isArray(taskGraph.steps) && taskGraph.steps.length > 0)
  const taskIds = new Set(taskGraph.steps.map(step => step.id))
  assert.equal(taskIds.size, taskGraph.steps.length)
  for (const step of taskGraph.steps) {
    assert.match(step.id, /^[a-z][a-z0-9_]*$/)
    assert.ok(typeof step.title === 'string' && step.title.length > 0)
    assert.ok(plan.required_capabilities.includes(step.tool))
    assert.ok(Array.isArray(step.dependencies) && step.dependencies.every(dependency => taskIds.has(dependency)))
    assert.ok(step.parameters && typeof step.parameters === 'object')
    assert.ok(Array.isArray(step.outputs))
  }

  for (const heading of [
    '## Real user need',
    '## User prompt',
    '## Input data',
    '### Data source and processing',
    '## Expected Agent behavior',
    '## Key GIS workflow',
    '## Success criteria',
    '## Demo focus',
  ]) {
    assert.match(readme, new RegExp(heading.replaceAll('#', '\\#')))
  }

  const data = {}
  for (const dataReference of manifest.data) {
    assert.match(dataReference, /^data\/[a-z-]+\.geojson$/)
    assert.ok(!dataReference.includes('..'), 'Scenario data must not escape its own folder')
    const collection = await readJson(resolve(root, ...dataReference.split('/')))
    assert.equal(collection.type, 'FeatureCollection')
    assert.equal(collection.name, basename(dataReference, '.geojson'))
    assert.equal(collection.crs?.properties?.name, 'urn:ogc:def:crs:OGC:1.3:CRS84')
    assert.equal(collection.metadata?.fixture, true)
    assert.equal(collection.metadata?.license, 'CC0-1.0')
    assert.ok(Array.isArray(collection.features) && collection.features.length > 0)
    for (const feature of collection.features) {
      assert.equal(feature.type, 'Feature')
      assert.ok(feature.geometry?.type)
      const ordinates = feature.geometry.coordinates.flat(Infinity)
      assert.ok(ordinates.length >= 4)
      assert.ok(ordinates.every(Number.isFinite))
    }
    assert.match(readme, new RegExp(dataReference.replace('.', '\\.')))
    data[collection.name] = collection
  }

  if (manifest.supports_revision) {
    assert.equal(manifest.revision_prompt, 'revision-prompt.txt')
    const revisionPrompt = await readFile(resolve(root, 'revision-prompt.txt'), 'utf8')
    assert.ok(revisionPrompt.trim().length > 0)
  } else {
    assert.equal(manifest.revision_prompt, null)
  }

  return { root, manifest, plan, result, taskGraph, prompt: prompt.trim(), readme, data }
}
