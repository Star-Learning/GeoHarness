import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { spawnSync } from 'node:child_process'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const topicRoot = resolve(repositoryRoot, 'examples', 'topics', '02-firehouse-coverage')
const pythonExecutable = process.env.GEOHARNESS_PYTHON || 'python'

test('firehouse coverage Topic uses auditable official data and an independent spatial oracle', async () => {
  const [dataText, sourceText, prompt, catalogText, recordingText, finalImage] = await Promise.all([
    readFile(resolve(topicRoot, 'data', 'firehouses.geojson'), 'utf8'),
    readFile(resolve(topicRoot, 'data', 'source.json'), 'utf8'),
    readFile(resolve(topicRoot, 'prompt.md'), 'utf8'),
    readFile(resolve(repositoryRoot, 'examples', 'datasets', 'nyc-fire-coverage-official', 'dataset.json'), 'utf8'),
    readFile(resolve(topicRoot, 'media', 'recording.json'), 'utf8'),
    readFile(resolve(topicRoot, 'media', 'final.png')),
  ])
  const data = JSON.parse(dataText)
  const source = JSON.parse(sourceText)
  const catalog = JSON.parse(catalogText)
  const recording = JSON.parse(recordingText)

  assert.equal(data.features.length, 48)
  assert.equal(data.metadata.dataset_id, 'hc8x-tcnd')
  assert.equal(source.sha256, createHash('sha256').update(dataText).digest('hex'))
  assert.equal(source.feature_count, 48)
  assert.equal(catalog.id, 'nyc-fire-coverage-official')
  assert.deepEqual(catalog.layers.map(layer => layer.name), ['coverage_buildings', 'firehouses', 'coverage_districts'])
  assert.match(prompt, /500 米直线距离/u)
  assert.match(prompt, /不要调用固定 Scenario/u)
  assert.doesNotMatch(prompt, /26 栋|10503\.30|674\.61/u)
  assert.equal(recording.source.promptSha256, createHash('sha256').update(prompt).digest('hex'))
  assert.deepEqual(
    [recording.video.codec, recording.video.width, recording.video.height, recording.video.framesPerSecond],
    ['h264', 1920, 1080, 60],
  )
  assert.equal(recording.video.durationSeconds, 477.5)
  assert.equal(recording.editing.excludedNonGeoHarnessDesktopFrames, true)
  assert.equal(recording.verifiedResults.uncoveredBuildings, 26)
  assert.equal(finalImage.subarray(1, 4).toString('ascii'), 'PNG')
  assert.equal(finalImage.readUInt32BE(16), 1920)
  assert.equal(finalImage.readUInt32BE(20), 1080)

  const oracle = spawnSync(pythonExecutable, [resolve(topicRoot, 'oracle.py')], {
    cwd: repositoryRoot,
    encoding: 'utf8',
    maxBuffer: 4 * 1024 * 1024,
  })
  assert.equal(oracle.status, 0, oracle.stderr)
  const result = JSON.parse(oracle.stdout)
  assert.equal(result.input_buildings, 360)
  assert.equal(result.input_firehouses, 48)
  assert.equal(result.uncovered_buildings, 26)
  assert.equal(result.total_uncovered_area_m2, 10503.3)
  assert.deepEqual(result.districts, {
    101: { feature_count: 2, area_sum_m2: 2979.37, mean_distance_m: 674.12, maximum_distance_m: 674.61 },
    103: { feature_count: 24, area_sum_m2: 7523.93, mean_distance_m: 543.53, maximum_distance_m: 608.62 },
  })
  assert.deepEqual(result.checks, {
    all_uncovered_are_beyond_500m: true,
    all_buildings_joined_to_a_district: true,
    all_source_geometries_valid: true,
  })
})
