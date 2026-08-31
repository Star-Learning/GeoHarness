import assert from 'node:assert/strict'
import { readFile, stat } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'

const repositoryRoot = dirname(dirname(fileURLToPath(import.meta.url)))
const scenarios = [
  ['01-building-data-inspection', /质量检查.*米制投影/su],
  ['02-river-building-query', /500 米.*米制投影/su],
  ['03-building-statistics-by-district', /Community District.*占地面积总和/su],
  ['04-road-accessibility', /Broadway 300 米.*Community District/su],
  ['05-parameter-revision', /第一轮.*500 米.*第二轮.*200 米/su],
  ['06-multi-constraint-selection', /Broadway 不超过 300 米.*至少 800 米/su],
  ['07-official-nyc-building-inspection', /来源可审计.*建成年份/su],
]

test('each Scenario owns an autonomous real-Agent video prompt', async () => {
  const contents = []
  for (const [scenario, requirement] of scenarios) {
    const path = join(repositoryRoot, 'examples', 'scenarios', scenario, 'media', 'agent-video-prompt.md')
    assert.ok((await stat(path)).size > 300, `${scenario} prompt is empty`)
    const content = await readFile(path, 'utf8')
    assert.match(content, requirement)
    assert.match(content, /真实|官方/u)
    assert.match(content, /Tool Result/u)
    assert.doesNotMatch(content, /layer_\d+|expected-result|Task Graph|候选建筑总数是/u)
    for (const leaked of ['132', '249', '329', '205', '27 栋', '133 栋', '1830', '2021']) {
      assert.ok(!content.includes(leaked), `${scenario} prompt leaks expected result ${leaked}`)
    }
    const promptBlocks = content.match(/```text\n[\s\S]*?\n```/gu) ?? []
    assert.equal(promptBlocks.length, scenario === '05-parameter-revision' ? 2 : 1)
    contents.push(content)
  }
  assert.equal(new Set(contents).size, scenarios.length)
})

test('the Agent video catalog and encoder define seven independent 1080p outputs', async () => {
  const catalog = await readFile(join(repositoryRoot, 'docs', 'media', 'agent-video-prompts.md'), 'utf8')
  for (const [scenario] of scenarios) {
    assert.match(catalog, new RegExp(`${scenario}/media/agent-video-prompt\\.md`))
  }
  assert.match(catalog, /一个示例 = 一个独立 Harness 会话/u)
  assert.match(catalog, /agent-demo-1080p\.mp4/)
  assert.match(catalog, /1920×1080/)

  const recorder = await readFile(join(repositoryRoot, 'scripts', 'agent-video-recorder.mjs'), 'utf8')
  assert.match(recorder, /tab\.screenshot/)
  assert.match(recorder, /frame-%|frame-/)
  assert.match(recorder, /inspectAgentState/)
  assert.doesNotMatch(recorder, /from ['"](?:playwright|puppeteer)|chromium\.launch/i)

  const encoder = await readFile(join(repositoryRoot, 'scripts', 'build-agent-videos.py'), 'utf8')
  for (const [scenario] of scenarios) assert.match(encoder, new RegExp(scenario))
  for (const marker of ['1920, 1080', 'libx264', 'yuv420p', '30', 'ffprobe', 'final_status']) {
    assert.ok(encoder.includes(marker), `encoder is missing ${marker}`)
  }
})
