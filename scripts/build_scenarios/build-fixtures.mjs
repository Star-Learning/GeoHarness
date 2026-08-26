import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, isAbsolute, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')
const scenariosRoot = resolve(repositoryRoot, 'examples', 'scenarios')
const checkOnly = process.argv.includes('--check')
const generatedOn = '2026-08-27'

const round = value => Number(value.toFixed(7))
const coordinate = (xMeters, yMeters) => [
  round(-74 + xMeters / 85_000),
  round(40.7 + yMeters / 111_000),
]

const polygon = (minX, minY, maxX, maxY) => ({
  type: 'Polygon',
  coordinates: [[
    coordinate(minX, minY),
    coordinate(maxX, minY),
    coordinate(maxX, maxY),
    coordinate(minX, maxY),
    coordinate(minX, minY),
  ]],
})

const line = (x1, y1, x2, y2) => ({
  type: 'LineString',
  coordinates: [coordinate(x1, y1), coordinate(x2, y2)],
})

const featureCollection = (name, features) => ({
  type: 'FeatureCollection',
  name,
  crs: {
    type: 'name',
    properties: { name: 'urn:ogc:def:crs:OGC:1.3:CRS84' },
  },
  metadata: {
    fixture: true,
    region: 'Manhattan, New York City',
    coordinate_reference_system: 'OGC:CRS84',
    source: 'GeoHarness deterministic Manhattan-scale fixture',
    license: 'CC0-1.0',
    generated_on: generatedOn,
  },
  features,
})

const buildingCenters = [
  [150, 300, 18, 'residential', 12],
  [400, 700, 28, 'mixed_use', 20],
  [650, 1100, 12, 'commercial', 8],
  [800, 1500, 35, 'residential', 24],
  [1000, 1900, 42, 'office', 16],
  [1200, 2300, 22, 'residential', 18],
  [1600, 500, null, 'institutional', 6],
  [1800, 900, 16, 'residential', 10],
  [2200, 1300, 31, 'commercial', 14],
  [2550, 1700, 26, 'mixed_use', 22],
  [2700, 2100, 14, 'residential', 9],
  [2850, 2500, 20, 'residential', 11],
]

const buildings = featureCollection('buildings', buildingCenters.map((entry, index) => {
  const [x, y, height, use, units] = entry
  const id = `b${String(index + 1).padStart(2, '0')}`
  return {
    type: 'Feature',
    id,
    properties: {
      building_id: id,
      name: `Demo Building ${String(index + 1).padStart(2, '0')}`,
      use,
      height_m: height,
      units,
    },
    geometry: polygon(x - 30, y - 30, x + 30, y + 30),
  }
}))

const roads = featureCollection('roads', [
  {
    type: 'Feature',
    id: 'road-major-01',
    properties: { road_id: 'road-major-01', name: 'Manhattan Demo Avenue', road_class: 'major' },
    geometry: line(1000, -100, 1000, 3100),
  },
  {
    type: 'Feature',
    id: 'road-local-01',
    properties: { road_id: 'road-local-01', name: 'East Demo Street', road_class: 'local' },
    geometry: line(2500, -100, 2500, 3100),
  },
])

const rivers = featureCollection('rivers', [
  {
    type: 'Feature',
    id: 'river-hudson',
    properties: { river_id: 'river-hudson', name: 'Hudson River' },
    geometry: polygon(-100, -100, 0, 3100),
  },
  {
    type: 'Feature',
    id: 'river-east',
    properties: { river_id: 'river-east', name: 'East River' },
    geometry: polygon(3000, -100, 3100, 3100),
  },
])

const districts = featureCollection('districts', [
  {
    type: 'Feature',
    id: 'district-west',
    properties: { district_id: 'MN-DEMO-01', name: 'Demo Community District West' },
    geometry: polygon(-100, -100, 1500, 3100),
  },
  {
    type: 'Feature',
    id: 'district-east',
    properties: { district_id: 'MN-DEMO-02', name: 'Demo Community District East' },
    geometry: polygon(1500, -100, 3100, 3100),
  },
])

const datasets = { buildings, roads, rivers, districts }

