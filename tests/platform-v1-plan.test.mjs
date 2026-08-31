import assert from 'node:assert/strict'
import { access, readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'

const repositoryRoot = dirname(dirname(fileURLToPath(import.meta.url)))

test('the platform v1.0 plan defines real user-data delivery and bounded phases', async () => {
  const plan = await readFile(join(repositoryRoot, 'docs', 'planning', 'geoharness-platform-v1.0.md'), 'utf8')
  for (const marker of [
    '通用 Workspace 资产模型', '用户矢量数据导入', 'GeoJSON', 'Shapefile ZIP',
    'GeoPackage', 'CSV + lon/lat', '通用 Native Agent 运行记录', 'Result Center',
    'Platform Phase 0', 'Platform Phase 8', 'v1.0 验收矩阵', 'v1.0 明确不做', 'GeoTIFF',
  ]) assert.ok(plan.includes(marker), `platform plan is missing ${marker}`)
  assert.match(plan, /Scenario.*只承担确定性回归、教学、Demo 和视频素材职责/su)
  assert.match(plan, /不新增与 Harness 平行的第二套聊天或 LLM Planner/su)
  assert.doesNotMatch(plan, /- \[ \]|\bTBD\b|待定/u)
})

test('platform phase 0 includes repository governance and CI gates', async () => {
  for (const file of [
    'LICENSE', 'CONTRIBUTING.md', 'SECURITY.md', 'CHANGELOG.md',
    join('.github', 'workflows', 'ci.yml'), join('scripts', 'check-doc-links.mjs'),
  ]) await access(join(repositoryRoot, file))

  const workflow = await readFile(join(repositoryRoot, '.github', 'workflows', 'ci.yml'), 'utf8')
  assert.match(workflow, /ubuntu-latest/)
  assert.match(workflow, /windows-latest/)
  assert.match(workflow, /pnpm run check:docs/)
  assert.match(workflow, /node --test tests\/\*\.test\.mjs tests\/scenarios\/\*\.test\.mjs tests\/regression\/\*\.test\.mjs/)
  assert.match(workflow, /pnpm run test:python/)
  assert.match(workflow, /pnpm run build/)
  assert.match(workflow, /pnpm run check:catalogs/)
  assert.match(workflow, /pnpm run check:scenarios/)
  assert.match(workflow, /pnpm run check:media/)
})

test('the bundle README documents the current native AppFrame integration', async () => {
  const readme = await readFile(join(repositoryRoot, 'bundle', 'geoharness-bundle', 'README.md'), 'utf8')
  for (const marker of [
    'conversation.session', 'sidebar.workspaces', 'sidebar.settings',
    'conversation.composer.bar', 'Native Harness Agent', 'agent/workspace',
  ]) assert.ok(readme.includes(marker), `bundle README is missing ${marker}`)
  assert.doesNotMatch(readme, /replaces the upstream AppFrame|compact settings dock|credentials\.set/u)
})
