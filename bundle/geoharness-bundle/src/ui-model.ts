import type { LayerRecord } from './layer-registry'

export interface ResultLayerLike {
  layer_id: string
  name: string
  role: 'input' | 'output'
  feature_count: number
}

export interface FeatureFlowItem extends ResultLayerLike {
  width: number
}

export interface NumericStatisticItem {
  path: string
  value: number
  width: number
}

export interface CsvPreview {
  delimiter: ',' | ';' | '\t'
  fields: string[]
  rows: string[][]
}

export interface LayerGroups {
  input: LayerRecord[]
  intermediate: LayerRecord[]
  final: LayerRecord[]
}

export type MarkdownInlineToken = {
  type: 'text' | 'strong' | 'emphasis' | 'code' | 'link' | 'break'
  text: string
  href?: string
}

export type MarkdownBlock = {
  type: 'paragraph' | 'heading' | 'unordered-list' | 'ordered-list' | 'blockquote' | 'code' | 'table'
  level?: number
  language?: string
  items?: MarkdownInlineToken[][]
  content?: MarkdownInlineToken[]
  code?: string
  headers?: MarkdownInlineToken[][]
  rows?: MarkdownInlineToken[][][]
}

export type MapLayerRole = 'input' | 'intermediate' | 'final' | 'other'

function inlineTokens(value: string): MarkdownInlineToken[] {
  const tokens: MarkdownInlineToken[] = []
  const pattern = /(`[^`\n]+`|\*\*[^*\n]+\*\*|__[^_\n]+__|\*[^*\n]+\*|_[^_\n]+_|\[[^\]\n]+\]\((?:https?:\/\/|mailto:)[^)\s]+\)|\n)/u
  let remaining = value
  while (remaining !== '') {
    const match = pattern.exec(remaining)
    if (match === null) {
      tokens.push({ type: 'text', text: remaining })
      break
    }
    if (match.index > 0) tokens.push({ type: 'text', text: remaining.slice(0, match.index) })
    const marker = match[0]
    if (marker === '\n') {
      tokens.push({ type: 'break', text: '' })
    } else if (marker.startsWith('`')) {
      tokens.push({ type: 'code', text: marker.slice(1, -1) })
    } else if (marker.startsWith('**') || marker.startsWith('__')) {
      tokens.push({ type: 'strong', text: marker.slice(2, -2) })
    } else if (marker.startsWith('*') || marker.startsWith('_')) {
      tokens.push({ type: 'emphasis', text: marker.slice(1, -1) })
    } else {
      const link = /^\[([^\]]+)\]\(([^)]+)\)$/u.exec(marker)
      tokens.push(link === null
        ? { type: 'text', text: marker }
        : { type: 'link', text: link[1], href: link[2] })
    }
    remaining = remaining.slice(match.index + marker.length)
  }
  return tokens
}