const definitions = [
  {
    id: '01-building-data-inspection',
    title: 'Building Data Inspection',
    prompt: '帮我看看这个建筑数据有什么特点。',
    data: ['buildings'],
    need: '在不手工打开属性表或选择 GIS 工具的情况下理解一份建筑矢量数据。',
    behavior: ['Inspect dataset', 'Identify geometry and CRS', 'Summarize fields and missing values', 'Validate geometries', 'Calculate area and basic statistics', 'Present a map summary'],
    steps: ['inspect_dataset', 'calculate_geometry', 'analyze_distribution'],
    success: '报告 12 个 Polygon 要素、OGC:CRS84、1 个缺失 height_m，且所有几何有效。',
    video: 'AI 能不能自己看懂一份 GIS 数据？',
    expectedPlan: {
      required_capabilities: ['inspect_dataset', 'calculate_geometry', 'analyze_distribution'],
      constraints: { input_layer: 'buildings' },
    },
    expectedResult: {
      required_output_layers: ['buildings'],
      expected: { feature_count: 12, geometry_type: 'Polygon', crs: 'OGC:CRS84', invalid_geometry_count: 0, missing_height_m_count: 1 },
      checks: ['feature_count == 12', 'geometry_type == Polygon', 'invalid_geometry_count == 0', 'total_building_area_m2 > 0'],
    },
  },
  {
    id: '02-river-building-query',
    title: 'River Building Query',
    prompt: '找出距离 Hudson River 和 East River 500 米以内的建筑，并告诉我一共有多少栋。',
    data: ['buildings', 'rivers'],
    need: '从建筑与水系图层中找出河流邻近建筑，而无需用户知道投影、缓冲区或空间筛选。',
    behavior: ['Inspect both layers', 'Transform to a metric CRS', 'Create a 500 m river buffer', 'Filter intersecting buildings', 'Count candidates', 'Show intermediate and final layers'],
    steps: ['inspect_dataset', 'transform_crs', 'create_buffer', 'spatial_filter', 'analyze_distribution'],
    success: '生成 river_buffer 和 candidate_buildings，并得到 5 个候选建筑。',
    video: '只说一句话，AI 自己完成 Buffer + 空间筛选。',
    expectedPlan: {
      required_capabilities: ['inspect_dataset', 'transform_crs', 'create_buffer', 'spatial_filter', 'analyze_distribution'],
      constraints: { distance: 500, unit: 'meter', river_names: ['Hudson River', 'East River'] },
    },
    expectedResult: {
      required_output_layers: ['river_buffer', 'candidate_buildings'],
      expected: { candidate_buildings_count: 5 },
      checks: ['candidate_buildings_count == 5', 'all_candidates_within_500m_of_river == true'],
    },
  },
  {
    id: '03-building-statistics-by-district',
    title: 'Building Statistics by District',
    prompt: '按 Community District 统计建筑数量和建筑总面积。',
    data: ['buildings', 'districts'],
    need: '按行政区汇总建筑数量与面积，并把表格统计与专题图关联。',
    behavior: ['Inspect buildings and districts', 'Calculate building area', 'Spatially join district attributes', 'Aggregate count and area', 'Render a thematic result'],
    steps: ['inspect_dataset', 'calculate_geometry', 'spatial_join', 'aggregate_by_region'],
    success: '两个 Demo Community District 各统计到 6 个建筑，总计 12 个，面积总和为正。',
    video: '一句话让 AI 自动做分区统计。',
    expectedPlan: {
      required_capabilities: ['inspect_dataset', 'calculate_geometry', 'spatial_join', 'aggregate_by_region'],
      constraints: { group_field: 'district_id', metrics: ['count', 'area_sum_m2'] },
    },
    expectedResult: {
      required_output_layers: ['buildings_with_district', 'district_statistics'],
      expected: { total_buildings_count: 12, district_counts: { 'MN-DEMO-01': 6, 'MN-DEMO-02': 6 } },
      checks: ['total_buildings_count == 12', 'district_count == 2', 'all_district_area_sums_m2 > 0'],
    },
  },
  {
    id: '04-road-accessibility',
    title: 'Road Accessibility',
    prompt: '找出距离主要道路 300 米以内的建筑，并按 Community District 统计数量。',
    data: ['buildings', 'roads', 'districts'],
    need: '组合属性过滤、距离分析和分区统计来理解主要道路可达建筑。',
    behavior: ['Identify roads where road_class is major', 'Transform to a metric CRS', 'Create a 300 m road buffer', 'Filter buildings', 'Join districts', 'Aggregate candidate counts'],
    steps: ['inspect_dataset', 'spatial_filter', 'transform_crs', 'create_buffer', 'spatial_join', 'aggregate_by_region'],
    success: '筛选到 3 个建筑，全部位于 MN-DEMO-01，并生成可视化中间图层。',
    video: 'AI 能否自己组合多个 GIS 工具？',
    expectedPlan: {
      required_capabilities: ['inspect_dataset', 'spatial_filter', 'transform_crs', 'create_buffer', 'spatial_join', 'aggregate_by_region'],
      constraints: { road_class: 'major', distance: 300, unit: 'meter', group_field: 'district_id' },
    },
    expectedResult: {
      required_output_layers: ['major_roads', 'major_road_buffer', 'accessible_buildings', 'accessibility_by_district'],
      expected: { accessible_buildings_count: 3, district_counts: { 'MN-DEMO-01': 3, 'MN-DEMO-02': 0 } },
      checks: ['accessible_buildings_count == 3', 'all_candidates_within_300m_of_major_road == true'],
    },
  },
  {
    id: '05-parameter-revision',
    title: 'Parameter Revision',
    prompt: '找出距离主要道路 500 米以内的建筑。',
    revisionPrompt: '改成 1 公里。',
    data: ['buildings', 'roads'],
    need: '证明自然语言修改可以更新已有 GIS 工作流参数并只重算下游步骤。',
    behavior: ['Build and retain the initial Task Graph', 'Run a 500 m major-road query', 'Recognize a distance-only revision', 'Invalidate downstream steps', 'Rerun buffer and spatial filter at 1000 m', 'Preserve run history and lineage'],
    steps: ['inspect_dataset', 'spatial_filter', 'transform_crs', 'create_buffer', 'spatial_filter'],
    success: '初始结果为 4 个建筑；修改后为 8 个；仅 buffer 及其下游步骤重跑。',
    video: '不是重新问一次，而是真正修改正在执行的 GIS 工作流。',
    expectedPlan: {
      required_capabilities: ['inspect_dataset', 'spatial_filter', 'transform_crs', 'create_buffer'],
      constraints: { road_class: 'major', distance: 500, unit: 'meter' },
      revision: { prompt: '改成 1 公里。', distance: 1000, unit: 'meter', rerun_from_capability: 'create_buffer' },
    },
    expectedResult: {
      required_output_layers: ['major_road_buffer', 'candidate_buildings'],
      expected: { initial_candidate_count: 4, revised_candidate_count: 8, retained_history_entries: 2 },
      checks: ['initial_candidate_count == 4', 'revised_candidate_count == 8', 'unchanged_upstream_steps_are_reused == true', 'downstream_lineage_is_updated == true'],
    },
  },
  {
    id: '06-multi-constraint-selection',
    title: 'Multi-Constraint Selection',
    prompt: '找出距离主要道路 300 米以内，同时距离 Hudson River 和 East River 至少 800 米的建筑。',
    data: ['buildings', 'roads', 'rivers'],
    need: '把道路邻近与河流避让两个空间约束组合成可解释的布尔筛选工作流。',
    behavior: ['Parse both spatial constraints', 'Identify major roads', 'Transform to a metric CRS', 'Build 300 m road and 800 m river buffers', 'Select inside-road candidates', 'Exclude river-buffer candidates', 'Explain and map the final result'],
    steps: ['inspect_dataset', 'spatial_filter', 'transform_crs', 'create_buffer', 'spatial_filter', 'analyze_distribution'],
    success: '得到 2 个同时满足 road distance <= 300 m 且 river distance >= 800 m 的建筑。',
    video: '从单个 Tool Calling 升级到真正的 Agent Planning。',
    expectedPlan: {
      required_capabilities: ['inspect_dataset', 'spatial_filter', 'transform_crs', 'create_buffer', 'analyze_distribution'],
      constraints: { road_class: 'major', maximum_road_distance: 300, minimum_river_distance: 800, unit: 'meter', boolean_logic: 'inside road buffer AND outside river buffer' },
    },
    expectedResult: {
      required_output_layers: ['major_road_buffer', 'river_exclusion_buffer', 'candidate_buildings'],
      expected: { candidate_buildings_count: 2 },
      checks: ['candidate_buildings_count == 2', 'all_candidates_within_300m_of_major_road == true', 'all_candidates_at_least_800m_from_river == true'],
    },
  },
]

