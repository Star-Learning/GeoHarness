import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineTool } from '@deepseek-ai/dsh-tools'
import {
  loadBuiltinToolCatalog,
  loadDatasetCatalogs,
  mergeToolCatalogs,
  publicDatasetCatalog,
  toolSpecsForDatasets,
} from './catalog.js'

const SCENARIO_IDS = [
  '01-building-data-inspection',
  '02-river-building-query',
  '03-building-statistics-by-district',
  '04-road-accessibility',
  '05-parameter-revision',
  '06-multi-constraint-selection',
  '07-official-nyc-building-inspection',
]

const OUTPUT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    success: { type: 'boolean', required: true },
    tool: { type: 'string', required: true },
    step_id: { oneOf: [{ type: 'string' }, { type: 'null' }], required: true },
    inputs: { type: 'array', required: true, items: { type: 'string' } },
    parameters: { type: 'object', required: true, additionalProperties: true },
    outputs: { type: 'array', required: true, items: { type: 'string' } },
    summary: { type: 'string', required: true },
    warnings: { type: 'array', required: true, items: { type: 'string' } },
    data: { type: 'object', required: true, additionalProperties: true },
  },
}

const BUILTIN_TOOL_CATALOG = loadBuiltinToolCatalog()
const TOOL_SPECS = mergeToolCatalogs([BUILTIN_TOOL_CATALOG])
const BUILTIN_TOOL_NAMES = new Set(TOOL_SPECS.map(tool => tool.name))
const defaultDatasetRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', 'examples', 'datasets')

function workspaceKey(exec) {
  return exec.agent?.session?.id ?? 'direct'
}

function renderResult(value) {
  const details = Object.keys(value.data).length === 0 ? '' : `\nData:\n${JSON.stringify(value.data, null, 2)}`
  const outputs = value.outputs.length === 0 ? '' : `\nOutput layers: ${value.outputs.join(', ')}`
  const warnings = value.warnings.length === 0 ? '' : `\nWarnings: ${value.warnings.join('; ')}`
  const text = `${value.success ? 'Geo operation succeeded' : 'Geo operation failed'}: ${value.summary}${outputs}${warnings}${details}`
  return text.length <= 12_000 ? text : `${text.slice(0, 12_000)}\n… [Geo result truncated]`
}

async function executeBuiltin(ctx, spec, args, exec, datasets) {
  const parameters = { ...args }
  const stepId = parameters.step_id ?? String(exec.callId)
  delete parameters.step_id
  if (spec.name === 'discover_datasets') {
    return {
      success: true,
      tool: spec.name,
      step_id: stepId,
      inputs: [],
      parameters: {},
      outputs: [],
      summary: `${datasets.length} reusable official dataset catalog is available.`,
      warnings: [],
      data: { datasets: datasets.map(publicDatasetCatalog) },
    }
  }
  if (spec.name === 'list_layers' && parameters.dataset_id !== undefined) {
    const datasetId = parameters.dataset_id
    delete parameters.dataset_id
    await ctx.geo.execute({ action: 'load_dataset', workspaceKey: workspaceKey(exec), datasetId, reset: true }, exec.signal)
  }
  return ctx.geo.execute({
    action: 'tool',
    workspaceKey: workspaceKey(exec),
    tool: spec.name,
    step_id: stepId,
    request_id: String(exec.callId),
    parameters,
  }, exec.signal)
}

async function executeExtension(ctx, spec, executor, args, exec) {
  const parameters = { ...args }
  const stepId = parameters.step_id ?? String(exec.callId)
  delete parameters.step_id
  const value = await executor(parameters, { ctx, exec, spec, stepId, workspaceKey: workspaceKey(exec) })
  return { ...value, tool: spec.name, step_id: value.step_id ?? stepId }
}

export function registerGeoTools(ctx, options = {}) {
  const datasets = options.datasets ?? loadDatasetCatalogs(options.datasetRoot ?? defaultDatasetRoot)
  const catalogs = [BUILTIN_TOOL_CATALOG, ...(options.toolCatalogs ?? [])]
  const merged = toolSpecsForDatasets(mergeToolCatalogs(catalogs), datasets)
  const executors = options.executors ?? {}
  const registered = []
  const unavailable = []
  for (const spec of merged) {
    const builtin = BUILTIN_TOOL_NAMES.has(spec.name)
    const executor = executors[spec.name]
    if (!builtin && typeof executor !== 'function') {
      unavailable.push({ name: spec.name, version: spec.version, capability: spec.capability, catalog_id: spec.catalog_id })
      continue
    }
    ctx.tools.register(defineTool({
      name: spec.name,
      description: spec.description,
      parameters: spec.parameters,
      output: {
        schema: OUTPUT_SCHEMA,
        render: (_args, value) => [{ type: 'text', text: renderResult(value) }],
        presentationMeta: (_args, value) => ({
          tool: value.tool,
          tool_version: spec.version,
          capability: spec.capability,
          map_effect: spec.map_effect,
          success: value.success,
          outputs: value.outputs,
          summary: value.summary,
          warnings: value.warnings,
          data: value.data,
        }),
      },
      timeoutMs: spec.timeout_ms,
      execute: (args, exec) => builtin
        ? executeBuiltin(ctx, spec, args, exec, datasets)
        : executeExtension(ctx, spec, executor, args, exec),
      presentCall: args => ({ card: 'generic', title: `Geo · ${spec.name}`, rawInput: JSON.stringify(args, null, 2) }),
      presentResult: () => ({ card: 'generic' }),
    }))
    registered.push({ name: spec.name, version: spec.version, capability: spec.capability, map_effect: spec.map_effect })
  }

  const unavailableText = unavailable.length === 0
    ? ''
    : ` Unavailable declared capabilities: ${unavailable.map(item => `${item.capability} (${item.name}@${item.version})`).join(', ')}. Tell the user these capabilities are not installed; never fabricate their results.`
  ctx.systemPrompt.section({
    name: 'tool:geoharness',
    order: 118,
    text: `For every spatial request, plan from the user's actual goal rather than selecting a predefined analysis. Follow Goal → Plan → Geo Tools → Layers → Map → Verify → Result. If the workspace has no suitable data, call discover_datasets, choose a catalog from its declared region/layers, then call list_layers with that dataset_id. Reuse existing Layer IDs for conversational revisions. Choose and sequence Geo tools yourself from the goal; never infer distance, predicate, field, output, or conclusion from a sample Scenario. Use only returned Layer IDs, create metric CRS layers before distance operations, preserve useful intermediate layers, inspect every structured success field, and never claim completion from prose alone. State when the available catalog cannot support the request.${unavailableText}`,
  })
  return { schema_version: '1.0', registered, unavailable, datasets: datasets.map(publicDatasetCatalog) }
}

export { BUILTIN_TOOL_CATALOG, OUTPUT_SCHEMA, SCENARIO_IDS, TOOL_SPECS }
