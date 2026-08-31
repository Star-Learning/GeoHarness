import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const documentUrl = new URL('../docs/testing/agent-test-prompts.md', import.meta.url)

test('agent test prompt catalog covers real autonomous GIS workflows', async () => {
  const source = await readFile(documentUrl, 'utf8')
  const promptBlocks = [...source.matchAll(/```text\r?\n([\s\S]*?)\r?\n```/g)].map(match => match[1])

  assert.equal(promptBlocks.length, 13, '12 cases plus the second conversational revision prompt')
  assert.match(source, /真实官方数据/)
  assert.match(source, /500 米/)
  assert.match(source, /275 米/)
  assert.match(source, /200 米/)
  assert.match(source, /连续修订/)
  assert.match(source, /数据能力边界/)
  assert.match(source, /不要编造/)

  for (const prompt of promptBlocks) {
    assert.doesNotMatch(prompt, /scenario[_ -]?id/i)
    assert.doesNotMatch(prompt, /layer[_ -]?id/i)
    assert.doesNotMatch(prompt, /expected[-_ ]result/i)
  }
})
