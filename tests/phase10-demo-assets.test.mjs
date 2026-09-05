import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFile, stat } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const scenariosRoot = join(repositoryRoot, 'examples', 'scenarios')
const expectedScenarios = [
  { id: '01-building-data-inspection', screenshots: ['initial.jpg', 'result.jpg'] },
  { id: '02-river-building-query', screenshots: ['initial.jpg', 'result.jpg'] },
  { id: '03-building-statistics-by-district', screenshots: ['initial.jpg', 'result.jpg'] },
  { id: '04-road-accessibility', screenshots: ['initial.jpg', 'result.jpg'] },
  {
    id: '05-parameter-revision',
    screenshots: ['initial.jpg', 'result-500m.jpg', 'result-200m.jpg'],
  },
  { id: '06-multi-constraint-selection', screenshots: ['initial.jpg', 'result.jpg'] },
  { id: '07-official-nyc-building-inspection', screenshots: ['initial.jpg', 'result.jpg'] },
]

const requiredGifRoles = ['initial', 'input', 'plan', 'layers', 'map', 'result', 'complete']
const allowedGifFocus = ['full', 'input', 'agent_plan', 'layers', 'map', 'agent_result']

const videoHeadings = [
  '视频标题建议', '开场问题', '用户输入', 'Agent Plan',
  '关键地图变化', '最终结果', '继续追问', '结尾一句',
]

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
  const header = buffer.subarray(0, 6).toString('ascii')
  assert.ok(header === 'GIF87a' || header === 'GIF89a', 'invalid GIF header')
  const width = buffer.readUInt16LE(6)
  const height = buffer.readUInt16LE(8)
  const packed = buffer[10]
  let offset = 13
  if ((packed & 0x80) !== 0) offset += 3 * (2 ** ((packed & 0x07) + 1))
  let frames = 0
  let trailer = false
  while (offset < buffer.length) {
    const introducer = buffer[offset]
    offset += 1
    if (introducer === 0x3b) {
      trailer = true
      break
    }
    if (introducer === 0x21) {
      assert.ok(offset < buffer.length, 'truncated GIF extension')
      offset += 1
      offset = skipGifSubBlocks(buffer, offset)
      continue
    }
    assert.equal(introducer, 0x2c, 'unknown GIF block introducer')
    frames += 1
    assert.ok(offset + 9 <= buffer.length, 'truncated GIF image descriptor')
    const imagePacked = buffer[offset + 8]
    offset += 9
    if ((imagePacked & 0x80) !== 0) offset += 3 * (2 ** ((imagePacked & 0x07) + 1))
    assert.ok(offset < buffer.length, 'missing GIF LZW code size')
    offset += 1
    offset = skipGifSubBlocks(buffer, offset)
  }
  assert.equal(trailer, true, 'GIF has no trailer')
  return { width, height, frames }
}

