import type { Message } from '../../model/message.ts'
import { colToCharIndex, textWidth, truncate, wrapIndented, wrapLines } from '../../core/text.ts'
import { selectedRange } from '../../model/selection.ts'
import type { LineSelection } from '../../model/selection.ts'
import { sliceByColumns } from '../selection-registry.ts'
import { renderMarkdown } from './md/index.ts'
import { segmentsKey } from '../../core/segments.ts'
import type { Segment } from '../../core/segments.ts'
import { BUBBLE_WIDTH_OFFSET, HEADER_LABEL_COL } from '../../core/metrics.ts'

export { HEADER_LABEL_COL }

export const SPINNER_FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏']

export type RowKind = 'pad' | 'text' | 'header' | 'blank'

export interface RowInfo {
  messageIndex: number
  messageId: string
  kind: RowKind
  text: string
  colStart: number
  selectable: boolean
  clickable: boolean
  background: boolean
  backgroundWidth: number
  muted: boolean
  label: string
  collapsed: boolean
  thinking: boolean
  role: 'user' | 'assistant' | 'error' | undefined
  segments?: Segment[]
  segKey?: string
}

interface WrapEntry {
  content: string
  collapsed: boolean
  lines: string[]
  rows: Segment[][] | null
}

const wrapCache = new Map<string, WrapEntry>()

export function clearWrapCache(): void {
  wrapCache.clear()
}

function evictWrapCacheIfNeeded(): void {
  while (wrapCache.size >= 16384) {
    const oldest = wrapCache.keys().next()
    if (oldest.done) return
    wrapCache.delete(oldest.value)
  }
}

function wrapFor(message: Message, width: number): WrapEntry {
  const key = `${message.id}:${width}`
  const entry = wrapCache.get(key)
  const content = message.kind === 'bubble' ? message.content : message.body
  const collapsed = message.kind === 'collapsible' && message.collapsed
  if (entry !== undefined && entry.content === content && entry.collapsed === collapsed) {
    return entry
  }
  const plainBubble = message.kind === 'bubble' && message.variant !== undefined
  const useMarkdown = !plainBubble
    && (message.kind === 'bubble' && message.role === 'assistant'
      || message.kind === 'collapsible' && message.thinking === true)
  let lines: string[]
  let rows: Segment[][] | null = null
  if (useMarkdown) {
    const rendered = renderMarkdown(content, width - BUBBLE_WIDTH_OFFSET, message.kind === 'collapsible')
    rows = rendered.rows
    lines = rendered.lines
  } else if (plainBubble) {
    lines = wrapIndented(content, width - BUBBLE_WIDTH_OFFSET, message.kind === 'bubble' ? message.hang ?? 0 : 0)
  } else {
    lines = wrapLines(content, width - BUBBLE_WIDTH_OFFSET)
  }
  const next: WrapEntry = { content, collapsed, lines, rows }
  evictWrapCacheIfNeeded()
  wrapCache.set(key, next)
  return next
}

const segKeyMemo = new WeakMap<Segment[], string>()

function segmentsKeyCached(segments: Segment[]): string {
  const hit = segKeyMemo.get(segments)
  if (hit !== undefined) return hit
  const key = segmentsKey(segments)
  segKeyMemo.set(segments, key)
  return key
}

function isCompactBubble(message: Message): boolean {
  return message.kind === 'bubble' && message.role === 'assistant' && message.variant === undefined
}

export function lineCount(message: Message, width: number): number {
  switch (message.kind) {
    case 'bubble':
      return wrapFor(message, width).lines.length + (isCompactBubble(message) ? 1 : 3)
    case 'collapsible':
      return message.collapsed ? 2 : wrapFor(message, width).lines.length + 3
  }
}

export interface RowIndex {
  total: number
  rowAt(row: number): RowInfo | null
}

export function buildRowIndex(messages: Message[], width: number): RowIndex {
  const starts = new Array<number>(messages.length)
  const counts = new Array<number>(messages.length)
  let total = 0
  for (let i = 0; i < messages.length; i++) {
    starts[i] = total
    const count = lineCount(messages[i]!, width)
    counts[i] = count
    total += count
  }
  return {
    total,
    rowAt(row: number): RowInfo | null {
      if (row < 0 || row >= total) return null
      let low = 0
      let high = messages.length - 1
      while (low < high) {
        const mid = (low + high + 1) >> 1
        if (starts[mid]! <= row) low = mid
        else high = mid - 1
      }
      return rowInfo(messages[low]!, low, row - starts[low]!, width, counts[low]!)
    },
  }
}

export function rowCount(messages: Message[], width: number): number {
  return rowIndexFor(messages, width).total
}

let indexMessages: Message[] | undefined
let indexWidth = -1
let indexCache: RowIndex | undefined

export function rowIndexFor(messages: Message[], width: number): RowIndex {
  if (indexCache !== undefined && indexMessages === messages && indexWidth === width) {
    return indexCache
  }
  indexMessages = messages
  indexWidth = width
  indexCache = buildRowIndex(messages, width)
  return indexCache
}

export function rowInfoAt(messages: Message[], width: number, row: number): RowInfo | null {
  return rowIndexFor(messages, width).rowAt(row)
}

