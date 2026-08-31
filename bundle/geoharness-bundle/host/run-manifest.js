const LAYER_ID = /^layer_[0-9]{4,}$/u
const PERSISTED_EVENT_TYPES = new Set([
  'tool/call', 'tool/result', 'assistant/message', 'llm/retry', 'turn/end',
])

function record(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value : {}
}

function text(value) {
  return typeof value === 'string' && value.trim() !== '' ? value : null
}

function contentText(value) {
  if (!Array.isArray(value)) return ''
  return value.flatMap(block => {
    const item = record(block)
    if (item.type === 'text' && typeof item.text === 'string') return [item.text]
    if (item.type === 'tool-result') return [contentText(item.content)]
    return []
  }).filter(Boolean).join('\n').trim()
}

function eventTime(value) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null
  try {
    return new Date(value).toISOString()
  } catch {
    return null
  }
}

function parseArguments(value) {
  if (value !== null && typeof value === 'object' && !Array.isArray(value)) return value
  if (typeof value !== 'string') return {}
  try {
    const parsed = JSON.parse(value)
    return parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {}
  } catch {
    return {}
  }
}

function collectLayerIds(value, destination = new Set()) {
  if (typeof value === 'string') {
    if (LAYER_ID.test(value)) destination.add(value)
    return destination
  }
  if (Array.isArray(value)) {
    for (const item of value) collectLayerIds(item, destination)
    return destination
  }
  if (value !== null && typeof value === 'object') {
    for (const item of Object.values(value)) collectLayerIds(item, destination)
  }
  return destination
}

function outputLayers(data) {
  const meta = record(data.meta)
  return Array.isArray(meta.outputs) ? [...new Set(meta.outputs.filter(value => typeof value === 'string' && LAYER_ID.test(value)))] : []
}

function toolFailed(data) {
  const meta = record(data.meta)
  const message = record(data.message)
  const block = Array.isArray(message.content) ? message.content.map(record).find(item => item.type === 'tool-result') : undefined
  return data.error !== undefined || meta.success === false || block?.isError === true
}

function classifyError(code, message, fallback = 'tool') {
  const normalized = `${code ?? ''} ${message ?? ''}`.toLowerCase()
  if (/transport|authentication|credential|provider|network|fetch|adapter|rate.?limit/.test(normalized)) return 'provider'
  if (/unknown layer|layernotfound|crs|geometry|field|column|predicate|dataset|empty|invalid data|file/.test(normalized)) return 'data'
  return fallback
}

function turnFailure(reason, eventSeq) {
  const value = record(reason)
  if (value.kind === 'completed') return null
  const failure = record(value.error)
  const code = text(failure.code)
  const message = text(failure.message) ?? `Agent turn ended with ${String(value.kind ?? 'unknown')}`
  return {
    classification: classifyError(code, message, 'provider'),
    code,
    message: message.slice(0, 2_000),
    event_seq: eventSeq,
    call_id: null,
  }
}

function newRun(sessionId, turn, goal, userEventSeq, event) {
  return {
    schema_version: '1.0',
    run_id: `run-turn-${String(turn).padStart(4, '0')}`,
    session_id: sessionId,
    turn,
    user_goal: goal.slice(0, 20_000),
    user_event_seq: userEventSeq,
    started_at: eventTime(event.time),
    finished_at: null,
    status: 'running',
    provider: null,
    model: null,
    max_event_seq: event.seq,
    tool_calls: [],
    input_layers: [],
    output_layers: [],
    reused_layers: [],
    final_answer: null,
    errors: [],
    retries: [],
  }
}

