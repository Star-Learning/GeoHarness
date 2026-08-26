import assert from 'node:assert/strict'
import test from 'node:test'
import { runIndependentScenario } from './scenario-regression.helpers.mjs'

test('Scenario 03 independently passes capability, layers, spatial and statistics gates', async () => {
  const report = await runIndependentScenario('03-building-statistics-by-district')
  assert.equal(report.passed, true)
  assert.equal(report.statistics.total_buildings_count, 12)
  assert.deepEqual(report.statistics.district_counts, { 'MN-DEMO-01': 6, 'MN-DEMO-02': 6 })
  assert.equal(report.gates.spatial_correctness.checks.all_district_area_sums_m2_positive, true)
})
