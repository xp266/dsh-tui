import stringWidth from 'string-width'

const widthCache = new Map<string, number>()

export function textWidth(text: string): number {
  const cached = widthCache.get(text)
  if (cached !== undefined) return cached
  const width = stringWidth(text)
  if (widthCache.size >= 5000) widthCache.clear()
  widthCache.set(text, width)
  return width
}

const charWidthCache = new Map<string, number>()

const graphemeSegmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' })

export function segmentGraphemes(text: string): Iterable<Intl.SegmentData> {
  return graphemeSegmenter.segment(text)
}

export function charWidth(cluster: string): number {
  const cached = charWidthCache.get(cluster)
  if (cached !== undefined) return cached
  const width = stringWidth(cluster)
  if (charWidthCache.size >= 8192) charWidthCache.clear()
  charWidthCache.set(cluster, width)
  return width
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

function canBreakBefore(prev: string, cur: string): boolean {
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

export function wrapLines(text: string, width: number): string[] {
  if (width <= 0) return ['']
  const lines: string[] = []
  for (const rawLine of text.split('\n')) {
    pushWrapped(rawLine, width, lines)
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
    if (index <= end) {
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
