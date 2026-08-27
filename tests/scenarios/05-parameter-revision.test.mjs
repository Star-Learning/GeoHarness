import assert from 'node:assert/strict'
import test from 'node:test'
import { validateScenarioPackage } from './scenario-package.helpers.mjs'

test('Scenario 05 is an independent conversational-revision Demo package', async () => {
  const scenario = await validateScenarioPackage('05-parameter-revision')
  assert.deepEqual(Object.keys(scenario.data), ['buildings', 'roads'])
  assert.equal(scenario.manifest.supports_revision, true)
  assert.equal(scenario.result.expected.initial_candidate_count, 329)
  assert.equal(scenario.result.expected.revised_candidate_count, 205)
  assert.equal(scenario.plan.revision.distance, 200)
})