function isBlockStart(line: string) {
  return /^\s*(?:```|#{1,4}\s+|[-*+]\s+|\d+[.)]\s+|>\s?)/u.test(line)
}

function tableCells(line: string) {
  const normalized = line.trim().replace(/^\|/u, '').replace(/\|$/u, '')
  return normalized.split('|').map(cell => cell.trim())
}

function isTableSeparator(line: string) {
  const cells = tableCells(line)
  return cells.length > 1 && cells.every(cell => /^:?-{3,}:?$/u.test(cell))
}

/**
 * Parse a deliberately bounded Markdown subset for native Agent text. React
 * renders the returned tokens, so model-authored HTML is always escaped and
 * links are restricted to explicit http(s)/mailto Markdown syntax.
 */
export function parseAgentMarkdown(value: string): MarkdownBlock[] {
  const lines = value.replace(/\r\n?/gu, '\n').split('\n')
  const blocks: MarkdownBlock[] = []
  for (let index = 0; index < lines.length;) {
    const line = lines[index]
    if (line.trim() === '') {
      index += 1
      continue
    }
    const fence = /^\s*```([\w+-]*)\s*$/u.exec(line)
    if (fence !== null) {
      const code: string[] = []
      index += 1
      while (index < lines.length && !/^\s*```\s*$/u.test(lines[index])) {
        code.push(lines[index])
        index += 1
      }
      if (index < lines.length) index += 1
      blocks.push({ type: 'code', language: fence[1] || undefined, code: code.join('\n') })
      continue
    }
    if (line.includes('|') && index + 1 < lines.length && isTableSeparator(lines[index + 1])) {
      const headers = tableCells(line).map(inlineTokens)
      const rows: MarkdownInlineToken[][][] = []
      index += 2
      while (index < lines.length && lines[index].includes('|') && lines[index].trim() !== '') {
        const cells = tableCells(lines[index])
        rows.push(headers.map((_, cellIndex) => inlineTokens(cells[cellIndex] ?? '')))
        index += 1
      }
      blocks.push({ type: 'table', headers, rows })
      continue
    }
    const heading = /^(#{1,4})\s+(.+)$/u.exec(line.trim())
    if (heading !== null) {
      blocks.push({ type: 'heading', level: heading[1].length, content: inlineTokens(heading[2]) })
      index += 1
      continue
    }
    const unordered = /^\s*[-*+]\s+(.+)$/u.exec(line)
    if (unordered !== null) {
      const items: MarkdownInlineToken[][] = []
      while (index < lines.length) {
        const item = /^\s*[-*+]\s+(.+)$/u.exec(lines[index])
        if (item === null) break
        items.push(inlineTokens(item[1]))
        index += 1
      }
      blocks.push({ type: 'unordered-list', items })
      continue
    }
    const ordered = /^\s*\d+[.)]\s+(.+)$/u.exec(line)
    if (ordered !== null) {
      const items: MarkdownInlineToken[][] = []
      while (index < lines.length) {
        const item = /^\s*\d+[.)]\s+(.+)$/u.exec(lines[index])
        if (item === null) break
        items.push(inlineTokens(item[1]))
        index += 1
      }
      blocks.push({ type: 'ordered-list', items })
      continue
    }
    if (/^\s*>/u.test(line)) {
      const quote: string[] = []
      while (index < lines.length) {
        const item = /^\s*>\s?(.*)$/u.exec(lines[index])
        if (item === null) break
        quote.push(item[1])
        index += 1
      }
      blocks.push({ type: 'blockquote', content: inlineTokens(quote.join('\n')) })
      continue
    }
    const paragraph: string[] = [line.trim()]
    index += 1
    while (index < lines.length && lines[index].trim() !== '' && !isBlockStart(lines[index])) {
      paragraph.push(lines[index].trim())
      index += 1
    }
    blocks.push({ type: 'paragraph', content: inlineTokens(paragraph.join('\n')) })
  }
  return blocks
}

function uniqueResultLayers(layers: readonly ResultLayerLike[]) {
  const seen = new Set<string>()
  return layers.filter(layer => {
    if (seen.has(layer.layer_id)) return false
    seen.add(layer.layer_id)
    return true
  })
}

/**
 * Build a bounded, honest feature-count flow. This visualizes registered Layer
 * counts only; it never infers a subset relation that the Tool result did not
 * declare.
 */
export function buildFeatureFlow(
  inputLayers: readonly ResultLayerLike[],
  outputLayers: readonly ResultLayerLike[],
  limit = 8,
): { items: FeatureFlowItem[], omitted: number } {
  const inputs = uniqueResultLayers(inputLayers)
  const outputs = uniqueResultLayers(outputLayers.filter(layer => !inputs.some(input => input.layer_id === layer.layer_id)))
  const combined = [...inputs, ...outputs]
  const bounded = combined.length <= limit
    ? combined
    : [...inputs.slice(0, 1), ...outputs.slice(-(Math.max(1, limit - 1)))]
  const maximum = Math.max(1, ...bounded.map(layer => layer.feature_count))
  return {
    items: bounded.map(layer => ({
      ...layer,
      width: Math.max(4, Math.min(100, layer.feature_count / maximum * 100)),
    })),
    omitted: combined.length - bounded.length,
  }
}

function collectNumbers(value: unknown, path: string, target: Array<{ path: string, value: number }>, depth: number) {
  if (target.length >= 12 || depth > 5) return
  if (typeof value === 'number' && Number.isFinite(value)) {
    target.push({ path: path || 'value', value })
    return
  }
  if (Array.isArray(value)) {
    value.slice(0, 8).forEach((child, index) => collectNumbers(child, `${path}[${index}]`, target, depth + 1))
    return
  }
  if (value === null || typeof value !== 'object') return
  for (const [key, child] of Object.entries(value)) {
    collectNumbers(child, path ? `${path}.${key}` : key, target, depth + 1)
    if (target.length >= 12) break
  }
}

/** Convert structured Tool output into a bounded numeric chart model. */
export function buildNumericStatistics(value: unknown): NumericStatisticItem[] {
  const rows: Array<{ path: string, value: number }> = []
  collectNumbers(value, '', rows, 0)
  const maximum = Math.max(1, ...rows.map(row => Math.abs(row.value)))
  return rows.map(row => ({
    ...row,
    width: Math.max(3, Math.min(100, Math.abs(row.value) / maximum * 100)),
  }))
}

/** Group derived layers by actual lineage: leaves are final, parents are intermediate. */
export function groupWorkspaceLayers(layers: readonly LayerRecord[]): LayerGroups {
  const input = layers.filter(layer => layer.source !== 'derived')
  const derived = layers.filter(layer => layer.source === 'derived')
  const referencedParents = new Set(derived.flatMap(layer => layer.parents))
  return {
    input,
    intermediate: derived.filter(layer => referencedParents.has(layer.id)),
    final: derived.filter(layer => !referencedParents.has(layer.id)),
  }
}

/**
 * Keep imagery readable beneath dense vector workflows. The persisted Layer
 * opacity remains the user's master control; this role-aware multiplier is a
 * map-only presentation rule and never changes canonical data or preferences.
 */
export function mapLayerOpacity(opacity: number, role: MapLayerRole, focused = false) {
  const master = Math.max(0, Math.min(1, opacity))
  if (focused) return master * 0.82
  const multiplier: Record<MapLayerRole, number> = {
    input: 0.32,
    intermediate: 0.42,
    final: 0.68,
    other: 0.55,
  }
  return master * multiplier[role]
}

function parseRows(text: string, delimiter: ',' | ';' | '\t') {
  const rows: string[][] = []
  let row: string[] = []
  let value = ''
  let quoted = false
  for (let index = 0; index < text.length && rows.length < 7; index += 1) {
    const character = text[index]
    if (character === '"') {
      if (quoted && text[index + 1] === '"') {
        value += '"'
        index += 1
      } else {
        quoted = !quoted
      }
    } else if (character === delimiter && !quoted) {
      row.push(value.trim())
      value = ''
    } else if ((character === '\n' || character === '\r') && !quoted) {
      if (character === '\r' && text[index + 1] === '\n') index += 1
      row.push(value.trim())
      if (row.some(cell => cell !== '')) rows.push(row.slice(0, 30))
      row = []
      value = ''
    } else {
      value += character
    }
  }
  if (rows.length < 7 && (value !== '' || row.length > 0)) {
    row.push(value.trim())
    if (row.some(cell => cell !== '')) rows.push(row.slice(0, 30))
  }
  return rows
}

export function parseCsvPreview(text: string): CsvPreview | null {
  const firstLine = text.split(/\r?\n/u, 1)[0] ?? ''
  const candidates = [',', ';', '\t'] as const
  const delimiter = candidates
    .map(candidate => ({ candidate, count: firstLine.split(candidate).length - 1 }))
    .sort((left, right) => right.count - left.count)[0]
  if (delimiter === undefined || delimiter.count === 0) return null
  const rows = parseRows(text, delimiter.candidate)
  const fields = rows.shift()?.map((field, index) => field || `field_${index + 1}`) ?? []
  if (fields.length < 2) return null
  return { delimiter: delimiter.candidate, fields, rows }
}

export function suggestCoordinateField(fields: readonly string[], axis: 'longitude' | 'latitude') {
  const patterns = axis === 'longitude'
    ? [/^longitude$/iu, /^lon$/iu, /^lng$/iu, /^x$/iu, /经度/u]
    : [/^latitude$/iu, /^lat$/iu, /^y$/iu, /纬度/u]
  return fields.find(field => patterns.some(pattern => pattern.test(field.trim()))) ?? ''
}

function readableDistance(metres: number) {
  if (metres >= 1000) return `${Number((metres / 1000).toPrecision(2))} km`
  return `${Math.max(1, Math.round(metres))} m`
}

/** Approximate the distance represented by 12% of the current CRS84 viewport. */
export function mapScaleLabel(bounds: readonly [number, number, number, number], zoom: number) {
  const longitudeSpan = Math.abs(bounds[2] - bounds[0]) / Math.max(zoom, 0.1) * 0.12
  const latitude = (bounds[1] + bounds[3]) / 2
  const rawMetres = longitudeSpan * 111_320 * Math.max(0.05, Math.cos(latitude * Math.PI / 180))
  const exponent = 10 ** Math.floor(Math.log10(Math.max(rawMetres, 1)))
  const ratio = rawMetres / exponent
  const niceRatio = ratio >= 5 ? 5 : ratio >= 2 ? 2 : 1
  return `≈ ${readableDistance(niceRatio * exponent)}`
}
