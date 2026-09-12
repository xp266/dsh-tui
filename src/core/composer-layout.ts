import { CHROME_FRAME_ROWS, INPUT_WIDTH_OFFSET } from './metrics.ts'
import { colToCharIndex, lineBreaks, locToPoint, textWidth, wrapLines } from './text.ts'

export const INPUT_MAX_CONTENT_ROWS = 8

export interface InputLayout {
  lines: string[]
  cursorRow: number
  cursorCol: number
  realRows: number
  barHeight: number
  visibleStart: number
}

interface LayoutCacheEntry {
  lines: string[]
  segmentStarts: number[]
  bytes: number
}

// Busy ticks re-render the composer with an unchanged buffer; the cached wrap
// keeps those frames at the cost of a map lookup.
const LAYOUT_CACHE_MAX_BYTES = 1024 * 1024

const layoutCache = new Map<string, LayoutCacheEntry>()
let layoutCacheBytes = 0

function evictLayoutCacheIfNeeded(): void {
  while (layoutCache.size > 0 && layoutCacheBytes >= LAYOUT_CACHE_MAX_BYTES) {
    const oldest = layoutCache.keys().next()
    if (oldest.done) return
    const entry = layoutCache.get(oldest.value)
    if (entry !== undefined) layoutCacheBytes -= entry.bytes
    layoutCache.delete(oldest.value)
  }
}

export function inputLayout(value: string, cursor: number, width: number): InputLayout {
  const contentWidth = width - INPUT_WIDTH_OFFSET
  const cacheKey = `${contentWidth}\u0000${value}`
  const hit = layoutCache.get(cacheKey)
  let lines: string[]
  let segmentStarts: number[]
  if (hit !== undefined) {
    lines = hit.lines
    segmentStarts = hit.segmentStarts
  } else {
    lines = []
    segmentStarts = []
    let charOffset = 0
    for (const raw of value.split('\n')) {
      const wrapped = wrapLines(raw, contentWidth)
      let offset = 0
      for (const segment of wrapped) {
        lines.push(segment)
        segmentStarts.push(charOffset + offset)
        offset += segment.length
      }
      charOffset += raw.length + 1
    }
    evictLayoutCacheIfNeeded()
    layoutCache.set(cacheKey, { lines, segmentStarts, bytes: value.length })
    layoutCacheBytes += value.length
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