const taskGraphSteps = {
  '01-building-data-inspection': [
    {
      id: 'inspect_buildings', title: 'Inspect building dataset', tool: 'inspect_dataset',
      dependencies: [], parameters: { input_layer: { $layer: 'buildings' } }, outputs: [],
    },
    {
      id: 'calculate_building_geometry', title: 'Calculate building geometry', tool: 'calculate_geometry',
      dependencies: ['inspect_buildings'],
      parameters: { input_layer: { $layer: 'buildings' }, output_name: 'buildings_with_geometry' },
      outputs: ['buildings_with_geometry'],
    },
    {
      id: 'summarize_buildings', title: 'Summarize fields and geometry', tool: 'analyze_distribution',
      dependencies: ['calculate_building_geometry'],
      parameters: { input_layer: { $layer: 'buildings_with_geometry' }, fields: ['height_m', 'use', 'area_m2'] },
      outputs: [],
    },
  ],
  '02-river-building-query': [
    {
      id: 'inspect_buildings', title: 'Inspect buildings', tool: 'inspect_dataset',
      dependencies: [], parameters: { input_layer: { $layer: 'buildings' } }, outputs: [],
    },
    {
      id: 'inspect_rivers', title: 'Inspect river boundaries', tool: 'inspect_dataset',
      dependencies: [], parameters: { input_layer: { $layer: 'rivers' } }, outputs: [],
    },
    {
      id: 'transform_rivers', title: 'Transform rivers to metric CRS', tool: 'transform_crs',
      dependencies: ['inspect_rivers'],
      parameters: { input_layer: { $layer: 'rivers' }, target_crs: 'EPSG:32618', output_name: 'rivers_metric' },
      outputs: ['rivers_metric'],
    },
    {
      id: 'buffer_rivers', title: 'Create 500 m river buffer', tool: 'create_buffer',
      dependencies: ['transform_rivers'],
      parameters: { input_layer: { $layer: 'rivers_metric' }, distance: 500, unit: 'meter', output_name: 'river_buffer' },
      outputs: ['river_buffer'],
    },
    {
      id: 'filter_buildings', title: 'Select buildings inside river buffer', tool: 'spatial_filter',
      dependencies: ['inspect_buildings', 'buffer_rivers'],
      parameters: { input_layer: { $layer: 'buildings' }, mask_layer: { $layer: 'river_buffer' }, predicate: 'intersects', output_name: 'candidate_buildings' },
      outputs: ['candidate_buildings'],
    },
    {
      id: 'summarize_candidates', title: 'Summarize candidate buildings', tool: 'analyze_distribution',
      dependencies: ['filter_buildings'],
      parameters: { input_layer: { $layer: 'candidate_buildings' }, fields: ['building_id', 'use'] }, outputs: [],
    },
  ],
  '03-building-statistics-by-district': [
    {
      id: 'inspect_buildings', title: 'Inspect buildings', tool: 'inspect_dataset',
      dependencies: [], parameters: { input_layer: { $layer: 'buildings' } }, outputs: [],
    },
    {
      id: 'inspect_districts', title: 'Inspect districts', tool: 'inspect_dataset',
      dependencies: [], parameters: { input_layer: { $layer: 'districts' } }, outputs: [],
    },
    {
      id: 'calculate_building_geometry', title: 'Calculate building area', tool: 'calculate_geometry',
      dependencies: ['inspect_buildings'],
      parameters: { input_layer: { $layer: 'buildings' }, output_name: 'buildings_with_geometry' },
      outputs: ['buildings_with_geometry'],
    },
    {
      id: 'join_buildings_to_districts', title: 'Join district attributes', tool: 'spatial_join',
      dependencies: ['calculate_building_geometry', 'inspect_districts'],
      parameters: { left_layer: { $layer: 'buildings_with_geometry' }, right_layer: { $layer: 'districts' }, predicate: 'within', output_name: 'buildings_with_district' },
      outputs: ['buildings_with_district'],
    },
    {
      id: 'aggregate_districts', title: 'Aggregate count and area by district', tool: 'aggregate_by_region',
      dependencies: ['calculate_building_geometry', 'inspect_districts'],
      parameters: { input_layer: { $layer: 'buildings_with_geometry' }, regions_layer: { $layer: 'districts' }, group_field: 'district_id', output_name: 'district_statistics' },
      outputs: ['district_statistics'],
    },
  ],
  '04-road-accessibility': [
    {
      id: 'inspect_inputs', title: 'Inspect building dataset', tool: 'inspect_dataset',
      dependencies: [], parameters: { input_layer: { $layer: 'buildings' } }, outputs: [],
    },
    {
      id: 'filter_major_roads', title: 'Select major roads', tool: 'spatial_filter',
      dependencies: [],
      parameters: { input_layer: { $layer: 'roads' }, where: { road_class: 'major' }, output_name: 'major_roads' },
      outputs: ['major_roads'],
    },
    {
      id: 'transform_major_roads', title: 'Transform major roads to metric CRS', tool: 'transform_crs',
      dependencies: ['filter_major_roads'],
      parameters: { input_layer: { $layer: 'major_roads' }, target_crs: 'EPSG:32618', output_name: 'major_roads_metric' },
      outputs: ['major_roads_metric'],
    },
    {
      id: 'buffer_major_roads', title: 'Create 300 m road buffer', tool: 'create_buffer',
      dependencies: ['transform_major_roads'],
      parameters: { input_layer: { $layer: 'major_roads_metric' }, distance: 300, unit: 'meter', output_name: 'major_road_buffer' },
      outputs: ['major_road_buffer'],
    },
    {
      id: 'filter_accessible_buildings', title: 'Select accessible buildings', tool: 'spatial_filter',
      dependencies: ['inspect_inputs', 'buffer_major_roads'],
      parameters: { input_layer: { $layer: 'buildings' }, mask_layer: { $layer: 'major_road_buffer' }, predicate: 'intersects', output_name: 'accessible_buildings' },
      outputs: ['accessible_buildings'],
    },
    {
      id: 'join_accessible_districts', title: 'Join accessible buildings to districts', tool: 'spatial_join',
      dependencies: ['filter_accessible_buildings'],
      parameters: { left_layer: { $layer: 'accessible_buildings' }, right_layer: { $layer: 'districts' }, predicate: 'within', output_name: 'accessible_buildings_with_district' },
      outputs: ['accessible_buildings_with_district'],
    },
    {
      id: 'aggregate_accessibility', title: 'Aggregate accessibility by district', tool: 'aggregate_by_region',
      dependencies: ['filter_accessible_buildings'],
      parameters: { input_layer: { $layer: 'accessible_buildings' }, regions_layer: { $layer: 'districts' }, group_field: 'district_id', output_name: 'accessibility_by_district' },
      outputs: ['accessibility_by_district'],
    },
  ],
  '05-parameter-revision': [
    {
      id: 'inspect_buildings', title: 'Inspect buildings', tool: 'inspect_dataset',
      dependencies: [], parameters: { input_layer: { $layer: 'buildings' } }, outputs: [],
    },
    {
      id: 'filter_major_roads', title: 'Select major roads', tool: 'spatial_filter',
      dependencies: [],
      parameters: { input_layer: { $layer: 'roads' }, where: { road_class: 'major' }, output_name: 'major_roads' },
      outputs: ['major_roads'],
    },
    {
      id: 'transform_major_roads', title: 'Transform major roads to metric CRS', tool: 'transform_crs',
      dependencies: ['filter_major_roads'],
      parameters: { input_layer: { $layer: 'major_roads' }, target_crs: 'EPSG:32618', output_name: 'major_roads_metric' },
      outputs: ['major_roads_metric'],
    },
    {
      id: 'buffer_major_roads', title: 'Create 500 m road buffer', tool: 'create_buffer',
      dependencies: ['transform_major_roads'],
      parameters: { input_layer: { $layer: 'major_roads_metric' }, distance: 500, unit: 'meter', output_name: 'major_road_buffer' },
      outputs: ['major_road_buffer'],
    },
    {
      id: 'filter_candidate_buildings', title: 'Select candidate buildings', tool: 'spatial_filter',
      dependencies: ['inspect_buildings', 'buffer_major_roads'],
      parameters: { input_layer: { $layer: 'buildings' }, mask_layer: { $layer: 'major_road_buffer' }, predicate: 'intersects', output_name: 'candidate_buildings' },
      outputs: ['candidate_buildings'],
    },
  ],
  '06-multi-constraint-selection': [
    {
      id: 'inspect_buildings', title: 'Inspect buildings', tool: 'inspect_dataset',
      dependencies: [], parameters: { input_layer: { $layer: 'buildings' } }, outputs: [],
    },
    {
      id: 'filter_major_roads', title: 'Select major roads', tool: 'spatial_filter',
      dependencies: [],
      parameters: { input_layer: { $layer: 'roads' }, where: { road_class: 'major' }, output_name: 'major_roads' },
      outputs: ['major_roads'],
    },
    {
      id: 'transform_major_roads', title: 'Transform major roads to metric CRS', tool: 'transform_crs',
      dependencies: ['filter_major_roads'],
      parameters: { input_layer: { $layer: 'major_roads' }, target_crs: 'EPSG:32618', output_name: 'major_roads_metric' },
      outputs: ['major_roads_metric'],
    },
    {
      id: 'transform_rivers', title: 'Transform rivers to metric CRS', tool: 'transform_crs',
      dependencies: [],
      parameters: { input_layer: { $layer: 'rivers' }, target_crs: 'EPSG:32618', output_name: 'rivers_metric' },
      outputs: ['rivers_metric'],
    },
    {
      id: 'buffer_major_roads', title: 'Create 300 m road buffer', tool: 'create_buffer',
      dependencies: ['transform_major_roads'],
      parameters: { input_layer: { $layer: 'major_roads_metric' }, distance: 300, unit: 'meter', output_name: 'major_road_buffer' },
      outputs: ['major_road_buffer'],
    },
    {
      id: 'buffer_rivers', title: 'Create 800 m river exclusion buffer', tool: 'create_buffer',
      dependencies: ['transform_rivers'],
      parameters: { input_layer: { $layer: 'rivers_metric' }, distance: 800, unit: 'meter', output_name: 'river_exclusion_buffer' },
      outputs: ['river_exclusion_buffer'],
    },
    {
      id: 'filter_road_candidates', title: 'Select buildings near major roads', tool: 'spatial_filter',
      dependencies: ['inspect_buildings', 'buffer_major_roads'],
      parameters: { input_layer: { $layer: 'buildings' }, mask_layer: { $layer: 'major_road_buffer' }, predicate: 'intersects', output_name: 'road_candidates' },
      outputs: ['road_candidates'],
    },
    {
      id: 'exclude_river_buffer', title: 'Exclude buildings near rivers', tool: 'spatial_filter',
      dependencies: ['filter_road_candidates', 'buffer_rivers'],
      parameters: { input_layer: { $layer: 'road_candidates' }, mask_layer: { $layer: 'river_exclusion_buffer' }, predicate: 'disjoint', output_name: 'candidate_buildings' },
      outputs: ['candidate_buildings'],
    },
    {
      id: 'summarize_candidates', title: 'Summarize final candidates', tool: 'analyze_distribution',
      dependencies: ['exclude_river_buffer'],
      parameters: { input_layer: { $layer: 'candidate_buildings' }, fields: ['building_id', 'use'] }, outputs: [],
    },
  ],
}

