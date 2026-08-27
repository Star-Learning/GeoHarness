import assert from 'node:assert/strict'
import test from 'node:test'
import { runIndependentScenario } from './scenario-regression.helpers.mjs'

test('Scenario 03 independently passes capability, layers, spatial and statistics gates', async () => {
  const report = await runIndependentScenario('03-building-statistics-by-district')
  assert.equal(report.passed, true)
  assert.equal(report.statistics.total_buildings_count, 360)
  assert.deepEqual(report.statistics.district_counts, { 'MN-101': 162, 'MN-102': 40, 'MN-103': 158 })
  assert.equal(report.gates.spatial_correctness.checks.all_district_area_sums_m2_positive, true)
})
