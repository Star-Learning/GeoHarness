import { defineTool } from '@deepseek-ai/dsh-tools'

const SCENARIO_IDS = [
  '01-building-data-inspection',
  '02-river-building-query',
  '03-building-statistics-by-district',
  '04-road-accessibility',
  '05-parameter-revision',
  '06-multi-constraint-selection',
  '07-official-nyc-building-inspection',
]

const DATASET_CATALOG = [
  {
    id: 'nyc-core-official',
    title: 'NYC Core Official GIS Catalog',
    region: 'Manhattan, New York City',
    snapshot_date: '2026-08-27',
    layers: ['buildings', 'roads', 'rivers', 'districts', 'lower_manhattan_buildings'],
    description: 'Reusable official NYC vector layers for agent-planned inspection, distance, accessibility, aggregation and multi-constraint analysis.',
  },
]

const STEP_ID = {
  type: 'string',
  description: 'Optional stable Task Graph step id. Omit to use the Harness tool-call id.',
}

const OUTPUT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    success: { type: 'boolean', required: true },
    tool: { type: 'string', required: true },
    step_id: {
      oneOf: [{ type: 'string' }, { type: 'null' }],
      required: true,
    },
    inputs: { type: 'array', required: true, items: { type: 'string' } },
    parameters: { type: 'object', required: true, additionalProperties: true },
    outputs: { type: 'array', required: true, items: { type: 'string' } },
    summary: { type: 'string', required: true },
    warnings: { type: 'array', required: true, items: { type: 'string' } },
    data: { type: 'object', required: true, additionalProperties: true },
  },
}

const TOOL_SPECS = [
  {
    name: 'discover_datasets',
    description: 'Discover reusable real-data catalogs available to this GeoHarness deployment. This returns data capabilities only; it does not prescribe a workflow.',
    parameters: {
      step_id: STEP_ID,
    },
  },
  {
    name: 'inspect_dataset',
    description: 'Inspect one registered vector layer: feature count, geometry, CRS, fields, missing values, validity, bounds and area summary.',
    parameters: {
      input_layer: { type: 'string', required: true, description: 'Canonical input Layer ID.' },
      step_id: STEP_ID,
    },
  },
  {
    name: 'list_layers',
    description: 'List canonical layers in this Agent workspace. Pass a dataset_id to load that reusable real-data catalog before analysis.',
    parameters: {
      dataset_id: { type: 'string', enum: DATASET_CATALOG.map(item => item.id), description: 'Optional official Dataset catalog to activate and load.' },
      step_id: STEP_ID,
    },
  },
  {
    name: 'transform_crs',
    description: 'Transform a registered vector layer to a target CRS and register the derived layer.',
    parameters: {
      input_layer: { type: 'string', required: true },
      target_crs: { type: 'string', required: true, description: 'CRS such as EPSG:32618.' },
      output_name: { type: 'string' },
      step_id: STEP_ID,
    },
  },
  {
    name: 'create_buffer',
    description: 'Create a positive metric buffer around a layer and register it with lineage.',
    parameters: {
      input_layer: { type: 'string', required: true },
      distance: { type: 'number', required: true },
      unit: { type: 'string', enum: ['meter', 'meters', 'm', 'kilometer', 'kilometers', 'km'], default: 'meter' },
      metric_crs: { type: 'string', default: 'EPSG:32618' },
      dissolve: { type: 'boolean', default: true },
      output_name: { type: 'string' },
      step_id: STEP_ID,
    },
  },
  {
    name: 'spatial_filter',
    description: 'Select features by attribute equality and/or a spatial predicate against a mask layer.',
    parameters: {
      input_layer: { type: 'string', required: true },
      mask_layer: { type: 'string' },
      predicate: { type: 'string', enum: ['intersects', 'within', 'contains', 'disjoint', 'touches'], default: 'intersects' },
      where: { type: 'object', additionalProperties: true, description: 'Optional field-to-value equality map.' },
      output_name: { type: 'string' },
      step_id: STEP_ID,
    },
  },
  {
    name: 'spatial_join',
    description: 'Join right-layer attributes onto left-layer features using an explicit spatial predicate.',
    parameters: {
      left_layer: { type: 'string', required: true },
      right_layer: { type: 'string', required: true },
      predicate: { type: 'string', enum: ['intersects', 'within', 'contains', 'touches'], default: 'within' },
      how: { type: 'string', enum: ['left', 'inner', 'right'], default: 'left' },
      output_name: { type: 'string' },
      step_id: STEP_ID,
    },
  },
  {
    name: 'clip_layer',
    description: 'Clip an input vector layer to another registered mask layer.',
    parameters: {
      input_layer: { type: 'string', required: true },
      clip_layer: { type: 'string', required: true },
      output_name: { type: 'string' },
      step_id: STEP_ID,
    },
  },
  {
    name: 'aggregate_by_region',
    description: 'Aggregate feature count and area sum by a region field, returning a derived region statistics layer.',
    parameters: {
      input_layer: { type: 'string', required: true },
      regions_layer: { type: 'string', required: true },
      group_field: { type: 'string', required: true },
      area_field: { type: 'string', default: 'area_m2' },
      output_name: { type: 'string', default: 'region_statistics' },
      step_id: STEP_ID,
    },
  },
  {
    name: 'calculate_geometry',
    description: 'Calculate metric area and length fields for every feature and register the derived layer.',
    parameters: {
      input_layer: { type: 'string', required: true },
      metric_crs: { type: 'string', default: 'EPSG:32618' },
      area_field: { type: 'string', default: 'area_m2' },
      length_field: { type: 'string', default: 'length_m' },
      output_name: { type: 'string' },
      step_id: STEP_ID,
    },
  },
  {
    name: 'nearest_features',
    description: 'Find the nearest target feature for every input feature and record metric distance.',
    parameters: {
      input_layer: { type: 'string', required: true },
      target_layer: { type: 'string', required: true },
      max_distance: { type: 'number' },
      metric_crs: { type: 'string', default: 'EPSG:32618' },
      output_name: { type: 'string' },
      step_id: STEP_ID,
    },
  },
  {
    name: 'analyze_distribution',
    description: 'Summarize selected numeric or categorical fields without creating a derived layer.',
    parameters: {
      input_layer: { type: 'string', required: true },
      fields: { type: 'array', items: { type: 'string' } },
      step_id: STEP_ID,
    },
  },
  {
    name: 'export_layer',
    description: 'Export a registered layer to a workspace-local GeoJSON, GeoPackage or CSV file.',
    parameters: {
      input_layer: { type: 'string', required: true },
      format: { type: 'string', enum: ['geojson', 'gpkg', 'csv'], default: 'geojson' },
      file_name: { type: 'string' },
      step_id: STEP_ID,
    },
  },
]

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

