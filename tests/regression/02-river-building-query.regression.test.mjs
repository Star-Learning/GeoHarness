import assert from 'node:assert/strict'
import test from 'node:test'
import { runIndependentScenario } from './scenario-regression.helpers.mjs'

test('Scenario 02 independently passes capability, layers, spatial and statistics gates', async () => {
  const report = await runIndependentScenario('02-river-building-query')
  assert.equal(report.passed, true)
  assert.equal(report.statistics.candidate_buildings_count, 132)
  assert.equal(report.gates.spatial_correctness.checks.all_candidates_within_500m_of_river, true)
  assert.ok(report.statistics.maximum_river_distance_m <= 500.5)
})
