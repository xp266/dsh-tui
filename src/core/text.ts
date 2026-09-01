import stringWidth from 'string-width'
import { isFieldCode, fieldCodeWidth } from './fields.ts'

const WIDTH_CACHE_LIMIT = 8192

function cachedWidth(cache: Map<string, number>, text: string, compute: () => number): number {
  const hit = cache.get(text)
  if (hit !== undefined) return hit
  const width = compute()
  if (cache.size >= WIDTH_CACHE_LIMIT) cache.clear()
  cache.set(text, width)
  return width
}

const widthCache = new Map<string, number>()

export function textWidth(text: string): number {
  if (isAsciiPrintable(text)) return text.length
  const hit = widthCache.get(text)
  if (hit !== undefined) return hit
  let total = 0
  let run = ''
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i)
    if (isFieldCode(code)) {
      if (run !== '') {
        total += stringWidth(run)
        run = ''
      }
      total += fieldCodeWidth(code)
      continue
    }
    run += text[i]
  }
  if (run !== '') total += stringWidth(run)
  if (widthCache.size >= WIDTH_CACHE_LIMIT) widthCache.clear()
  widthCache.set(text, total)
  return total
}

function isAsciiPrintable(text: string): boolean {
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i)
    if (code < 0x20 || code > 0x7e) return false
  }
  return true
}

const charWidthCache = new Map<string, number>()

const graphemeSegmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' })

export function segmentGraphemes(text: string): Iterable<Intl.SegmentData> {
  return graphemeSegmenter.segment(text)
}

export function charWidth(cluster: string): number {
  if (cluster.length === 1) {
    const code = cluster.charCodeAt(0)
    if (code >= 0x20 && code <= 0x7e) return 1
    if (isFieldCode(code)) return fieldCodeWidth(code)
  }
  return cachedWidth(charWidthCache, cluster, () => stringWidth(cluster))
}

const NO_START_CHARS = new Set<string>(
  "!%,.:;?)]}'\"" + "。，、：；！？）］｝》〉」』】〕〗〙〛…—～·％°′″‰",
)

const NO_END_CHARS = new Set<string>(
  "([{'\"$#@`" + "（［｛《〈「『【〔〖＄￥",
)

const BREAK_DELIM_CHARS = new Set<string>("-/\\,.;:!?)]}")

function matchesAny(cluster: string, set: Set<string>): boolean {
  for (const ch of cluster) {
    if (set.has(ch)) return true
  }
  return false
}

const ASCII_NO_START = new Set<number>()
for (const ch of "!%,.:;?)]}'\"") ASCII_NO_START.add(ch.charCodeAt(0))
const ASCII_NO_END = new Set<number>()
for (const ch of "([{'\"$#@`") ASCII_NO_END.add(ch.charCodeAt(0))

function canBreakBefore(prev: string, cur: string): boolean {
  if (prev.length === 1 && cur.length === 1) {
    const pc = prev.charCodeAt(0)
    const cc = cur.charCodeAt(0)
    if (pc >= 0x20 && pc < 0x7f && cc >= 0x20 && cc < 0x7f) {
      if (ASCII_NO_START.has(cc) || ASCII_NO_END.has(pc)) return false
      if (pc === 0x20 || BREAK_DELIM_CHARS.has(prev)) return true
      return false
    }
  }
  if (matchesAny(cur, NO_START_CHARS) || matchesAny(prev, NO_END_CHARS)) return false
  if (charWidth(prev) >= 2 || charWidth(cur) >= 2) return true
  if (prev === ' ' || prev === '\t') return true
  if (BREAK_DELIM_CHARS.has(prev)) return true
  return false
}

export function computeWrapStarts(clusters: string[], width: number): number[] {
  const total = clusters.length
  const starts: number[] = [0]
  let start = 0
  let lineW = 0
  let lastBreak = -1
  for (let i = 0; i < total; i++) {
    const w = charWidth(clusters[i]!)
    if (lineW + w > width && i > start) {
      let j: number
      if (lastBreak > start) {
        j = lastBreak
      } else {
        j = i
        while (j > start + 1 && matchesAny(clusters[j]!, NO_START_CHARS)) j--
        while (j > start + 1 && matchesAny(clusters[j - 1]!, NO_END_CHARS)) j--
      }
      starts.push(j)
      lineW = 0
      for (let k = j; k < i; k++) lineW += charWidth(clusters[k]!)
      start = j
      lastBreak = -1
    }
    const next = i + 1
    if (next < total && canBreakBefore(clusters[i]!, clusters[next]!)) lastBreak = next
    lineW += w
  }
  return starts
}

