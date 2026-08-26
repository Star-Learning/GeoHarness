import assert from 'node:assert/strict'
import test from 'node:test'
import { runIndependentScenario } from './scenario-regression.helpers.mjs'

test('Scenario 05 independently passes its initial Phase 8 gates before Phase 9 revision', async () => {
  const report = await runIndependentScenario('05-parameter-revision')
  assert.equal(report.passed, true)
  assert.equal(report.statistics.initial_candidate_count, 4)
  assert.equal(report.statistics.initial_buffer_distance_m, 500)
  assert.deepEqual(report.gates.expected_statistics.deferred.sort(), ['retained_history_entries', 'revised_candidate_count'])
  assert.equal(report.gates.spatial_correctness.checks.all_initial_candidates_within_500m, true)
})
