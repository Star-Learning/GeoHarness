import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { delimiter, resolve, sep } from 'node:path'

const OUTPUT_LIMIT = 4 * 1024 * 1024
const DEFAULT_UPLOAD_BYTES = 20 * 1024 * 1024
const HARD_UPLOAD_BYTES = 100 * 1024 * 1024

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
    this.datasetRoot = resolve(options.datasetRoot)
    this.workspaceRoot = resolve(options.workspaceRoot)
    this.workspaceQueues = new Map()
    this.uploadMaxBytes = Number(options.uploadMaxBytes ?? DEFAULT_UPLOAD_BYTES)
    if (!Number.isSafeInteger(this.uploadMaxBytes)
      || this.uploadMaxBytes < 1
      || this.uploadMaxBytes > HARD_UPLOAD_BYTES) {
      throw new Error(`Geo uploadMaxBytes must be between 1 and ${HARD_UPLOAD_BYTES}`)
    }
  }

  available() {
    return existsSync(resolve(this.backendRoot, 'geoharness_geo', 'runner.py'))
      && existsSync(this.scenarioRoot)
      && existsSync(this.datasetRoot)
  }

  workspaceFor(workspaceKey) {
    const workspace = resolve(this.workspaceRoot, safeSegment(workspaceKey))
    if (workspace === this.workspaceRoot || !workspace.startsWith(`${this.workspaceRoot}${sep}`)) {
      throw new Error(`Unsafe Geo workspace path: ${workspace}`)
    }
    return workspace
  }

  async execute(request, signal) {
    const sessionId = String(request.workspaceKey ?? 'direct')
    if (sessionId.length === 0 || sessionId.length > 120) throw new Error('Invalid Geo workspace Session id')
    const workspaceId = safeSegment(sessionId)
    const scenarioId = request.action === 'load_scenario' ? safeSegment(request.scenarioId) : undefined
    const datasetId = request.action === 'load_dataset' ? safeSegment(request.datasetId) : undefined
    const payload = {
      ...request,
      workspace_root: this.workspaceFor(sessionId),
      workspace_id: workspaceId,
      session_id: sessionId,
      max_upload_bytes: this.uploadMaxBytes,
      scenario_root: this.scenarioRoot,
      dataset_root: this.datasetRoot,
    }
    delete payload.workspaceKey
    delete payload.scenarioId
    delete payload.datasetId
    if (request.action === 'load_scenario') payload.scenario_id = scenarioId
    if (request.action === 'load_dataset') payload.dataset_id = datasetId
    const previous = this.workspaceQueues.get(workspaceId) ?? Promise.resolve()
    const operation = previous.catch(() => {}).then(() => this.run(payload, signal))
    this.workspaceQueues.set(workspaceId, operation)
    return operation.finally(() => {
      if (this.workspaceQueues.get(workspaceId) === operation) this.workspaceQueues.delete(workspaceId)
    })
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

export { DEFAULT_UPLOAD_BYTES, HARD_UPLOAD_BYTES }
