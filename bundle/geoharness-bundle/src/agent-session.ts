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

export interface AgentRunProjection {
  steps: AgentToolStep[]
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
  const answers: string[] = []
  let turn: number | null = null
  let finished = false
  let succeeded = false
  let error: string | null = null
  let maxSeq = afterSeq

  for (const raw of entries) {
    const event = asEvent(raw)
    if (event === null || typeof event.seq !== 'number' || event.seq <= afterSeq) continue
    maxSeq = Math.max(maxSeq, event.seq)
    const data = recordValue(event.data) ? event.data : {}
    if (event.type === 'turn/start' && typeof data.turn === 'number') turn = data.turn
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
