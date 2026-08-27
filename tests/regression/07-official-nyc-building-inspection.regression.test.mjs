import assert from 'node:assert/strict'
import test from 'node:test'
import { runIndependentScenario } from './scenario-regression.helpers.mjs'

test('Scenario 07 independently verifies the official NYC building snapshot', async () => {
  const report = await runIndependentScenario('07-official-nyc-building-inspection')
  assert.equal(report.passed, true)
  assert.equal(report.task_graph_status, 'success')
  assert.equal(report.map_verification_status, 'ready')
  assert.ok(Object.values(report.gates).every(gate => gate.passed))
  assert.equal(report.statistics.feature_count, 133)
  assert.equal(report.statistics.geometry_type, 'MultiPolygon')
  assert.equal(report.statistics.invalid_geometry_count, 0)
  assert.equal(report.statistics.missing_height_roof_ft_count, 0)
  assert.equal(report.statistics.missing_construction_year_count, 2)
  assert.equal(report.statistics.construction_year_min, 1830)
  assert.equal(report.statistics.construction_year_max, 2021)
  assert.ok(report.statistics.total_building_area_m2 > 116_000)
  assert.ok(report.statistics.total_building_area_m2 < 117_000)
  assert.equal(report.execution.map_verification.map_layers.length, 2)
})
