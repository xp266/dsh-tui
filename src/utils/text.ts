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

export function charWidth(ch: string): number {
  const cached = charWidthCache.get(ch)
  if (cached !== undefined) return cached
  const width = stringWidth(ch)
  if (charWidthCache.size >= 8192) charWidthCache.clear()
  charWidthCache.set(ch, width)
  return width
}

export function wrapLines(text: string, width: number): string[] {
  if (width <= 0) return ['']
  const lines: string[] = []
  for (const rawLine of text.split('\n')) {
    if (rawLine.length === 0) {
      lines.push('')
      continue
    }
    let current = ''
    let currentWidth = 0
    for (const ch of rawLine) {
      const w = charWidth(ch)
      if (currentWidth + w > width) {
        lines.push(current)
        current = ch
        currentWidth = w
      } else {
        current += ch
        currentWidth += w
      }
    }
    lines.push(current)
  }
  return lines
}

export interface LineBreak {
  start: number
  end: number
}

export function lineBreaks(text: string, width: number): LineBreak[] {
  const breaks: LineBreak[] = []
  let start = 0
  for (const rawLine of text.split('\n')) {
    if (rawLine.length === 0) {
      breaks.push({ start, end: start })
      start++
      continue
    }
    let used = 0
    let segStart = 0
    for (let i = 0; i < rawLine.length; i++) {
      const w = charWidth(rawLine[i])
      if (used + w > width) {
        breaks.push({ start: start + segStart, end: start + i })
        segStart = i
        used = 0
      }
      used += w
    }
    breaks.push({ start: start + segStart, end: start + rawLine.length })
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
  for (let i = 0; i < line.length; i++) {
    if (width >= col) return i
    width += charWidth(line[i])
  }
  return line.length
}

export function padToWidth(text: string, width: number): string {
  const used = textWidth(text)
  return text + ' '.repeat(Math.max(0, width - used))
}

export function truncate(text: string, width: number): string {
  let used = 0
  for (let i = 0; i < text.length; i++) {
    const charWidth = textWidth(text[i])
    if (used + charWidth > width) return text.slice(0, i)
    used += charWidth
  }
  return text
}

export function errorText(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause)
}