function taskGraph(definition) {
  return {
    schema_version: '1.0',
    scenario_id: definition.id,
    goal: definition.prompt,
    steps: taskGraphSteps[definition.id],
  }
}

function scenarioManifest(definition) {
  return {
    schema_version: '1.0',
    id: definition.id,
    title: definition.title,
    region: 'Manhattan, New York City',
    prompt: 'prompt.txt',
    revision_prompt: definition.revisionPrompt ? 'revision-prompt.txt' : null,
    data: definition.data.map(name => `data/${name}.geojson`),
    expected_plan: 'expected-plan.json',
    expected_result: 'expected-result.json',
    task_graph: 'task-graph.json',
    supports_revision: Boolean(definition.revisionPrompt),
    fixture_profile: 'deterministic-manhattan-scale-v1',
  }
}

const demoDetails = {
  '01-building-data-inspection': {
    image: 'screenshots/result.jpg',
    alt: 'Scenario 01 verified Harness result',
    artifacts: [
      ['Initial Harness screenshot', 'screenshots/initial.jpg'],
      ['Animated Demo', 'media/demo.gif'],
      ['1–4 minute video script', 'media/video-script.md'],
    ],
    provenance: '素材来自本 Scenario 在 DeepSeek Harness Web `b150a55` 中的真实执行：结果画面选择 `calculate_building_geometry`，12 个输出要素同时在 Layer Registry 与地图高亮。动图由 `scripts/build-demo-media.py` 从上述真实截图生成，不含伪造结果帧。',
    commands: ['node --test tests/regression/01-building-data-inspection.regression.test.mjs'],
    verification: '该测试只读取本目录的数据、Task Graph 与 expected result，并用独立 GeoPandas oracle 验证 12 个要素、几何有效性、缺失值与面积统计。',
  },
  '02-river-building-query': {
    image: 'screenshots/result.jpg',
    alt: 'Scenario 02 verified Harness result',
    artifacts: [
      ['Initial Harness screenshot', 'screenshots/initial.jpg'],
      ['Animated Demo', 'media/demo.gif'],
      ['1–4 minute video script', 'media/video-script.md'],
    ],
    provenance: '真实结果画面选中 `filter_buildings`：500 m river buffer 可见，5 个 `candidate_buildings` 同步高亮。动图从本 Scenario 的运行前/运行后 Harness Web 截图生成。',
    commands: ['node --test tests/regression/02-river-building-query.regression.test.mjs'],
    verification: '回归测试使用本目录两份数据，要求 candidate count 为 5，并独立复算全部候选到河流的距离不超过 500 m。',
  },
  '03-building-statistics-by-district': {
    image: 'screenshots/result.jpg',
    alt: 'Scenario 03 verified Harness result',
    artifacts: [
      ['Initial Harness screenshot', 'screenshots/initial.jpg'],
      ['Animated Demo', 'media/demo.gif'],
      ['1–4 minute video script', 'media/video-script.md'],
    ],
    provenance: '真实结果画面选择 `aggregate_districts`，两个 `district_statistics` 面与该 Task step 同步高亮；输入、Join 中间层与聚合层均保留在 Layer Registry。',
    commands: ['node --test tests/regression/03-building-statistics-by-district.regression.test.mjs'],
    verification: '回归测试只使用本目录建筑与 District 数据，独立确认两个分区各 6 个建筑、总计 12 个，并检查分区面积汇总为正。',
  },
  '04-road-accessibility': {
    image: 'screenshots/result.jpg',
    alt: 'Scenario 04 verified Harness result',
    artifacts: [
      ['Initial Harness screenshot', 'screenshots/initial.jpg'],
      ['Animated Demo', 'media/demo.gif'],
      ['1–4 minute video script', 'media/video-script.md'],
    ],
    provenance: '真实结果画面选择 `filter_accessible_buildings`，3 个候选在 300 m road buffer 内同步高亮；后续 District Join 与 aggregation step 同样保持可定位。',
    commands: ['node --test tests/regression/04-road-accessibility.regression.test.mjs'],
    verification: '独立回归要求候选数为 3、MN-DEMO-01/MN-DEMO-02 分布为 3/0，并用 GeoPandas 复算每个候选到主要道路不超过 300 m。',
  },
  '05-parameter-revision': {
    image: 'screenshots/result-1km.jpg',
    alt: 'Scenario 05 revised 1 km Harness result',
    artifacts: [
      ['Initial Harness screenshot', 'screenshots/initial.jpg'],
      ['500 m result — 4 candidates', 'screenshots/result-500m.jpg'],
      ['1 km revised result — 8 candidates', 'screenshots/result-1km.jpg'],
      ['Animated revision Demo', 'media/demo.gif'],
      ['1–4 minute video script', 'media/video-script.md'],
    ],
    provenance: '三帧动图来自同一个完整 Harness Web execution：先运行 500 m，再通过 `/geoharness/scenario/revise` 提交“改成 1 公里。”。修订画面真实显示 2 轮 history、`2 rerun · 3 reused` 和 8 个当前候选；不是两次相互独立的静态查询。',
    commands: [
      'node --test tests/phase9-conversational-revision.test.mjs',
      'node --test tests/regression/05-parameter-revision.regression.test.mjs',
    ],
    verification: '第一项测试断言 4→8、只重跑 Buffer 与筛选、上游 Layer ID 复用、旧 Layer lineage 保留及当前地图 active projection；第二项验证本目录 500 m 初始结果。',
  },
  '06-multi-constraint-selection': {
    image: 'screenshots/result.jpg',
    alt: 'Scenario 06 verified Harness result',
    artifacts: [
      ['Initial Harness screenshot', 'screenshots/initial.jpg'],
      ['Animated Demo', 'media/demo.gif'],
      ['1–4 minute video script', 'media/video-script.md'],
    ],
    provenance: '真实结果画面选择 `exclude_river_buffer`，道路邻近和河流排除两类 Buffer 同时可见，最终 2 个 `candidate_buildings` 与 Task step 同步高亮。',
    commands: ['node --test tests/regression/06-multi-constraint-selection.regression.test.mjs'],
    verification: '独立回归验证结果为 2，并分别复算 road distance ≤ 300 m、river distance ≥ 800 m，避免只对 Tool 文本做字符串断言。',
  },
}

