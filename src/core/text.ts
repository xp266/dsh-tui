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

function pushWrapped(line: string, width: number, out: string[]): void {
  if (line.length === 0) {
    out.push('')
    return
  }
  let current = ''
  let currentWidth = 0
  for (const { segment } of segmentGraphemes(line)) {
    const w = charWidth(segment)
    if (currentWidth + w > width) {
      out.push(current)
      current = segment
      currentWidth = w
      continue
    }
    current += segment
    currentWidth += w
  }
  out.push(current)
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
  let used = 0
  let segStart = 0
  for (const { segment, index } of segmentGraphemes(line)) {
    const w = charWidth(segment)
    if (used + w > width) {
      out.push({ start: base + segStart, end: base + index })
      segStart = index
      used = 0
    }
    used += w
  }
  out.push({ start: base + segStart, end: base + line.length })
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