/** Fold canonical Native Harness events into versioned, reasoning-free Agent Run manifests. */
export function projectRunManifests(sessionId, events) {
  const runs = new Map()
  let latestGoal = null
  let activeTurn = null
  let currentProvider = null
  let currentModel = null
  for (const event of events) {
    if (event === null || typeof event !== 'object' || typeof event.type !== 'string'
      || !Number.isSafeInteger(event.seq) || event.seq < 0) continue
    const data = record(event.data)
    if (event.type === 'user/message') {
      const source = record(data.source)
      const value = contentText(data.content)
      if (source.kind === 'user' && value !== '') latestGoal = { text: value, seq: event.seq }
      continue
    }
    if (event.type === 'turn/start' && Number.isSafeInteger(data.turn) && data.turn > 0 && latestGoal !== null) {
      activeTurn = data.turn
      const run = newRun(sessionId, activeTurn, latestGoal.text, latestGoal.seq, event)
      run.provider = currentProvider
      run.model = currentModel
      runs.set(activeTurn, run)
      continue
    }
    const turn = Number.isSafeInteger(data.turn) && data.turn > 0 ? data.turn : activeTurn
    const run = turn === null ? undefined : runs.get(turn)
    if (run === undefined) continue
    run.max_event_seq = Math.max(run.max_event_seq, event.seq)

    if (event.type === 'request/header') {
      const config = record(record(data.header).config)
      currentProvider = text(config.provider) ?? currentProvider
      currentModel = text(config.model) ?? currentModel
      run.provider = currentProvider
      run.model = currentModel
    } else if (event.type === 'request/context') {
      currentProvider = text(data.provider) ?? currentProvider
      currentModel = text(data.model) ?? currentModel
      run.provider = currentProvider
      run.model = currentModel
    } else if (event.type === 'tool/call') {
      const callId = text(data.callId)
      const name = text(data.name)
      if (callId === null || name === null) continue
      const args = parseArguments(data.arguments)
      run.tool_calls.push({
        call_id: callId,
        name,
        status: 'running',
        event_seq: event.seq,
        result_event_seq: null,
        arguments: args,
        input_layers: [...collectLayerIds(args)],
        output_layers: [],
        summary: null,
      })
    } else if (event.type === 'tool/result') {
      const message = record(data.message)
      const callId = text(record(message.source).callId)
      if (callId === null) continue
      const call = run.tool_calls.find(item => item.call_id === callId)
      if (call === undefined) continue
      const meta = record(data.meta)
      const failed = toolFailed(data)
      call.status = failed ? 'failed' : 'success'
      call.result_event_seq = event.seq
      call.output_layers = outputLayers(data)
      call.summary = (text(meta.summary) ?? contentText(message.content).split('\n')[0] ?? '').slice(0, 2_000) || null
      if (failed) {
        const failure = record(data.error)
        const code = text(failure.code) ?? text(failure.name)
        const messageText = call.summary ?? 'Geo Tool execution failed'
        run.errors.push({
          classification: classifyError(code, messageText),
          code,
          message: messageText,
          event_seq: event.seq,
          call_id: callId,
        })
      }
    } else if (event.type === 'assistant/message') {
      const value = contentText(record(data.message).content)
      if (value !== '') run.final_answer = { event_seq: event.seq, text: value.slice(0, 20_000) }
    } else if (event.type === 'llm/retry') {
      const failure = record(data.failure)
      run.retries.push({
        event_seq: event.seq,
        provider: text(data.provider),
        code: text(failure.code),
        retry: Number.isSafeInteger(data.retry) && data.retry >= 0 ? data.retry : 0,
        max_retries: Number.isSafeInteger(data.maxRetries) && data.maxRetries >= 0 ? data.maxRetries : 0,
      })
    } else if (event.type === 'turn/end') {
      const failure = turnFailure(data.reason, event.seq)
      if (failure !== null) run.errors.push(failure)
      run.status = failure === null ? 'success' : 'failed'
      run.finished_at = eventTime(event.time)
      activeTurn = null
    }
  }

  for (const run of runs.values()) {
    const inputs = new Set(run.tool_calls.flatMap(call => call.input_layers))
    const outputs = new Set(run.tool_calls.flatMap(call => call.output_layers))
    run.input_layers = [...inputs]
    run.output_layers = [...outputs]
    run.reused_layers = [...inputs].filter(layerId => !outputs.has(layerId))
  }
  return [...runs.values()].sort((a, b) => a.turn - b.turn)
}

/** Persist live projections without blocking Harness' synchronous append hot path. */
export function registerRunManifestProjector(ctx) {
  const queues = new Map()
  // Session publication is scoped through the SessionStore owner context. A
  // bundle plugin is a sibling fiber, so subscribe at that owner boundary and
  // return explicit disposers to keep plugin unload clean.
  const eventContext = ctx.root ?? ctx
  const schedule = session => {
    const previous = queues.get(session.id) ?? Promise.resolve()
    const next = previous.catch(() => {}).then(async () => {
      const runs = projectRunManifests(String(session.id), session.events)
      const run = runs.at(-1)
      if (run === undefined) return
      await ctx.geo.execute({
        action: 'workspace_record_agent_run',
        workspaceKey: String(session.id),
        run,
      })
    }).catch(error => {
      ctx.logger.warn(`GeoHarness Run Manifest projection failed for ${String(session.id)}: ${String(error)}`)
    })
    queues.set(session.id, next)
  }
  const disposeEvent = eventContext.on('session/event', (session, event) => {
    if (PERSISTED_EVENT_TYPES.has(event.type)) schedule(session)
  })
  const disposeFlush = eventContext.on('session/flush', session => queues.get(session.id))
  const disposeSession = eventContext.on('session/disposed', session => {
    const pending = queues.get(session.id)
    void pending?.finally(() => queues.delete(session.id))
  })
  return () => {
    disposeSession()
    disposeFlush()
    disposeEvent()
  }
}
