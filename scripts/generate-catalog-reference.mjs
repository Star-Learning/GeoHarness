import { readFile, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  loadBuiltinToolCatalog,
  loadDatasetCatalogs,
  mergeToolCatalogs,
} from '../bundle/geoharness-bundle/host/catalog.js'

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const datasetRoot = join(repositoryRoot, 'examples', 'datasets')
const outputPath = join(repositoryRoot, 'docs', 'architecture', 'catalog-reference.md')
const check = process.argv.includes('--check')

function render() {
  const toolCatalog = loadBuiltinToolCatalog()
  const tools = mergeToolCatalogs([toolCatalog])
  const datasets = loadDatasetCatalogs(datasetRoot)
  const lines = [
    '# GeoHarness Catalog Reference',
    '',
    '> 此文件由 `scripts/generate-catalog-reference.mjs` 从版本化 Dataset / Tool catalog 生成，请勿手工维护清单。',
    '',
    `- Tool catalog：\`${toolCatalog.id}\` / schema \`${toolCatalog.schema_version}\` / ${tools.length} tools`,
    `- Dataset catalogs：${datasets.length}`,
    '',
    '## Built-in Tools',
    '',
    '| Tool | Version | Capability | Map effect | Creates Layer | Timeout |',
    '| --- | --- | --- | --- | --- | --- |',
    ...tools.map(tool => `| \`${tool.name}\` | \`${tool.version}\` | \`${tool.capability}\` | \`${tool.map_effect}\` | ${tool.output.creates_layer ? 'yes' : 'no'} | ${tool.timeout_ms} ms |`),
    '',
    '## Dataset Catalogs',
    '',
    '| Dataset | Region / CRS | Snapshot | Layers | License |',
    '| --- | --- | --- | --- | --- |',
    ...datasets.map(dataset => `| \`${dataset.id}\` | ${dataset.region} / \`${dataset.crs}\` | ${dataset.snapshot_date ?? '—'} | ${dataset.layers.map(layer => `\`${layer.name}\``).join(', ')} | ${dataset.license} |`),
    '',
    '## Extension Gate',
    '',
    '第三方 Tool catalog 必须使用 `ToolResult@1.0`，声明 semver、capability、timeout 和 map effect。',
    '同名不同版本会在 Host 激活时拒绝；声明但没有 executor 的能力不会注册给模型，并进入',
    '`unavailable` 诊断与 System Prompt，Agent 必须明确报告未安装能力。',
    '',
  ]
  return lines.join('\n')
}

const expected = render()
if (check) {
  const current = await readFile(outputPath, 'utf8').catch(() => '')
  if (current !== expected) {
    console.error('Catalog reference is stale. Run pnpm run build:catalogs.')
    process.exitCode = 1
  } else {
    console.log('Verified versioned Tool/Dataset catalogs and generated reference.')
  }
} else {
  await writeFile(outputPath, expected, 'utf8')
  console.log(`Generated ${outputPath}`)
}
