import assert from 'node:assert/strict'
import test from 'node:test'
import { validateScenarioPackage } from './scenario-package.helpers.mjs'

test('Scenario 01 is an independent building-inspection Demo package', async () => {
  const scenario = await validateScenarioPackage('01-building-data-inspection')
  assert.deepEqual(Object.keys(scenario.data), ['buildings'])
  assert.equal(scenario.data.buildings.features.length, 360)
  assert.equal(scenario.result.expected.missing_height_m_count, 0)
  assert.ok(scenario.plan.required_capabilities.includes('inspect_dataset'))
})
