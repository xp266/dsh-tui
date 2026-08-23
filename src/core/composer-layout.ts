import { CHROME_FRAME_ROWS, INPUT_WIDTH_OFFSET } from './metrics.ts'
import { colToCharIndex, lineBreaks, locToPoint, textWidth, wrapLines } from './text.ts'

export const INPUT_MAX_CONTENT_ROWS = 8

function wrapLine(line: string, width: number): string[] {
  return wrapLines(line, width)
}

export interface InputLayout {
  lines: string[]
  cursorRow: number
  cursorCol: number
  realRows: number
  barHeight: number
  visibleStart: number
}

export function inputLayout(value: string, cursor: number, width: number): InputLayout {
  const contentWidth = width - INPUT_WIDTH_OFFSET
  const lines: string[] = []
  const segmentStarts: number[] = []
  let charOffset = 0
  for (const raw of value.split('\n')) {
    const wrapped = wrapLine(raw, contentWidth)
    let offset = 0
    for (const segment of wrapped) {
      lines.push(segment)
      segmentStarts.push(charOffset + offset)
      offset += segment.length
    }
    charOffset += raw.length + 1
  }
  const clamped = Math.max(0, Math.min(cursor, value.length))
  let cursorRow = lines.length - 1
  let cursorCol = 0
  for (let i = 0; i < lines.length; i++) {
    const start = segmentStarts[i]!
    const end = start + lines[i]!.length
    if (clamped < end || i === lines.length - 1 || clamped < segmentStarts[i + 1]!) {
      cursorRow = i
      cursorCol = textWidth(lines[i]!.slice(0, clamped - start))
      break
    }
  }
  const realRows = Math.min(lines.length, INPUT_MAX_CONTENT_ROWS - 1)
  const maxVisibleReal = INPUT_MAX_CONTENT_ROWS - 1
  const visibleStart = Math.min(
    Math.max(0, cursorRow - (maxVisibleReal - 1)),
    Math.max(0, lines.length - maxVisibleReal),
  )
  return {
    lines,
    cursorRow,
    cursorCol,
    realRows,
    barHeight: realRows + CHROME_FRAME_ROWS,
    visibleStart,
  }
}

export function moveCaretLine(value: string, cursor: number, wrapWidth: number, delta: -1 | 1): number {
  const breaks = lineBreaks(value, wrapWidth)
  const point = locToPoint(value, wrapWidth, cursor)
  const targetRow = point.row + delta
  if (targetRow < 0 || targetRow >= breaks.length) return cursor
  const target = breaks[targetRow]!
  return target.start + colToCharIndex(value.slice(target.start, target.end), point.col)
}
