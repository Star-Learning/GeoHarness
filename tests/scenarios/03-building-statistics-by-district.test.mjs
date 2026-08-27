import assert from 'node:assert/strict'
import test from 'node:test'
import { validateScenarioPackage } from './scenario-package.helpers.mjs'

test('Scenario 03 is an independent district-statistics Demo package', async () => {
  const scenario = await validateScenarioPackage('03-building-statistics-by-district')
  assert.deepEqual(Object.keys(scenario.data), ['buildings', 'districts'])
  assert.equal(scenario.data.districts.features.length, 3)
  assert.deepEqual(scenario.result.expected.district_counts, {
    'MN-101': 162,
    'MN-102': 40,
    'MN-103': 158,
  })
  assert.ok(scenario.plan.required_capabilities.includes('aggregate_by_region'))
})