function rowInfo(message: Message, index: number, offset: number, width: number, count: number): RowInfo {
  const base: RowInfo = {
    messageIndex: index,
    messageId: message.id,
    kind: 'blank',
    text: '',
    colStart: 0,
    selectable: false,
    clickable: false,
    background: false,
    backgroundWidth: width - 4,
    muted: false,
    label: '',
    collapsed: false,
    thinking: false,
    role: undefined,
  }
  switch (message.kind) {
    case 'bubble': {
      if (isCompactBubble(message)) {
        const wrapped = wrapFor(message, width)
        if (offset < count - 1) {
          const segments = wrapped.rows?.[offset]
          return {
            ...base,
            kind: 'text',
            text: wrapped.lines[offset] ?? '',
            colStart: 4,
            selectable: true,
            role: message.role,
            ...segments === undefined ? {} : { segments, segKey: segmentsKeyCached(segments) },
          }
        }
        return { ...base, kind: 'blank' }
      }
      const muted = message.variant !== undefined
      if (offset === 0 || offset === count - 2) {
        return { ...base, kind: 'pad', background: true, role: message.role }
      }
      if (offset <= count - 3) {
        const wrapped = wrapFor(message, width)
        const segments = wrapped.rows?.[offset - 1]
        return {
          ...base,
          kind: 'text',
          text: wrapped.lines[offset - 1] ?? '',
          colStart: 4,
          selectable: true,
          background: true,
          muted,
          role: message.role,
          ...segments === undefined ? {} : { segments, segKey: segmentsKeyCached(segments) },
        }
      }
      return { ...base, kind: 'blank' }
    }
    case 'collapsible': {
      if (offset === 0) {
        return {
          ...base,
          kind: 'header',
          colStart: HEADER_LABEL_COL,
          clickable: true,
          label: fitLabel(message.label, width),
          collapsed: message.collapsed,
          thinking: message.thinking === true,
        }
      }
      if (offset === 1 || message.collapsed) {
        return { ...base, kind: 'blank' }
      }
      const wrapped = wrapFor(message, width)
      if (offset <= wrapped.lines.length + 1) {
        const line = offset - 2
        const segments = wrapped.rows?.[line]
        return {
          ...base,
          kind: 'text',
          text: wrapped.lines[line] ?? '',
          colStart: message.bodyCol ?? 4,
          selectable: true,
          muted: true,
          ...segments === undefined ? {} : { segments, segKey: segmentsKeyCached(segments) },
        }
      }
      return { ...base, kind: 'blank' }
    }
  }
}

export function fitLabel(label: string, width: number): string {
  const available = Math.max(1, width - 8)
  if (textWidth(label) <= available) return label
  const bracket = label.indexOf('[')
  if (bracket < 0) {
    const cut = truncate(label, Math.max(1, available - 3))
    return cut.length === label.length ? cut : `${cut}...`
  }
  const name = label.slice(0, bracket + 1)
  const rest = label.slice(bracket + 1)
  const budget = Math.max(1, available - textWidth(name) - 4)
  const cut = truncate(rest, budget)
  return `${name}${cut.length === rest.length ? rest : `${cut}...`}]`
}

export function headerSymbol(collapsed: boolean): string {
  return collapsed ? '-' : '↓'
}

export interface ScrollbarGeometry {
  top: number
  height: number
}

export function scrollbarGeometry(total: number, height: number, scrollTop: number): ScrollbarGeometry | null {
  if (total <= height || height < 1) return null
  const thumbHeight = Math.max(1, Math.floor((height * height) / total))
  const maxScroll = total - height
  const travel = height - thumbHeight
  const top = maxScroll === 0 ? 0 : Math.min(travel, Math.round((travel * scrollTop) / maxScroll))
  return { top, height: thumbHeight }
}

export function selectionText(messages: Message[], width: number, selection: LineSelection): string {
  const index = rowIndexFor(messages, width)
  const total = index.total
  const top = Math.max(0, Math.min(selection.anchorRow, selection.focusRow))
  const bottom = Math.min(Math.max(selection.anchorRow, selection.focusRow), total - 1)
  const envStart = Math.min(selection.anchorCol, selection.focusCol)
  const envEnd = Math.max(selection.anchorCol, selection.focusCol)
  const lines: string[] = []
  for (let row = top; row <= bottom; row++) {
    const info = index.rowAt(row)
    if (info === null) continue
    if (info.kind === 'pad') continue
    const range = selectedRange(selection, row)
    if (range === null) continue
    if (info.kind === 'header') {
      let line = ''
      let prevEnd = -1
      const pieces: Array<{ text: string; col: number }> = [
        { text: `  ${headerSymbol(info.collapsed)} `, col: 0 },
        { text: info.label, col: HEADER_LABEL_COL },
      ]
      for (const piece of pieces) {
        const pieceWidth = textWidth(piece.text)
        if (!(envEnd > piece.col && envStart < piece.col + pieceWidth)) continue
        const start = Math.max(range.start, piece.col)
        const end = Math.min(range.end, piece.col + pieceWidth)
        if (start >= end) continue
        const text = sliceByColumns(piece.text, start - piece.col, end - piece.col)
        if (text === '') continue
        if (line !== '') line += prevEnd === piece.col ? '' : ' '
        line += text
        prevEnd = piece.col + pieceWidth
      }
      lines.push(line)
      continue
    }
    const line = info.text
    const lineWidth = textWidth(line)
    const left = Math.max(range.start, info.colStart)
    const right = Math.min(range.end, info.colStart + lineWidth)
    if (left < right) {
      const startIndex = colToCharIndex(line, left - info.colStart)
      const endIndex = colToCharIndex(line, right - info.colStart)
      lines.push(line.slice(startIndex, endIndex))
      continue
    }
    lines.push('')
  }
  return lines.join('\n').replace(/[ \t]+$/gm, '').replace(/\n+$/, '')
}
