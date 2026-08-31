import assert from 'node:assert/strict'
import { readFile, stat } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const scenarioId = '07-official-nyc-building-inspection'
const scenarioRoot = join(repositoryRoot, 'examples', 'scenarios', scenarioId)

function jpegDimensions(buffer) {
  assert.ok(buffer.length > 4 && buffer[0] === 0xff && buffer[1] === 0xd8, 'missing JPEG SOI')
  let offset = 2
  while (offset + 4 <= buffer.length) {
    while (buffer[offset] === 0xff) offset += 1
    const marker = buffer[offset]
    offset += 1
    if (marker === 0xd9 || marker === 0xda) break
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue
    const length = buffer.readUInt16BE(offset)
    assert.ok(length >= 2 && offset + length <= buffer.length, 'invalid JPEG segment')
    if ([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf].includes(marker)) {
      return { height: buffer.readUInt16BE(offset + 3), width: buffer.readUInt16BE(offset + 5) }
    }
    offset += length
  }
  throw new Error('JPEG has no supported start-of-frame marker')
}

function skipGifSubBlocks(buffer, start) {
  let offset = start
  for (;;) {
    assert.ok(offset < buffer.length, 'unterminated GIF sub-blocks')
    const size = buffer[offset]
    offset += 1
    if (size === 0) return offset
    assert.ok(offset + size <= buffer.length, 'truncated GIF sub-block')
    offset += size
  }
}

function gifMetadata(buffer) {
  assert.match(buffer.subarray(0, 6).toString('ascii'), /^GIF8[79]a$/)
  const width = buffer.readUInt16LE(6)
  const height = buffer.readUInt16LE(8)
  let offset = 13
  if ((buffer[10] & 0x80) !== 0) offset += 3 * (2 ** ((buffer[10] & 0x07) + 1))
  let frames = 0
  while (offset < buffer.length) {
    const introducer = buffer[offset]
    offset += 1
    if (introducer === 0x3b) return { width, height, frames }
    if (introducer === 0x21) {
      offset += 1
      offset = skipGifSubBlocks(buffer, offset)
      continue
    }
    assert.equal(introducer, 0x2c, 'unknown GIF block introducer')
    frames += 1
    const packed = buffer[offset + 8]
    offset += 9
    if ((packed & 0x80) !== 0) offset += 3 * (2 ** ((packed & 0x07) + 1))
    offset += 1
    offset = skipGifSubBlocks(buffer, offset)
  }
  throw new Error('GIF has no trailer')
}

test('official NYC Demo keeps auditable source metadata and real Harness media', async () => {
  const collection = JSON.parse(await readFile(join(scenarioRoot, 'data', 'buildings.geojson'), 'utf8'))
  assert.equal(collection.metadata.fixture, false)
  assert.equal(collection.metadata.official_data, true)
  assert.equal(collection.metadata.dataset_id, '5zhs-2jue')
  assert.equal(collection.metadata.publisher, 'NYC Office of Technology and Innovation (OTI)')
  assert.match(collection.metadata.api_query_url, /within_box/)
  assert.equal(collection.metadata.snapshot_date, '2026-08-27')
  assert.equal(collection.features.length, 133)

  for (const name of ['initial.jpg', 'result.jpg']) {
    const screenshot = await readFile(join(scenarioRoot, 'screenshots', name))
    assert.ok(screenshot.length > 80_000, `${name} is not a substantive Harness screenshot`)
    assert.deepEqual(jpegDimensions(screenshot), { width: 1280, height: 720 })
  }

  const gif = await readFile(join(scenarioRoot, 'media', 'demo.gif'))
  assert.ok(gif.length > 100_000, 'official-data Demo GIF is unexpectedly small')
  assert.deepEqual(gifMetadata(gif), { width: 960, height: 540, frames: 25 })

  const readme = await readFile(join(scenarioRoot, 'README.md'), 'utf8')
  assert.match(readme, /screenshots\/initial\.jpg/)
  assert.match(readme, /screenshots\/result\.jpg/)
  assert.match(readme, /media\/demo\.gif/)
  assert.match(readme, /media\/video-script\.md/)
  assert.match(readme, /NYC Open Data Terms of Use/)

  const script = await readFile(join(scenarioRoot, 'media', 'video-script.md'), 'utf8')
  for (const heading of [
    '视频标题建议', '开场问题', '用户输入', 'Agent Plan',
    '关键地图变化', '最终结果', '继续追问', '结尾一句',
  ]) assert.match(script, new RegExp(`^## ${heading}$`, 'mu'))
  assert.doesNotMatch(`${readme}\n${script}`, /\bTODO\b|待补|占位/u)

  const regression = join(repositoryRoot, 'tests', 'regression', `${scenarioId}.regression.test.mjs`)
  assert.ok((await stat(regression)).size > 200, 'independent real-data regression is missing')
})
