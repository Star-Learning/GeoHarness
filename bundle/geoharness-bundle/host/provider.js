import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { delimiter, resolve, sep } from 'node:path'

const OUTPUT_LIMIT = 4 * 1024 * 1024

function safeSegment(value) {
  const normalized = String(value).replace(/[^A-Za-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '')
  return normalized || 'direct'
}

function abortError(signal) {
  return signal?.reason instanceof Error ? signal.reason : new Error('Geo provider request aborted')
}

/** Local Provider: one cancellable Python process per canonical backend request. */
export class LocalPythonGeoProvider {
  constructor(options) {
    this.id = options.id ?? 'local-python'
    this.python = options.python ?? 'python'
    this.backendRoot = resolve(options.backendRoot)
    this.scenarioRoot = resolve(options.scenarioRoot)
    this.workspaceRoot = resolve(options.workspaceRoot)
    this.activeScenarios = new Map()
  }

  available() {
    return existsSync(resolve(this.backendRoot, 'geoharness_geo', 'runner.py'))
      && existsSync(this.scenarioRoot)
  }

  workspaceFor(workspaceKey, scenarioId) {
    const workspace = resolve(this.workspaceRoot, safeSegment(workspaceKey), safeSegment(scenarioId ?? 'manual'))
    if (workspace !== this.workspaceRoot && !workspace.startsWith(`${this.workspaceRoot}${sep}`)) {
      throw new Error(`Unsafe Geo workspace path: ${workspace}`)
    }
    return workspace
  }

  async execute(request, signal) {
    const workspaceKey = safeSegment(request.workspaceKey ?? 'direct')
    let scenarioId = this.activeScenarios.get(workspaceKey)
    if (request.action === 'load_scenario') {
      scenarioId = safeSegment(request.scenarioId)
      this.activeScenarios.set(workspaceKey, scenarioId)
    }
    const payload = {
      ...request,
      workspace_root: this.workspaceFor(workspaceKey, scenarioId),
      scenario_root: this.scenarioRoot,
    }
    delete payload.workspaceKey
    delete payload.scenarioId
    if (request.action === 'load_scenario') payload.scenario_id = scenarioId
    return this.run(payload, signal)
  }

  run(payload, signal) {
    if (signal?.aborted) return Promise.reject(abortError(signal))
    return new Promise((resolvePromise, rejectPromise) => {
      const child = spawn(this.python, ['-m', 'geoharness_geo.runner'], {
        cwd: this.backendRoot,
        windowsHide: true,
        stdio: ['pipe', 'pipe', 'pipe'],
        env: {
          ...process.env,
          PYTHONPATH: [this.backendRoot, process.env.PYTHONPATH].filter(Boolean).join(delimiter),
        },
      })
      child.stdout.setEncoding('utf8')
      child.stderr.setEncoding('utf8')
      let stdout = ''
      let stderr = ''
      let overflowed = false
      const append = (current, chunk) => {
        const next = current + chunk
        if (next.length <= OUTPUT_LIMIT) return next
        overflowed = true
        child.kill()
        return next.slice(0, OUTPUT_LIMIT)
      }
      child.stdout.on('data', chunk => { stdout = append(stdout, chunk) })
      child.stderr.on('data', chunk => { stderr = append(stderr, chunk) })
      const onAbort = () => child.kill()
      signal?.addEventListener('abort', onAbort, { once: true })
      child.once('error', error => {
        signal?.removeEventListener('abort', onAbort)
        rejectPromise(error)
      })
      child.once('close', (code) => {
        signal?.removeEventListener('abort', onAbort)
        if (signal?.aborted) return rejectPromise(abortError(signal))
        if (overflowed) return rejectPromise(new Error(`Geo provider output exceeded ${OUTPUT_LIMIT} characters`))
        let response
        try {
          response = JSON.parse(stdout.trim())
        } catch {
          return rejectPromise(new Error(`Geo provider returned invalid JSON (exit ${code}): ${stderr.trim()}`))
        }
        if (!response.ok) {
          return rejectPromise(new Error(`${response.error?.type ?? 'GeoBackendError'}: ${response.error?.message ?? 'unknown failure'}`))
        }
        if (code !== 0) return rejectPromise(new Error(`Geo provider exited with ${code}: ${stderr.trim()}`))
        resolvePromise(response.value)
      })
      child.stdin.end(JSON.stringify(payload))
    })
  }
}

export default LocalPythonGeoProvider
