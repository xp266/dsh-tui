import type { Message } from '../state/messages.ts'
import { colToCharIndex, textWidth, wrapLines } from '../utils/text.ts'

export const BUBBLE_WIDTH_OFFSET = 8

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

export function lineCount(message: Message, width: number): number {
  switch (message.kind) {
    case 'bubble':
      return wrapLines(message.content, width - BUBBLE_WIDTH_OFFSET).length + 3
    case 'collapsible':
      return message.collapsed ? 2 : wrapLines(message.body, width - BUBBLE_WIDTH_OFFSET).length + 3
  }
}

export function rowCount(messages: Message[], width: number): number {
  return messages.reduce((sum, message) => sum + lineCount(message, width), 0)
}

export function rowInfoAt(messages: Message[], width: number, row: number): RowInfo | null {
  let cursor = 0
  for (let i = 0; i < messages.length; i++) {
    const message = messages[i]
    const count = lineCount(message, width)
    if (row < cursor + count) {
      return rowInfo(message, i, row - cursor, width)
    }
    cursor += count
  }
  return null
}

function rowInfo(message: Message, index: number, offset: number, width: number): RowInfo {
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
      const lines = wrapLines(message.content, width - BUBBLE_WIDTH_OFFSET)
      if (offset === 0 || offset === lines.length + 1) {
        return { ...base, kind: 'pad', background: true, role: message.role }
      }
      if (offset <= lines.length) {
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
      const lines = wrapLines(message.body, width - BUBBLE_WIDTH_OFFSET)
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

export interface SelectionRect {
  top: number
  bottom: number
  left: number
  right: number
}

export interface SelectionPoint {
  row: number
  x: number
}

export function dragRect(anchor: SelectionPoint, row: number, x: number): SelectionRect {
  return {
    top: Math.min(anchor.row, row),
    bottom: Math.max(anchor.row, row),
    left: Math.min(anchor.x, x),
    right: Math.max(anchor.x, x + 1),
  }
}

export function selectionText(messages: Message[], width: number, rect: SelectionRect): string {
  const total = rowCount(messages, width)
  const top = Math.max(0, Math.min(rect.top, total - 1))
  const bottom = Math.max(0, Math.min(rect.bottom, total - 1))
  const lines: string[] = []
  for (let row = top; row <= bottom; row++) {
    const info = rowInfoAt(messages, width, row)
    if (info && info.selectable) {
      const lineWidth = textWidth(info.text)
      const left = Math.max(rect.left, info.colStart)
      const right = Math.min(rect.right, info.colStart + lineWidth)
      if (left < right) {
        const startIndex = colToCharIndex(info.text, left - info.colStart)
        const endIndex = colToCharIndex(info.text, right - info.colStart)
        lines.push(info.text.slice(startIndex, endIndex))
        continue
      }
    }
    lines.push('')
  }
  return lines.join('\n').replace(/\s+$/, '')
}
