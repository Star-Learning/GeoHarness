import assert from 'node:assert/strict'
import test from 'node:test'
import { validateScenarioPackage } from './scenario-package.helpers.mjs'

test('Scenario 02 is an independent river-proximity Demo package', async () => {
  const scenario = await validateScenarioPackage('02-river-building-query')
  assert.deepEqual(Object.keys(scenario.data), ['buildings', 'rivers'])
  assert.equal(scenario.data.rivers.features.length, 2)
  assert.equal(scenario.result.expected.candidate_buildings_count, 5)
  assert.equal(scenario.plan.constraints.distance, 500)
})