for (const scenario of expectedScenarios) {
  test(`${scenario.id} contains real screenshots, an animated Demo, a script and its independent regression`, async () => {
    const root = join(scenariosRoot, scenario.id)
    const manifest = JSON.parse(await readFile(join(root, 'scenario.json'), 'utf8'))
    assert.equal(manifest.id, scenario.id)
    assert.ok(manifest.data.length > 0)
    for (const dataFile of manifest.data) {
      assert.ok((await stat(join(root, dataFile))).size > 100, `${dataFile} is empty`)
    }

    for (const screenshot of scenario.screenshots) {
      const path = join(root, 'screenshots', screenshot)
      const binary = await readFile(path)
      assert.ok(binary.length > 40_000, `${screenshot} is not a substantive Harness screenshot`)
      assert.deepEqual(jpegDimensions(binary), { width: 1280, height: 720 })
    }

    const storyboard = JSON.parse(await readFile(join(root, 'media', 'gif-storyboard.json'), 'utf8'))
    assert.equal(storyboard.schema_version, '1.0')
    assert.ok(Number.isInteger(storyboard.transition_frames))
    assert.ok(storyboard.transition_frames >= 1 && storyboard.transition_frames <= 6)
    assert.ok(Array.isArray(storyboard.keyframes) && storyboard.keyframes.length >= 7)
    const roles = new Set(storyboard.keyframes.map(keyframe => keyframe.role))
    for (const role of requiredGifRoles) assert.ok(roles.has(role), `${scenario.id} is missing ${role}`)
    for (const keyframe of storyboard.keyframes) {
      assert.ok(scenario.screenshots.includes(keyframe.source), `${keyframe.source} is not a real screenshot`)
      assert.ok(allowedGifFocus.includes(keyframe.focus), `${keyframe.focus} is not a supported focus`)
      assert.match(keyframe.label, /^\d{2} [A-Z0-9 -]+$/)
      assert.ok(Number.isInteger(keyframe.hold_ms) && keyframe.hold_ms >= 500)
    }

    const gifPath = join(root, 'media', 'demo.gif')
    const gif = await readFile(gifPath)
    assert.ok(gif.length > 100_000, 'Demo GIF is unexpectedly small')
    const frames = storyboard.keyframes.length
      + (storyboard.keyframes.length - 1) * storyboard.transition_frames
    assert.ok(frames >= 25, 'Demo GIF must include semantic holds and smooth transitions')
    assert.deepEqual(gifMetadata(gif), { width: 960, height: 540, frames })

    const readme = await readFile(join(root, 'README.md'), 'utf8')
    assert.match(readme, /screenshots\//)
    assert.match(readme, /media\/demo\.gif/)
    assert.match(readme, /media\/gif-storyboard\.json/)
    assert.match(readme, /media\/video-script\.md/)
    assert.match(readme, new RegExp(`tests/regression/${scenario.id}\\.regression\\.test\\.mjs`))

    const script = await readFile(join(root, 'media', 'video-script.md'), 'utf8')
    for (const heading of videoHeadings) assert.match(script, new RegExp(`^## ${heading}$`, 'mu'))
    assert.doesNotMatch(`${readme}\n${script}`, /\bTODO\b|待补|占位/u)

    const regression = join(repositoryRoot, 'tests', 'regression', `${scenario.id}.regression.test.mjs`)
    assert.ok((await stat(regression)).size > 200, 'independent regression test is missing')
  })
}

test('the root README presents the concise installation, usage and Scenario path', async () => {
  const readme = await readFile(join(repositoryRoot, 'README.md'), 'utf8')
  for (const scenario of expectedScenarios) assert.match(readme, new RegExp(scenario.id))
  for (const marker of [
    'GeoHarness', 'DeepSeek Harness', '0.1.1-rc.2', 'pnpm install',
    'plugin --profile web add', '配置 LLM Provider', '流式输出',
    '不需要选择预设案例', 'docs/README.md',
  ]) assert.ok(readme.includes(marker), `root README is missing ${marker}`)
  assert.doesNotMatch(readme, /currently at Phase 0|contains no GIS backend/u)
})

test('README leads with an audited, bounded real-workflow GIF and folds the original examples', async () => {
  const media = join(repositoryRoot, 'examples/topics/03-satellite-visual-inspection/media')
  const [readme, gif, story, audit, recording] = await Promise.all([
    readFile(join(repositoryRoot, 'README.md'), 'utf8'),
    readFile(join(media, 'core-workflow.gif')),
    readFile(join(media, 'core-workflow.storyboard.json'), 'utf8').then(JSON.parse),
    readFile(join(media, 'core-workflow.manifest.json'), 'utf8').then(JSON.parse),
    readFile(join(media, 'hongshan-publish-20260905.manifest.json'), 'utf8').then(JSON.parse),
  ])
  assert.ok(readme.indexOf('media/core-workflow.gif') < readme.indexOf('## 安装'))
  assert.match(readme, /<summary>展开七个矢量分析案例与 GIF<\/summary>/u)
  assert.match(readme, /真实历史地名与 OSM 边界缓存/u)
  assert.match(readme, /不是遥感分割模型或实测面积/u)
  assert.equal(gif.length, audit.bytes)
  assert.ok(gif.length > 1_000_000 && gif.length <= story.max_bytes)
  assert.deepEqual(gifMetadata(gif), { width: 960, height: 540, frames: audit.frames })
  assert.ok(audit.frames >= 40)
  assert.equal(audit.sha256, createHash('sha256').update(gif).digest('hex'))
  assert.equal(audit.source_sha256, recording.sha256)
  assert.equal(audit.source_session, recording.session_id)
  const roles = new Set(story.segments.map(segment => segment.role))
  for (const role of ['input', 'plan', 'flight', 'boundary', 'inspection', 'layers', 'report', 'visibility_opacity', 'result']) {
    assert.ok(roles.has(role), `missing real workflow phase: ${role}`)
  }
  assert.equal(audit.duration_ms, Math.round(story.segments.reduce((sum, s) => sum + s.duration, 0) * 1000))
  let previousEnd = 0
  for (const segment of story.segments) {
    assert.ok(segment.start >= previousEnd && segment.start < segment.end)
    assert.ok(segment.end <= recording.duration_seconds)
    previousEnd = segment.end
  }
})
