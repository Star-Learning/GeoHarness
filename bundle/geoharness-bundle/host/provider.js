import { spawn } from 'node:child_process'
import { createHash, randomUUID } from 'node:crypto'
import { existsSync } from 'node:fs'
import { delimiter, resolve, sep } from 'node:path'

const OUTPUT_LIMIT = 4 * 1024 * 1024
const DEFAULT_UPLOAD_BYTES = 20 * 1024 * 1024
const HARD_UPLOAD_BYTES = 100 * 1024 * 1024
const DEFAULT_REQUEST_TIMEOUT_MS = 120_000
const HARD_REQUEST_TIMEOUT_MS = 600_000
const DEFAULT_MAX_LAYER_FEATURES = 100_000
const HARD_MAX_LAYER_FEATURES = 2_000_000
const DEFAULT_MAX_LAYER_BYTES = 256 * 1024 * 1024
const HARD_MAX_LAYER_BYTES = 1024 * 1024 * 1024
const DIAGNOSTIC_LIMIT = 200
const SESSION_ID = /^[A-Za-z0-9:._-]{1,120}$/u
const WINDOWS_RESERVED = /^(?:CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(?:\.|$)/iu

function safeSegment(value) {
  const normalized = String(value).replace(/[^A-Za-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '')
  return normalized || 'direct'
}

function workspaceIdFor(value) {
  const sessionId = String(value)
  const segment = safeSegment(sessionId)
  const plain = segment === sessionId
    && !segment.endsWith('.')
    && !WINDOWS_RESERVED.test(segment)
  if (plain) return segment
  const suffix = createHash('sha256').update(sessionId).digest('hex').slice(0, 12)
  return `${segment.slice(0, 100)}--${suffix}`
}

function abortError(signal) {
  return signal?.reason instanceof Error ? signal.reason : new Error('Geo provider request aborted')
}

export class GeoProviderTimeoutError extends Error {
  constructor(timeoutMs) {
    super(`Geo provider request timed out after ${timeoutMs} ms`)
    this.name = 'GeoProviderTimeoutError'
    this.code = 'GEO_PROVIDER_TIMEOUT'
  }
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
    this.activeChildren = new Set()
    this.diagnosticEntries = []
    this.uploadMaxBytes = Number(options.uploadMaxBytes ?? DEFAULT_UPLOAD_BYTES)
    this.requestTimeoutMs = Number(options.requestTimeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS)
    this.maxLayerFeatures = Number(options.maxLayerFeatures ?? DEFAULT_MAX_LAYER_FEATURES)
    this.maxLayerBytes = Number(options.maxLayerBytes ?? DEFAULT_MAX_LAYER_BYTES)
    if (!Number.isSafeInteger(this.uploadMaxBytes)
      || this.uploadMaxBytes < 1
      || this.uploadMaxBytes > HARD_UPLOAD_BYTES) {
      throw new Error(`Geo uploadMaxBytes must be between 1 and ${HARD_UPLOAD_BYTES}`)
    }
    if (!Number.isSafeInteger(this.requestTimeoutMs)
      || this.requestTimeoutMs < 100
      || this.requestTimeoutMs > HARD_REQUEST_TIMEOUT_MS) {
      throw new Error(`Geo requestTimeoutMs must be between 100 and ${HARD_REQUEST_TIMEOUT_MS}`)
    }
    if (!Number.isSafeInteger(this.maxLayerFeatures)
      || this.maxLayerFeatures < 1
      || this.maxLayerFeatures > HARD_MAX_LAYER_FEATURES) {
      throw new Error(`Geo maxLayerFeatures must be between 1 and ${HARD_MAX_LAYER_FEATURES}`)
    }
    if (!Number.isSafeInteger(this.maxLayerBytes)
      || this.maxLayerBytes < 1024
      || this.maxLayerBytes > HARD_MAX_LAYER_BYTES) {
      throw new Error(`Geo maxLayerBytes must be between 1024 and ${HARD_MAX_LAYER_BYTES}`)
    }
  }

  available() {
    return existsSync(resolve(this.backendRoot, 'geoharness_geo', 'runner.py'))
      && existsSync(this.scenarioRoot)
      && existsSync(this.datasetRoot)
  }

  workspaceFor(workspaceKey) {
    const workspace = resolve(this.workspaceRoot, workspaceIdFor(workspaceKey))
    if (workspace === this.workspaceRoot || !workspace.startsWith(`${this.workspaceRoot}${sep}`)) {
      throw new Error(`Unsafe Geo workspace path: ${workspace}`)
    }
    return workspace
  }

  async execute(request, signal) {
    const sessionId = String(request.workspaceKey ?? 'direct')
    if (!SESSION_ID.test(sessionId) || sessionId === '.' || sessionId === '..') {
      throw new Error('Invalid Geo workspace Session id')
    }
    const workspaceId = workspaceIdFor(sessionId)
    const scenarioId = request.action === 'load_scenario' ? safeSegment(request.scenarioId) : undefined
    const datasetId = request.action === 'load_dataset' ? safeSegment(request.datasetId) : undefined
    const payload = {
      ...request,
      workspace_root: this.workspaceFor(sessionId),
      workspace_id: workspaceId,
      session_id: sessionId,
      max_upload_bytes: this.uploadMaxBytes,
      max_layer_features: this.maxLayerFeatures,
      max_layer_bytes: this.maxLayerBytes,
      scenario_root: this.scenarioRoot,
      dataset_root: this.datasetRoot,
    }
    delete payload.workspaceKey
    delete payload.scenarioId
    delete payload.datasetId
    if (request.action === 'load_scenario') payload.scenario_id = scenarioId
    if (request.action === 'load_dataset') payload.dataset_id = datasetId
    // The imagery Tool publishes target.json atomically before its slower tile
    // acquisition/classification stages. Let the UI read that progress snapshot
    // concurrently instead of waiting behind the same-Workspace Tool queue.
    if (request.action === 'imagery_target') return this.run(payload, signal)
    const previous = this.workspaceQueues.get(workspaceId) ?? Promise.resolve()
    const operation = previous.catch(() => {}).then(() => this.run(payload, signal))
    this.workspaceQueues.set(workspaceId, operation)
    return operation.finally(() => {
      if (this.workspaceQueues.get(workspaceId) === operation) this.workspaceQueues.delete(workspaceId)
    })
  }

  recordDiagnostic(entry) {
    this.diagnosticEntries.push(Object.freeze(entry))
    if (this.diagnosticEntries.length > DIAGNOSTIC_LIMIT) {
      this.diagnosticEntries.splice(0, this.diagnosticEntries.length - DIAGNOSTIC_LIMIT)
    }
  }

  diagnostics(workspaceKey) {
    const workspaceId = workspaceIdFor(workspaceKey)
    return {
      schema_version: '1.0',
      provider: this.id,
      available: this.available(),
      workspace_id: workspaceId,
      active_processes: this.activeChildren.size,
      queue_depth: [...this.workspaceQueues.keys()].filter(key => key === workspaceId).length,
      limits: {
        request_timeout_ms: this.requestTimeoutMs,
        output_characters: OUTPUT_LIMIT,
        upload_bytes: this.uploadMaxBytes,
        layer_features: this.maxLayerFeatures,
        layer_bytes: this.maxLayerBytes,
      },
      requests: this.diagnosticEntries.filter(entry => entry.workspace_id === workspaceId),
    }
  }

  activeProcessCount() {
    return this.activeChildren.size
  }

  run(payload, signal) {
    const requestId = randomUUID()
    const startedAt = new Date().toISOString()
    const started = Date.now()
    const diagnostic = (status, details = {}) => this.recordDiagnostic({
      schema_version: '1.0',
      request_id: requestId,
      workspace_id: String(payload.workspace_id),
      action: String(payload.action ?? 'unknown').slice(0, 120),
      started_at: startedAt,
      duration_ms: Math.max(0, Date.now() - started),
      status,
      ...details,
    })
    if (signal?.aborted) {
      const error = abortError(signal)
      diagnostic('aborted', { error: { name: error.name, message: error.message.slice(0, 1000) } })
      return Promise.reject(error)
    }
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
      this.activeChildren.add(child)
      child.stdout.setEncoding('utf8')
      child.stderr.setEncoding('utf8')
      let stdout = ''
      let stderr = ''
      let overflowed = false
      let timedOut = false
      let settled = false
      const finish = (callback) => {
        if (settled) return
        settled = true
        clearTimeout(timeout)
        signal?.removeEventListener('abort', onAbort)
        this.activeChildren.delete(child)
        callback()
      }
      const append = (current, chunk) => {
        const remaining = OUTPUT_LIMIT - stdout.length - stderr.length
        if (chunk.length <= remaining) return current + chunk
        overflowed = true
        child.kill()
        return current + chunk.slice(0, Math.max(0, remaining))
      }
      child.stdout.on('data', chunk => { stdout = append(stdout, chunk) })
      child.stderr.on('data', chunk => { stderr = append(stderr, chunk) })
      const onAbort = () => child.kill()
      signal?.addEventListener('abort', onAbort, { once: true })
      const timeout = setTimeout(() => {
        timedOut = true
        child.kill()
      }, this.requestTimeoutMs)
      child.once('error', error => {
        finish(() => {
          diagnostic('error', { error: { name: error.name, message: error.message.slice(0, 1000) } })
          rejectPromise(error)
        })
      })
      child.once('close', (code) => {
        finish(() => {
          if (timedOut) {
            const error = new GeoProviderTimeoutError(this.requestTimeoutMs)
            diagnostic('timeout', { exit_code: code, error: { name: error.name, message: error.message } })
            return rejectPromise(error)
          }
          if (signal?.aborted) {
            const error = abortError(signal)
            diagnostic('aborted', { exit_code: code, error: { name: error.name, message: error.message.slice(0, 1000) } })
            return rejectPromise(error)
          }
          if (overflowed) {
            const error = new Error(`Geo provider output exceeded ${OUTPUT_LIMIT} characters`)
            diagnostic('error', { exit_code: code, error: { name: error.name, message: error.message } })
            return rejectPromise(error)
          }
          let response
          try {
            response = JSON.parse(stdout.trim())
          } catch {
            const error = new Error(`Geo provider returned invalid JSON (exit ${code}): ${stderr.trim().slice(0, 1000)}`)
            diagnostic('error', { exit_code: code, error: { name: error.name, message: error.message } })
            return rejectPromise(error)
          }
          if (!response.ok) {
            const error = new Error(`${response.error?.type ?? 'GeoBackendError'}: ${response.error?.message ?? 'unknown failure'}`)
            diagnostic('error', { exit_code: code, error: { name: error.name, message: error.message.slice(0, 1000) } })
            return rejectPromise(error)
          }
          if (code !== 0) {
            const error = new Error(`Geo provider exited with ${code}: ${stderr.trim().slice(0, 1000)}`)
            diagnostic('error', { exit_code: code, error: { name: error.name, message: error.message } })
            return rejectPromise(error)
          }
          diagnostic('success', { exit_code: code, stdout_characters: stdout.length, stderr_characters: stderr.length })
          resolvePromise(response.value)
        })
      })
      child.stdin.on('error', error => {
        if (signal?.aborted || timedOut || settled) return
        child.kill()
        finish(() => {
          diagnostic('error', { error: { name: error.name, message: error.message.slice(0, 1000) } })
          rejectPromise(error)
        })
      })
      child.stdin.end(JSON.stringify(payload))
    })
  }
}

export default LocalPythonGeoProvider

export {
  DEFAULT_MAX_LAYER_BYTES,
  DEFAULT_MAX_LAYER_FEATURES,
  DEFAULT_REQUEST_TIMEOUT_MS,
  DEFAULT_UPLOAD_BYTES,
  HARD_UPLOAD_BYTES,
  workspaceIdFor,
}
