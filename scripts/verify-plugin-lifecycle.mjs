import { spawn, spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const bundleRoot = join(repositoryRoot, 'bundle', 'geoharness-bundle')
const localCli = resolve(repositoryRoot, '..', 'deepseek-harness', 'apps', 'cli', 'lib', 'bin.js')
const pnpmCli = process.env.npm_execpath
const dsh = existsSync(localCli)
  ? { command: process.execPath, prefix: [localCli], source: localCli }
  : pnpmCli && existsSync(pnpmCli)
    ? {
        command: process.execPath,
        prefix: [pnpmCli, 'dlx', '@deepseek-ai/dsh@0.1.1-rc.2'],
        source: `@deepseek-ai/dsh@0.1.1-rc.2 via ${pnpmCli}`,
      }
  : {
      command: 'pnpm',
      prefix: ['dlx', '@deepseek-ai/dsh@0.1.1-rc.2'],
      source: '@deepseek-ai/dsh@0.1.1-rc.2',
    }

const home = await mkdtemp(join(tmpdir(), 'geoharness-release-smoke-'))
const environment = {
  ...process.env,
  DSH_HOME: home,
  NO_COLOR: '1',
  FORCE_COLOR: '0',
}

function formatCommand(args) {
  return [dsh.command, ...dsh.prefix, ...args].map(value => JSON.stringify(value)).join(' ')
}

function runDsh(args, label) {
  const result = spawnSync(dsh.command, [...dsh.prefix, ...args], {
    cwd: repositoryRoot,
    env: environment,
    encoding: 'utf8',
    maxBuffer: 16 * 1024 * 1024,
    windowsHide: true,
  })
  if (result.error) throw result.error
  if (result.status !== 0) {
    throw new Error([
      `${label} failed with exit ${String(result.status)}: ${formatCommand(args)}`,
      result.stdout,
      result.stderr,
    ].filter(Boolean).join('\n'))
  }
  return `${result.stdout ?? ''}\n${result.stderr ?? ''}`
}

function waitForExit(child, timeoutMs) {
  if (child.exitCode !== null || child.signalCode !== null) return Promise.resolve()
  return new Promise((resolvePromise, rejectPromise) => {
    const timer = setTimeout(() => rejectPromise(new Error('Web process did not exit in time.')), timeoutMs)
    child.once('exit', () => {
      clearTimeout(timer)
      resolvePromise()
    })
  })
}

async function stopProcess(child) {
  if (child.exitCode !== null || child.signalCode !== null) return
  child.kill('SIGTERM')
  try {
    await waitForExit(child, 10_000)
  } catch {
    child.kill('SIGKILL')
    await waitForExit(child, 5_000)
  }
}

async function startAndProbe() {
  const args = ['web', '--no-open', '--host', '127.0.0.1', '--port', '0']
  const child = spawn(dsh.command, [...dsh.prefix, ...args], {
    cwd: repositoryRoot,
    env: environment,
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  })
  let output = ''
  let settled = false
  let timer
  const url = await new Promise((resolvePromise, rejectPromise) => {
    const inspect = chunk => {
      output += chunk.toString('utf8')
      const match = output.match(/dsh web:\s+(http:\/\/127\.0\.0\.1:\d+)/u)
      if (match && !settled) {
        settled = true
        clearTimeout(timer)
        resolvePromise(match[1])
      }
    }
    child.stdout.on('data', inspect)
    child.stderr.on('data', inspect)
    child.once('error', error => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      rejectPromise(error)
    })
    child.once('exit', (code, signal) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      rejectPromise(new Error(`Web exited before announcing a URL (${String(code ?? signal)}).\n${output}`))
    })
    timer = setTimeout(() => {
      if (settled) return
      settled = true
      rejectPromise(new Error(`Timed out waiting for the Web URL.\n${output}`))
    }, 90_000)
  })

  try {
    let response
    let lastError
    for (let attempt = 1; attempt <= 20; attempt += 1) {
      try {
        response = await fetch(url, { signal: AbortSignal.timeout(5_000) })
        if (response.ok) break
        lastError = new Error(`HTTP ${String(response.status)}`)
      } catch (error) {
        lastError = error
      }
      await new Promise(resolvePromise => setTimeout(resolvePromise, 250))
    }
    if (!response?.ok) throw new Error(`Web probe failed for ${url}: ${String(lastError)}`)
    const html = await response.text()
    if (!/<(?:!doctype|html|div)\b/iu.test(html)) {
      throw new Error(`Web probe did not return an HTML shell (${String(html.length)} bytes).`)
    }
    return { url, status: response.status, bytes: Buffer.byteLength(html) }
  } finally {
    await stopProcess(child)
  }
}

let installed = false
try {
  console.log(`GeoHarness lifecycle: CLI ${dsh.source}`)
  console.log(`GeoHarness lifecycle: isolated DSH_HOME ${home}`)

  runDsh(['plugin', '--profile', 'web', 'add', bundleRoot], 'plugin install')
  installed = true
  const installedConfig = runDsh(['--profile', 'web', '--dump-config'], 'installed config dump')
  if (!installedConfig.includes("name: '@geoharness/harness-plugin'")) {
    throw new Error('Installed Web profile does not contain @geoharness/harness-plugin.')
  }

  const probe = await startAndProbe()
  console.log(`GeoHarness lifecycle: HTTP ${String(probe.status)} ${probe.url} (${String(probe.bytes)} bytes)`)

  runDsh(
    ['plugin', '--profile', 'web', 'remove', '@geoharness/harness-plugin'],
    'plugin removal',
  )
  installed = false
  const removedConfig = runDsh(['--profile', 'web', '--dump-config'], 'removed config dump')
  if (removedConfig.includes('@geoharness/harness-plugin') || removedConfig.includes('id: geoharness-plugin')) {
    throw new Error('Removed Web profile still contains the GeoHarness plugin row.')
  }
  console.log('GeoHarness lifecycle: install → boot → HTTP probe → remove passed')
} finally {
  if (installed) {
    try {
      runDsh(
        ['plugin', '--profile', 'web', 'remove', '@geoharness/harness-plugin'],
        'failure cleanup',
      )
    } catch (error) {
      console.error(String(error))
    }
  }
  await rm(home, { recursive: true, force: true, maxRetries: 5, retryDelay: 250 })
}