function pushWrapped(line: string, width: number, out: string[]): void {
  if (line.length === 0) {
    out.push('')
    return
  }
  const clusters: string[] = []
  for (const { segment } of segmentGraphemes(line)) clusters.push(segment)
  const starts = computeWrapStarts(clusters, width)
  for (let r = 0; r < starts.length; r++) {
    const from = starts[r]!
    const to = r + 1 < starts.length ? starts[r + 1]! : clusters.length
    out.push(clusters.slice(from, to).join(''))
  }
}

/**
 * Single normalization applied before every wrap pass. Terminal rendering
 * expands tabs and a lone carriage return rewinds the cursor, so both would
 * make the visually rendered line wider than the width computation assumed
 * and every later row would land on the wrong column. Both are replaced
 * with spaces / newlines here so wrap math and rendering always agree.
 */
export function normalizeWrapText(text: string): string {
  if (!text.includes('\r') && !text.includes('\t')) return text
  return text.replace(/\r\n?/g, '\n').replace(/\t/g, '    ')
}

export function wrapLines(text: string, width: number): string[] {
  if (width <= 0) return ['']
  const lines: string[] = []
  for (const rawLine of normalizeWrapText(text).split('\n')) {
    pushWrapped(rawLine, width, lines)
  }
  return lines
}

export function wrapIndented(text: string, width: number, hang: number): string[] {
  if (hang <= 0) return wrapLines(text, width)
  const lines: string[] = []
  for (const rawLine of normalizeWrapText(text).split('\n')) {
    if (rawLine === '') {
      lines.push('')
      continue
    }
    const parts = wrapLines(rawLine, Math.max(4, width - hang))
    lines.push(parts[0] ?? '')
    for (let i = 1; i < parts.length; i++) {
      lines.push(' '.repeat(hang) + parts[i]!)
    }
  }
  return lines
}

export interface LineBreak {
  start: number
  end: number
}

function pushWrappedOffsets(line: string, width: number, base: number, out: LineBreak[]): void {
  if (line.length === 0) {
    out.push({ start: base, end: base })
    return
  }
  const clusters: string[] = []
  const offsets: number[] = []
  for (const { segment, index } of segmentGraphemes(line)) {
    clusters.push(segment)
    offsets.push(index)
  }
  const starts = computeWrapStarts(clusters, width)
  for (let r = 0; r < starts.length; r++) {
    const from = starts[r]!
    const to = r + 1 < starts.length ? offsets[starts[r + 1]!]! : line.length
    out.push({ start: base + offsets[from]!, end: base + to })
  }
}

export function lineBreaks(text: string, width: number): LineBreak[] {
  const breaks: LineBreak[] = []
  let start = 0
  for (const rawLine of text.split('\n')) {
    pushWrappedOffsets(rawLine, width, start, breaks)
    start += rawLine.length + 1
  }
  return breaks
}

export interface Point {
  row: number
  col: number
}

export function locToPoint(text: string, width: number, index: number): Point {
  const breaks = lineBreaks(text, width)
  for (let row = 0; row < breaks.length; row++) {
    const { start, end } = breaks[row]!
    if (index < end || (index === end && row < breaks.length - 1 && breaks[row + 1]!.start > end)) {
      return { row, col: textWidth(text.slice(start, index)) }
    }
  }
  const last = breaks[breaks.length - 1]!
  return { row: breaks.length - 1, col: textWidth(text.slice(last.start, last.end)) }
}

export function colToCharIndex(line: string, col: number): number {
  let width = 0
  for (const { segment, index } of segmentGraphemes(line)) {
    if (width >= col) return index
    width += charWidth(segment)
  }
  return line.length
}

export function caretScrollStart(text: string, caret: number, width: number): number {
  const clamped = Math.min(Math.max(0, caret), text.length)
  const caretCol = textWidth(text.slice(0, clamped))
  if (caretCol <= width) return 0
  const minPrefix = caretCol - width
  let prefix = 0
  for (const { segment, index } of segmentGraphemes(text)) {
    if (index >= clamped) break
    if (prefix >= minPrefix) return index
    prefix += charWidth(segment)
  }
  return clamped
}

export function padToWidth(text: string, width: number): string {
  const used = textWidth(text)
  return text + ' '.repeat(Math.max(0, width - used))
}

export function truncate(text: string, width: number): string {
  let used = 0
  for (const { segment, index } of segmentGraphemes(text)) {
    const w = charWidth(segment)
    if (used + w > width) return text.slice(0, index)
    used += w
  }
  return text
}

export function errorText(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause)
}