function readme(definition) {
  const dataRows = definition.data.map(name => `| \`data/${name}.geojson\` | GeoHarness deterministic Manhattan-scale fixture | GeoHarness project | CC0-1.0 | ${generatedOn} |`).join('\n')
  const behavior = definition.behavior.map(item => `1. ${item}`).join('\n')
  const steps = definition.steps.map(step => `\`${step}\``).join(' → ')
  const demo = demoDetails[definition.id]
  if (demo === undefined) throw new Error(`Missing Demo details for ${definition.id}`)
  const artifacts = demo.artifacts.map(([label, path]) => `- [${label}](${path})`).join('\n')
  const commands = demo.commands.join('\n')
  return `# ${definition.title}

## Scenario

- ID: \`${definition.id}\`
- Region: Manhattan, New York City
- Fixture profile: \`deterministic-manhattan-scale-v1\`

## Real user need

${definition.need}

## User prompt

> ${definition.prompt}
${definition.revisionPrompt ? `\nRevision: > ${definition.revisionPrompt}\n` : ''}
## Why this Demo exists

这个 Scenario 将一个真实空间需求、独立数据、可执行 Task Graph、期望 Plan、期望 Result 和回归入口放在同一目录中。复制本目录即可离线复现，不依赖其他 Scenario 的数据。

## Input data

| File | Dataset | Original provider | License / terms | Download / generation date |
| --- | --- | --- | --- | --- |
${dataRows}

### Data source and processing

这些文件是 GeoHarness 为稳定回归测试创作的、小型 Manhattan-scale 合成矢量 fixture，并非 NYC 官方地籍或道路数据。坐标锚定在 Manhattan 附近，使用 OGC:CRS84；几何和属性由 \`scripts/build_scenarios/build-fixtures.mjs\` 确定性生成。处理包括固定 3.2 km 测试范围、最小字段集和 7 位小数坐标量化；未做几何简化。数据按 CC0-1.0 提供。

## Expected Agent behavior

${behavior}

## Key GIS workflow

${steps}

可执行 DAG 定义位于 \`task-graph.json\`，每个步骤显式声明 dependencies、Layer 输入引用和 outputs。

## Success criteria

${definition.success}

## Demo focus

${definition.video}

## Demo artifacts

![${demo.alt}](${demo.image})

${artifacts}

${demo.provenance}

## Run and verify independently

\`\`\`sh
${commands}
\`\`\`

${demo.verification}
`
}

