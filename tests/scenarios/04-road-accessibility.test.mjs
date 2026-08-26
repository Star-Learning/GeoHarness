import assert from 'node:assert/strict'
import test from 'node:test'
import { validateScenarioPackage } from './scenario-package.helpers.mjs'

test('Scenario 04 is an independent road-accessibility Demo package', async () => {
  const scenario = await validateScenarioPackage('04-road-accessibility')
  assert.deepEqual(Object.keys(scenario.data), ['buildings', 'roads', 'districts'])
  assert.equal(scenario.data.roads.features.filter(feature => feature.properties.road_class === 'major').length, 1)
  assert.equal(scenario.result.expected.accessible_buildings_count, 3)
  assert.equal(scenario.plan.constraints.distance, 300)
})
