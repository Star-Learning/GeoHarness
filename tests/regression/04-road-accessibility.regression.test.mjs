import assert from 'node:assert/strict'
import test from 'node:test'
import { runIndependentScenario } from './scenario-regression.helpers.mjs'

test('Scenario 04 independently passes capability, layers, spatial and statistics gates', async () => {
  const report = await runIndependentScenario('04-road-accessibility')
  assert.equal(report.passed, true)
  assert.equal(report.statistics.accessible_buildings_count, 3)
  assert.deepEqual(report.statistics.district_counts, { 'MN-DEMO-01': 3, 'MN-DEMO-02': 0 })
  assert.equal(report.gates.spatial_correctness.checks.all_candidates_within_300m_of_major_road, true)
})
