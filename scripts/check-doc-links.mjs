import { readdir, readFile, stat } from 'node:fs/promises'
import { dirname, extname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const skippedDirectories = new Set(['.git', '.pnpm-store', '.tmp', 'node_modules', 'coverage', 'output'])

async function collectMarkdown(directory, output = []) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (entry.isDirectory() && skippedDirectories.has(entry.name)) continue
    const path = resolve(directory, entry.name)
    if (entry.isDirectory()) await collectMarkdown(path, output)
    else if (entry.isFile() && extname(entry.name).toLowerCase() === '.md') output.push(path)
  }
  return output
}

function localTargets(markdown) {
  const targets = []
  const pattern = /\[[^\]]*\]\(([^)]+)\)/gu
  for (const match of markdown.matchAll(pattern)) {
    let target = match[1].trim()
    if (!target || /^(?:https?:|mailto:|#)/iu.test(target)) continue
    if (target.startsWith('<') && target.endsWith('>')) target = target.slice(1, -1)
    target = target.split('#', 1)[0]
    if (target) targets.push(decodeURI(target))
  }
  return targets
}

const markdownFiles = await collectMarkdown(repositoryRoot)
const broken = []
let checked = 0

for (const markdownPath of markdownFiles) {
  const content = await readFile(markdownPath, 'utf8')
  for (const target of localTargets(content)) {
    checked += 1
    const resolved = resolve(dirname(markdownPath), target)
    try {
      await stat(resolved)
    } catch {
      broken.push(`${markdownPath.slice(repositoryRoot.length + 1)} -> ${target}`)
    }
  }
}

if (broken.length > 0) {
  console.error(`Broken local Markdown links (${broken.length}):\n${broken.join('\n')}`)
  process.exitCode = 1
} else {
  console.log(`Verified ${checked} local links across ${markdownFiles.length} Markdown files.`)
}
