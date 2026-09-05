import { readFileSync, readdirSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const SAFE_ID = /^[a-z0-9][a-z0-9._-]{0,119}$/u
const TOOL_NAME = /^[a-z][a-z0-9_]{0,119}$/u
const CAPABILITY = /^[a-z][a-z0-9.-]{0,119}$/u
const SEMVER = /^[0-9]+\.[0-9]+\.[0-9]+$/u
const MAP_EFFECTS = new Set(['none', 'add-layer', 'add-overlay', 'export'])

function object(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function json(path) {
  try {
    return JSON.parse(readFileSync(path, 'utf8'))
  } catch (error) {
    throw new Error(`Cannot read catalog JSON ${path}: ${error instanceof Error ? error.message : String(error)}`)
  }
}

function text(value, label, maxLength) {
  if (typeof value !== 'string' || value.length < 1 || value.length > maxLength) {
    throw new Error(`${label} must be a 1-${maxLength} character string`)
  }
  return value
}

export function validateDatasetCatalog(value, source = 'Dataset catalog') {
  if (!object(value)) throw new Error(`${source} must be an object`)
  if (value.schema_version !== '1.0') throw new Error(`${source} has unsupported schema_version ${String(value.schema_version)}`)
  if (typeof value.id !== 'string' || !SAFE_ID.test(value.id)) throw new Error(`${source} has an invalid id`)
  text(value.title, `${source}.title`, 180)
  text(value.description, `${source}.description`, 2_000)
  text(value.region, `${source}.region`, 300)
  text(value.crs, `${source}.crs`, 80)
  text(value.license, `${source}.license`, 300)
  if (!Array.isArray(value.layers) || value.layers.length < 1 || value.layers.length > 200) {
    throw new Error(`${source}.layers must contain 1-200 entries`)
  }
  const names = new Set()
  for (const [index, layer] of value.layers.entries()) {
    if (!object(layer) || typeof layer.name !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,119}$/u.test(layer.name)) {
      throw new Error(`${source}.layers[${index}] has an invalid name`)
    }
    if (names.has(layer.name)) throw new Error(`${source} has duplicate Layer ${layer.name}`)
    names.add(layer.name)
    text(layer.path, `${source}.layers[${index}].path`, 500)
    if (/\0/u.test(layer.path)) throw new Error(`${source}.layers[${index}].path contains a null byte`)
    text(layer.description, `${source}.layers[${index}].description`, 1_000)
  }
  return value
}

export function validateToolCatalog(value, source = 'Tool catalog') {
  if (!object(value)) throw new Error(`${source} must be an object`)
  if (value.schema_version !== '1.0') throw new Error(`${source} has unsupported schema_version ${String(value.schema_version)}`)
  if (typeof value.id !== 'string' || !SAFE_ID.test(value.id)) throw new Error(`${source} has an invalid id`)
  if (!Array.isArray(value.tools) || value.tools.length < 1 || value.tools.length > 200) {
    throw new Error(`${source}.tools must contain 1-200 entries`)
  }
  const names = new Set()
  for (const [index, tool] of value.tools.entries()) {
    const label = `${source}.tools[${index}]`
    if (!object(tool) || typeof tool.name !== 'string' || !TOOL_NAME.test(tool.name)) throw new Error(`${label} has an invalid name`)
    if (names.has(tool.name)) throw new Error(`${source} has duplicate Tool ${tool.name}`)
    names.add(tool.name)
    if (typeof tool.version !== 'string' || !SEMVER.test(tool.version)) throw new Error(`${label} has an invalid version`)
    if (typeof tool.capability !== 'string' || !CAPABILITY.test(tool.capability)) throw new Error(`${label} has an invalid capability`)
    text(tool.description, `${label}.description`, 2_000)
    if (!object(tool.parameters)) throw new Error(`${label}.parameters must be an object`)
    if (!object(tool.output) || tool.output.contract !== 'ToolResult@1.0' || typeof tool.output.creates_layer !== 'boolean') {
      throw new Error(`${label}.output must use ToolResult@1.0 and declare creates_layer`)
    }
    if (!Number.isSafeInteger(tool.timeout_ms) || tool.timeout_ms < 100 || tool.timeout_ms > 600_000) {
      throw new Error(`${label}.timeout_ms must be between 100 and 600000`)
    }
    if (!MAP_EFFECTS.has(tool.map_effect)) throw new Error(`${label}.map_effect is unsupported`)
  }
  return value
}

export function mergeToolCatalogs(catalogs) {
  const merged = []
  const owners = new Map()
  for (const [index, candidate] of catalogs.entries()) {
    const catalog = validateToolCatalog(candidate, `Tool catalog ${index + 1}`)
    for (const tool of catalog.tools) {
      const existing = owners.get(tool.name)
      if (existing !== undefined) {
        if (existing.tool.version !== tool.version) {
          throw new Error(`Tool version conflict for ${tool.name}: ${existing.tool.version} from ${existing.catalog} vs ${tool.version} from ${catalog.id}`)
        }
        throw new Error(`Duplicate Tool ${tool.name}@${tool.version} in ${existing.catalog} and ${catalog.id}`)
      }
      owners.set(tool.name, { catalog: catalog.id, tool })
      merged.push({ ...tool, catalog_id: catalog.id })
    }
  }
  return merged
}

export function loadBuiltinToolCatalog() {
  return validateToolCatalog(json(resolve(packageRoot, 'catalog', 'builtin-tools.json')), 'Built-in Tool catalog')
}

export function loadDatasetCatalogs(datasetRoot) {
  const root = resolve(datasetRoot)
  const catalogs = []
  for (const entry of readdirSync(root, { withFileTypes: true }).filter(item => item.isDirectory()).sort((left, right) => left.name.localeCompare(right.name))) {
    const path = join(root, entry.name, 'dataset.json')
    const catalog = validateDatasetCatalog(json(path), `Dataset catalog ${entry.name}`)
    if (catalog.id !== entry.name) throw new Error(`Dataset directory/id mismatch: ${entry.name} vs ${catalog.id}`)
    catalogs.push(catalog)
  }
  if (catalogs.length === 0) throw new Error(`No Dataset catalogs found under ${root}`)
  return catalogs
}

export function publicDatasetCatalog(catalog) {
  return {
    id: catalog.id,
    title: catalog.title,
    region: catalog.region,
    crs: catalog.crs,
    snapshot_date: catalog.snapshot_date ?? null,
    publishers: catalog.publishers ?? [],
    license: catalog.license,
    layers: catalog.layers.map(layer => layer.name),
    description: catalog.description,
  }
}

export function toolSpecsForDatasets(tools, datasets) {
  const datasetIds = datasets.map(item => item.id)
  return tools.map(tool => {
    const spec = { ...tool, parameters: structuredClone(tool.parameters) }
    if (spec.name === 'list_layers') spec.parameters.dataset_id.enum = datasetIds
    return spec
  })
}
