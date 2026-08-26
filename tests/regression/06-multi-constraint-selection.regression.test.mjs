import assert from 'node:assert/strict'
import test from 'node:test'
import { runIndependentScenario } from './scenario-regression.helpers.mjs'

test('Scenario 06 independently passes capability, layers, spatial and statistics gates', async () => {
  const report = await runIndependentScenario('06-multi-constraint-selection')
  assert.equal(report.passed, true)
  assert.equal(report.statistics.candidate_buildings_count, 2)
  assert.equal(report.gates.spatial_correctness.checks.all_candidates_within_300m_of_major_road, true)
  assert.equal(report.gates.spatial_correctness.checks.all_candidates_at_least_800m_from_river, true)
  assert.ok(report.statistics.minimum_river_distance_m >= 799.5)
})
