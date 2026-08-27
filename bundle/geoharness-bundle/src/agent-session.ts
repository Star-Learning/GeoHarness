export type AgentStepStatus = 'running' | 'success' | 'failed'

export interface AgentToolStep {
  id: string
  name: string
  title: string
  arguments: Record<string, unknown>
  status: AgentStepStatus
  summary: string | null
  outputs: string[]
}

export type AgentStreamKind = 'text' | 'reasoning' | 'retry'
export type AgentStreamStatus = 'streaming' | 'settled' | 'interrupted'

/** One chronological item from the native Harness Assistant stream. */
export interface AgentStreamItem {
  id: string
  kind: AgentStreamKind
  text: string
  status: AgentStreamStatus
  turn: number
  step: number
  seq: number
}

export interface AgentRunProjection {
  steps: AgentToolStep[]
  stream: AgentStreamItem[]
  answer: string
  finished: boolean
  succeeded: boolean
  error: string | null
  turn: number | null
  maxSeq: number
}

export interface HumanGoal {
  seq: number
  text: string
}

interface EventEnvelope {
  type?: unknown
  seq?: unknown
  data?: unknown
}

function recordValue(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function asEvent(value: unknown): EventEnvelope | null {
  if (!recordValue(value)) return null
  const event = recordValue(value.event) ? value.event : value
  return recordValue(event) ? event : null
}

function stringValue(value: unknown): string | null {
  return typeof value === 'string' && value.trim() !== '' ? value : null
}

function contentText(value: unknown): string {
  if (!Array.isArray(value)) return ''
  const lines: string[] = []
  for (const block of value) {
    if (!recordValue(block)) continue
    if (block.type === 'text' && typeof block.text === 'string') lines.push(block.text)
    if (block.type === 'tool-result') {
      const nested = contentText(block.content)
      if (nested !== '') lines.push(nested)
    }
  }
  return lines.join('\n').trim()
}

/** Return the newest real user-authored request from a native Harness history window. */
export function latestHumanGoal(entries: readonly unknown[]): HumanGoal | null {
  let latest: HumanGoal | null = null
  for (const raw of entries) {
    const event = asEvent(raw)
    if (event === null || event.type !== 'user/message' || typeof event.seq !== 'number') continue
    const data = recordValue(event.data) ? event.data : {}
    const source = recordValue(data.source) ? data.source : {}
    if (source.kind !== 'user') continue
    const text = contentText(data.content)
    if (text !== '' && (latest === null || event.seq > latest.seq)) latest = { seq: event.seq, text }
  }
  return latest
}

/** Count real user turns without including Harness/plugin context injections. */
export function humanGoalCount(entries: readonly unknown[]): number {
  let count = 0
  for (const raw of entries) {
    const event = asEvent(raw)
    if (event === null || event.type !== 'user/message') continue
    const data = recordValue(event.data) ? event.data : {}
    const source = recordValue(data.source) ? data.source : {}
    if (source.kind === 'user' && contentText(data.content) !== '') count += 1
  }
  return count
}

function parseArguments(value: unknown): Record<string, unknown> {
  if (recordValue(value)) return value
  if (typeof value !== 'string') return {}
  try {
    const parsed: unknown = JSON.parse(value)
    return recordValue(parsed) ? parsed : {}
  } catch {
    return {}
  }
}

function resultDetails(data: Record<string, unknown>) {
  const meta = recordValue(data.meta) ? data.meta : {}
  const message = recordValue(data.message) ? data.message : {}
  const summary = stringValue(meta.summary) ?? stringValue(contentText(message.content).split('\n')[0])
  const outputs = Array.isArray(meta.outputs) ? meta.outputs.filter((item): item is string => typeof item === 'string') : []
  const resultBlock = Array.isArray(message.content)
    ? message.content.find(block => recordValue(block) && block.type === 'tool-result')
    : undefined
  const failed = recordValue(resultBlock) && resultBlock.isError === true
  return { summary, outputs, failed: failed || data.error !== undefined }
}

function turnFailure(value: unknown): string | null {
  if (!recordValue(value)) return 'Agent turn ended without a valid reason.'
  if (value.kind === 'completed') return null
  if (value.kind === 'max-tokens') return 'Agent reached the model output-token limit.'
  if (value.kind === 'blocked') return 'Agent turn was blocked before GIS execution.'
  if (value.kind === 'aborted') return 'Agent turn was cancelled.'
  if (value.kind === 'error') {
    const failure = recordValue(value.error) ? value.error : {}
    const message = stringValue(failure.message) ?? 'Agent execution failed.'
    const code = stringValue(failure.code)
    if (code === 'TRANSPORT') {
      return `Harness 模型传输失败（TRANSPORT）：${message} API Key 已配置也可能发生此错误；请检查运行服务的外网权限、代理/防火墙和 Provider Base URL。GeoHarness 不会回退到预设 Scenario。`
    }
    if (code === 'MISSING_CREDENTIAL') {
      return `Harness 没有从当前 DSH_HOME 解析到模型凭据（MISSING_CREDENTIAL）：${message}`
    }
    if (code === 'AUTHENTICATION' || code === 'INVALID_CREDENTIAL') {
      return `Harness 拒绝了当前模型凭据（${code}）：${message}`
    }
    if (/connection|network|fetch|provider|api.?key|credential/i.test(message)) {
      return `Harness 模型调用失败：${message} 请检查当前 LLM Provider、网络和 API Key 配置；GeoHarness 不会回退到预设 Scenario。`
    }
    return message
  }
  return `Agent turn ended with ${String(value.kind ?? 'an unknown status')}.`
}

/** Fold one native Harness Session history window into GeoHarness presentation state. */
export function projectAgentHistory(entries: readonly unknown[], afterSeq: number): AgentRunProjection {
  const steps = new Map<string, AgentToolStep>()
  const stream = new Map<string, AgentStreamItem>()
  const attempts = new Map<string, number>()
  const answers: string[] = []
  let turn: number | null = null
  let finished = false
  let succeeded = false
  let error: string | null = null
  let maxSeq = afterSeq

  for (const raw of entries) {
    const event = asEvent(raw)
    if (event === null || typeof event.seq !== 'number' || event.seq <= afterSeq) continue
    const eventSeq: number = event.seq
    maxSeq = Math.max(maxSeq, eventSeq)
    const data = recordValue(event.data) ? event.data : {}
    if (event.type === 'turn/start' && typeof data.turn === 'number') turn = data.turn
    if (event.type === 'assistant/chunk') {
      const eventTurn = typeof data.turn === 'number' ? data.turn : 0
      const eventStep = typeof data.step === 'number' ? data.step : 0
      const chunk = recordValue(data.chunk) ? data.chunk : {}
      const stepKey = `${eventTurn}:${eventStep}`
      const attempt = attempts.get(stepKey) ?? 0
      const index = typeof chunk.index === 'number' ? chunk.index : 0
      const itemKey = `assistant:${stepKey}:${attempt}:${index}`
      const existing = stream.get(itemKey)
      if (chunk.type === 'block-start' && (chunk.blockType === 'text' || chunk.blockType === 'reasoning')) {
        stream.set(itemKey, {
          id: itemKey,
          kind: chunk.blockType,
          text: '',
          status: 'streaming',
          turn: eventTurn,
          step: eventStep,
          seq: event.seq,
        })
      }
      if ((chunk.type === 'text-delta' || chunk.type === 'reasoning-delta') && typeof chunk.text === 'string') {
        const kind = chunk.type === 'text-delta' ? 'text' : 'reasoning'
        stream.set(itemKey, {
          id: itemKey,
          kind,
          text: (existing?.kind === kind ? existing.text : '') + chunk.text,
          status: 'streaming',
          turn: eventTurn,
          step: eventStep,
          seq: existing?.seq ?? event.seq,
        })
      }
      if (chunk.type === 'block-end' && recordValue(chunk.block)) {
        const block = chunk.block
        if ((block.type === 'text' || block.type === 'reasoning') && typeof block.text === 'string') {
          stream.set(itemKey, {
            id: itemKey,
            kind: block.type,
            text: block.text,
            status: 'settled',
            turn: eventTurn,
            step: eventStep,
            seq: existing?.seq ?? event.seq,
          })
        }
      }
      if (chunk.type === 'finish') {
        const reason = recordValue(chunk.reason) ? chunk.reason : {}
        const nextStatus: AgentStreamStatus = reason.kind === 'error' ? 'interrupted' : 'settled'
        for (const [key, item] of stream) {
          if (key.startsWith(`assistant:${stepKey}:${attempt}:`)) stream.set(key, { ...item, status: nextStatus })
        }
      }
    }
    if (event.type === 'llm/retry') {
      const eventTurn = typeof data.turn === 'number' ? data.turn : 0
      const eventStep = typeof data.step === 'number' ? data.step : 0
      const retry = typeof data.retry === 'number' ? data.retry : 0
      const maxRetries = typeof data.maxRetries === 'number' ? data.maxRetries : 0
      const provider = stringValue(data.provider) ?? 'provider'
      const failure = recordValue(data.failure) ? data.failure : {}
      const code = stringValue(failure.code) ?? 'ERROR'
      const stepKey = `${eventTurn}:${eventStep}`
      attempts.set(stepKey, retry)
      stream.set(`retry:${event.seq}`, {
        id: `retry:${event.seq}`,
        kind: 'retry',
        text: `${provider} · ${code} · retry ${retry}/${maxRetries}`,
        status: 'interrupted',
        turn: eventTurn,
        step: eventStep,
        seq: event.seq,
      })
    }
    if (event.type === 'tool/call') {
      const id = stringValue(data.callId)
      const name = stringValue(data.name)
      if (id === null || name === null) continue
      const args = parseArguments(data.arguments)
      steps.set(id, {
        id,
        name,
        title: `Geo · ${name}`,
        arguments: args,
        status: 'running',
        summary: null,
        outputs: [],
      })
    }
    if (event.type === 'tool/result') {
      const message = recordValue(data.message) ? data.message : {}
      const source = recordValue(message.source) ? message.source : {}
      const id = stringValue(source.callId)
      if (id === null) continue
      const details = resultDetails(data)
      const existing = steps.get(id)
      steps.set(id, {
        id,
        name: existing?.name ?? 'tool',
        title: existing?.title ?? 'Geo · tool',
        arguments: existing?.arguments ?? {},
        status: details.failed ? 'failed' : 'success',
        summary: details.summary,
        outputs: details.outputs,
      })
    }
    if (event.type === 'assistant/message') {
      const message = recordValue(data.message) ? data.message : {}
      const text = contentText(message.content)
      if (text !== '') answers.push(text)
      const eventTurn = typeof data.turn === 'number' ? data.turn : 0
      const eventStep = typeof data.step === 'number' ? data.step : 0
      const stepKey = `${eventTurn}:${eventStep}`
      const attempt = attempts.get(stepKey) ?? 0
      if (Array.isArray(message.content)) {
        message.content.forEach((rawBlock, index) => {
          if (!recordValue(rawBlock)) return
          if ((rawBlock.type !== 'text' && rawBlock.type !== 'reasoning') || typeof rawBlock.text !== 'string') return
          const itemKey = `assistant:${stepKey}:${attempt}:${index}`
          stream.set(itemKey, {
            id: itemKey,
            kind: rawBlock.type,
            text: rawBlock.text,
            status: 'settled',
            turn: eventTurn,
            step: eventStep,
            seq: stream.get(itemKey)?.seq ?? eventSeq,
          })
        })
      }
    }
    if (event.type === 'turn/end') {
      finished = true
      error = turnFailure(data.reason)
      succeeded = error === null
      if (typeof data.turn === 'number') turn = data.turn
    }
  }

  return {
    steps: [...steps.values()],
    stream: [...stream.values()].filter(item => item.kind === 'retry' || item.text !== '').sort((a, b) => a.seq - b.seq),
    answer: answers.at(-1) ?? '',
    finished,
    succeeded,
    error,
    turn,
    maxSeq,
  }
}

export function historyMaxSeq(entries: readonly unknown[]): number {
  let max = -1
  for (const raw of entries) {
    const event = asEvent(raw)
    if (event !== null && typeof event.seq === 'number') max = Math.max(max, event.seq)
  }
  return max
}
