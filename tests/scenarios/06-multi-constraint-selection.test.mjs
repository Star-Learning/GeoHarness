import assert from 'node:assert/strict'
import test from 'node:test'
import { validateScenarioPackage } from './scenario-package.helpers.mjs'

test('Scenario 06 is an independent multi-constraint Demo package', async () => {
  const scenario = await validateScenarioPackage('06-multi-constraint-selection')
  assert.deepEqual(Object.keys(scenario.data), ['buildings', 'roads', 'rivers'])
  assert.equal(scenario.result.expected.candidate_buildings_count, 2)
  assert.equal(scenario.plan.constraints.maximum_road_distance, 300)
  assert.equal(scenario.plan.constraints.minimum_river_distance, 800)
  assert.match(scenario.plan.constraints.boolean_logic, /AND/)
})
