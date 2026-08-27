import assert from 'node:assert/strict'
import test from 'node:test'
import { validateScenarioPackage } from './scenario-package.helpers.mjs'

test('Scenario 07 is an auditable official NYC Open Data package', async () => {
  const scenario = await validateScenarioPackage('07-official-nyc-building-inspection')
  const buildings = scenario.data.buildings
  assert.equal(buildings.features.length, 133)
  assert.equal(buildings.metadata.publisher, 'NYC Office of Technology and Innovation (OTI)')
  assert.equal(buildings.metadata.dataset_url, 'https://data.cityofnewyork.us/d/5zhs-2jue')
  assert.match(buildings.metadata.api_query_url, /within_box/)
  assert.equal(buildings.metadata.snapshot_date, '2026-08-27')
  assert.equal(buildings.metadata.coordinate_reference_system, 'OGC:CRS84')

  const ids = new Set(buildings.features.map(feature => feature.id))
  assert.equal(ids.size, buildings.features.length)
  assert.ok(buildings.features.every(feature => feature.geometry.type === 'MultiPolygon'))
  assert.ok(buildings.features.every(feature => Number.isInteger(feature.properties.object_id)))
  assert.ok(buildings.features.every(feature => typeof feature.properties.geometry_source === 'string'))

  assert.equal(scenario.result.expected.feature_count, 133)
  assert.equal(scenario.result.expected.geometry_type, 'MultiPolygon')
  assert.equal(scenario.result.expected.construction_year_min, 1830)
  assert.equal(scenario.result.expected.construction_year_max, 2021)
  assert.match(scenario.readme, /NYC Open Data Terms of Use/)
  assert.match(scenario.readme, /download-nyc-building-demo\.ps1/)
  assert.match(scenario.readme, /不是 GeoHarness 生成的 fixture/u)
  assert.doesNotMatch(scenario.readme, /CC0-1\.0/u)
})
