import assert from 'node:assert/strict'
import test from 'node:test'
import { runIndependentScenario } from './scenario-regression.helpers.mjs'

test('Scenario 01 independently passes capability, layers, spatial and statistics gates', async () => {
  const report = await runIndependentScenario('01-building-data-inspection')
  assert.equal(report.passed, true)
  assert.equal(report.statistics.feature_count, 12)
  assert.equal(report.statistics.geometry_type, 'Polygon')
  assert.equal(report.statistics.crs, 'OGC:CRS84')
  assert.equal(report.statistics.invalid_geometry_count, 0)
  assert.equal(report.statistics.missing_height_m_count, 1)
  assert.ok(report.statistics.total_building_area_m2 > 0)
})
