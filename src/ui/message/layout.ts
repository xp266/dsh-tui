import type { Message } from '../../model/message.ts'
import { colToCharIndex, textWidth, wrapLines } from '../../utils/text.ts'
import { selectedRange } from '../../model/selection.ts'
import type { LineSelection } from '../../model/selection.ts'

const BUBBLE_WIDTH_OFFSET = 8

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
  running: boolean
  collapsed: boolean
  role: 'user' | 'assistant' | 'error' | undefined
}

interface WrapEntry {
  content: string
  collapsed: boolean
  lines: string[]
}

const wrapCache = new Map<string, WrapEntry>()

function wrapFor(message: Message, width: number): string[] {
  const key = `${message.id}:${width}`
  const entry = wrapCache.get(key)
  const content = message.kind === 'bubble' ? message.content : message.body
  const collapsed = message.kind === 'collapsible' && message.collapsed
  if (entry !== undefined && entry.content === content && entry.collapsed === collapsed) {
    return entry.lines
  }
  const lines = wrapLines(content, width - BUBBLE_WIDTH_OFFSET)
  wrapCache.set(key, { content, collapsed, lines })
  return lines
}

export function lineCount(message: Message, width: number): number {
  switch (message.kind) {
    case 'bubble':
      return wrapFor(message, width).length + 3
    case 'collapsible':
      return message.collapsed ? 2 : wrapFor(message, width).length + 3
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
  let total = 0
  for (let i = 0; i < messages.length; i++) total += lineCount(messages[i]!, width)
  return total
}

export function rowInfoAt(messages: Message[], width: number, row: number): RowInfo | null {
  return buildRowIndex(messages, width).rowAt(row)
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
    running: false,
    collapsed: false,
    role: undefined,
  }
  switch (message.kind) {
    case 'bubble': {
      if (offset === 0 || offset === count - 2) {
        return { ...base, kind: 'pad', background: true, role: message.role }
      }
      if (offset <= count - 3) {
        const lines = wrapFor(message, width)
        return {
          ...base,
          kind: 'text',
          text: lines[offset - 1] ?? '',
          colStart: 4,
          selectable: true,
          background: true,
          role: message.role,
        }
      }
      return { ...base, kind: 'blank' }
    }
    case 'collapsible': {
      if (offset === 0) {
        return {
          ...base,
          kind: 'header',
          colStart: 2,
          clickable: true,
          label: message.label,
          running: message.running,
          collapsed: message.collapsed,
        }
      }
      if (offset === 1 || message.collapsed) {
        return { ...base, kind: 'blank' }
      }
      const lines = wrapFor(message, width)
      if (offset <= lines.length + 1) {
        return {
          ...base,
          kind: 'text',
          text: lines[offset - 2] ?? '',
          colStart: 4,
          selectable: true,
          muted: true,
        }
      }
      return { ...base, kind: 'blank' }
    }
  }
}

export function headerSymbol(running: boolean, collapsed: boolean): string {
  if (running) return '⠋'
  return collapsed ? '-' : '↓'
}

export function selectionText(messages: Message[], width: number, selection: LineSelection): string {
  const index = buildRowIndex(messages, width)
  const total = index.total
  const top = Math.max(0, Math.min(selection.anchorRow, selection.focusRow))
  const bottom = Math.min(Math.max(selection.anchorRow, selection.focusRow), total - 1)
  const lines: string[] = []
  for (let row = top; row <= bottom; row++) {
    const info = index.rowAt(row)
    if (info === null) continue
    const line = info.kind === 'header'
      ? `  ${headerSymbol(info.running, info.collapsed)} ${info.label}`
      : info.text
    const range = selectedRange(selection, row)
    if (range === null) continue
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