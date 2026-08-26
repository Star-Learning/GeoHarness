import { defineTool } from '@deepseek-ai/dsh-tools'

const SCENARIO_IDS = [
  '01-building-data-inspection',
  '02-river-building-query',
  '03-building-statistics-by-district',
  '04-road-accessibility',
  '05-parameter-revision',
  '06-multi-constraint-selection',
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
    name: 'inspect_dataset',
    description: 'Inspect one registered vector layer: feature count, geometry, CRS, fields, missing values, validity, bounds and area summary.',
    parameters: {
      input_layer: { type: 'string', required: true, description: 'Canonical input Layer ID.' },
      step_id: STEP_ID,
    },
  },
  {
    name: 'list_layers',
    description: 'List canonical layers. On the first GIS call, pass the matching Scenario id to load that independent package into this session workspace.',
    parameters: {
      scenario_id: { type: 'string', enum: SCENARIO_IDS, description: 'Optional official Scenario package to activate and load.' },
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
  if (spec.name === 'list_layers' && parameters.scenario_id !== undefined) {
    const scenarioId = parameters.scenario_id
    delete parameters.scenario_id
    await ctx.geo.execute({
      action: 'load_scenario',
      workspaceKey: workspaceKey(exec),
      scenarioId,
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
    text: `For a spatial request, follow Goal → Plan → Geo Tools → Layers → Map → Verify → Result. First call list_layers with the matching official scenario_id so its independent data package is loaded for this session: 01-building-data-inspection for understanding building data; 02-river-building-query for buildings within 500 m of Hudson/East River; 03-building-statistics-by-district for Community District statistics; 04-road-accessibility for buildings within 300 m of major roads by district; 05-parameter-revision for the 500 m major-road query; 06-multi-constraint-selection for road-near and river-far constraints. Use only returned Layer IDs, create metric CRS layers before distance operations, keep important intermediate output layers, inspect structured success fields, and never claim completion from prose alone.`,
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

export { SCENARIO_IDS, TOOL_SPECS }