function json(value) {
  return `${JSON.stringify(value, null, 2)}\n`
}

function desiredFiles(definition) {
  const files = new Map([
    ['README.md', readme(definition)],
    ['prompt.txt', `${definition.prompt}\n`],
    ['scenario.json', json(scenarioManifest(definition))],
    ['expected-plan.json', json(definition.expectedPlan)],
    ['expected-result.json', json(definition.expectedResult)],
    ['task-graph.json', json(taskGraph(definition))],
  ])
  if (definition.revisionPrompt) {
    files.set('revision-prompt.txt', `${definition.revisionPrompt}\n`)
  }
  for (const name of definition.data) {
    files.set(`data/${name}.geojson`, json(datasets[name]))
  }
  return files
}

async function persist(relativePath, contents) {
  const absolutePath = resolve(scenariosRoot, relativePath)
  const pathFromRoot = relative(scenariosRoot, absolutePath)
  if (pathFromRoot.startsWith('..') || isAbsolute(pathFromRoot)) {
    throw new Error(`Refusing to write outside scenarios directory: ${absolutePath}`)
  }
  if (checkOnly) {
    let current
    try {
      current = await readFile(absolutePath, 'utf8')
    } catch {
      throw new Error(`Missing generated Scenario file: ${relativePath}`)
    }
    if (current !== contents) {
      throw new Error(`Stale generated Scenario file: ${relativePath}`)
    }
    return
  }
  await mkdir(dirname(absolutePath), { recursive: true })
  await writeFile(absolutePath, contents, 'utf8')
}

for (const definition of definitions) {
  for (const [file, contents] of desiredFiles(definition)) {
    await persist(`${definition.id}/${file}`, contents)
  }
}

console.log(`${checkOnly ? 'Verified' : 'Generated'} ${definitions.length} independent Scenario packages.`)