async function executeSpec(ctx, spec, args, exec) {
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
      summary: `${DATASET_CATALOG.length} reusable official dataset catalog is available.`,
      warnings: [],
      data: { datasets: DATASET_CATALOG },
    }
  }
  if (spec.name === 'list_layers' && parameters.dataset_id !== undefined) {
    const datasetId = parameters.dataset_id
    delete parameters.dataset_id
    await ctx.geo.execute({
      action: 'load_dataset',
      workspaceKey: workspaceKey(exec),
      datasetId,
      reset: true,
    }, exec.signal)
  }
  return ctx.geo.execute({
    action: 'tool',
    workspaceKey: workspaceKey(exec),
    tool: spec.name,
    step_id: stepId,
    parameters,
  }, exec.signal)
}

export function registerGeoTools(ctx) {
  ctx.systemPrompt.section({
    name: 'tool:geoharness',
    order: 118,
    text: `For every spatial request, plan from the user's actual goal rather than selecting a predefined analysis. Follow Goal → Plan → Geo Tools → Layers → Map → Verify → Result. If the workspace has no suitable data, call discover_datasets, choose a catalog from its declared region/layers, then call list_layers with that dataset_id. Reuse existing Layer IDs for conversational revisions. Choose and sequence Geo tools yourself from the goal; never infer distance, predicate, field, output, or conclusion from a sample Scenario. Use only returned Layer IDs, create metric CRS layers before distance operations, preserve useful intermediate layers, inspect every structured success field, and never claim completion from prose alone. State when the available catalog cannot support the request.`,
  })

  for (const spec of TOOL_SPECS) {
    ctx.tools.register(defineTool({
      name: spec.name,
      description: spec.description,
      parameters: spec.parameters,
      output: {
        schema: OUTPUT_SCHEMA,
        render: (_args, value) => [{ type: 'text', text: renderResult(value) }],
        presentationMeta: (_args, value) => ({
          tool: value.tool,
          success: value.success,
          outputs: value.outputs,
          summary: value.summary,
          warnings: value.warnings,
          data: value.data,
        }),
      },
      timeoutMs: 120_000,
      execute: (args, exec) => executeSpec(ctx, spec, args, exec),
      presentCall: args => ({
        card: 'generic',
        title: `Geo · ${spec.name}`,
        rawInput: JSON.stringify(args, null, 2),
      }),
      presentResult: () => ({ card: 'generic' }),
    }))
  }
}

export { DATASET_CATALOG, SCENARIO_IDS, TOOL_SPECS }
