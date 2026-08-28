import type { Message, BubbleMessage } from '../../model/message.ts'
import { colToCharIndex, textWidth, truncate, wrapIndented, wrapLines } from '../../core/text.ts'
import { selectedRange } from '../../model/selection.ts'
import type { LineSelection } from '../../model/selection.ts'
import { sliceByColumns } from '../selection-registry.ts'
import { renderMarkdown } from './md/index.ts'
import { renderToolDiffBody, toolDiffHeader } from './tool-diff.ts'
import { segmentsKey } from '../../core/segments.ts'
import type { Segment } from '../../core/segments.ts'
import { COLORS } from '../../theme.ts'
import { PLAN_TOOL_NAME } from '../../chat/store.ts'
import { BUBBLE_WIDTH_OFFSET, CHROME_MARGIN_X, HEADER_LABEL_COL, SCROLLBAR_COL_FROM_EDGE, SCROLLBAR_GAP_COLS } from '../../core/metrics.ts'

export { HEADER_LABEL_COL }

export const SPINNER_FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏']

export type RowKind = 'pad' | 'text' | 'header' | 'blank'

export interface RowInfo {
  messageIndex: number
  messageId: string
  lineNo: number
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
  spinner?: boolean
  accent?: string
  lineBg?: string
}

interface BodyRendered {
  lines: string[]
  rows: Segment[][] | null
  bgs: (string | undefined)[] | null
}

type PlanRow =
  | { type: 'pad'; role: RowInfo['role'] }
  | { type: 'blank' }
  | { type: 'header'; label: string; collapsed: boolean; clickable: boolean }
  | {
      type: 'body'
      line: number
      colStart: number
      bg: boolean
      muted: boolean
      selectable: boolean
      role: RowInfo['role']
    }
  | {
      type: 'lit'
      text: string
      segments?: Segment[]
      colStart: number
      bg: boolean
      muted: boolean
      selectable: boolean
      role: RowInfo['role']
    }

interface MessageRender extends BodyRendered {
  plan: PlanRow[]
}

export function clearLayoutCache(): void {
  cachedId = undefined
  cachedKey = ''
  cachedWidth = -1
  cachedRender = undefined
}

function toolDiffKey(message: Extract<Message, { kind: 'tool-diff' }>): string {
  let key = `${message.tool}\u0000${message.path}\u0000${message.error ?? ''}\u0000${message.streaming ? 1 : 0}\u0000${message.streamText ?? ''}`
  for (const hunk of message.hunks) {
    key += '\u0001'
    for (const line of hunk) key += `${line.kind}\u0002${line.text}\n`
  }
  return key
}

const padRow = (role: RowInfo['role']): PlanRow => ({ type: 'pad', role })
const blankRow = (): PlanRow => ({ type: 'blank' })

function bodyRows(count: number, options: { colStart: number; bg: boolean; muted: boolean; selectable: boolean; role: RowInfo['role'] }): PlanRow[] {
  const out: PlanRow[] = []
  for (let line = 0; line < count; line++) {
    out.push({ type: 'body', line, ...options })
  }
  return out
}

function renderBody(message: Message, width: number): BodyRendered {
  const inner = width - BUBBLE_WIDTH_OFFSET
  switch (message.kind) {
    case 'bubble': {
      if (message.role !== 'user' && message.variant !== undefined) {
        const lines = wrapIndented(message.content, inner, message.hang ?? 0)
        return { lines, rows: null, bgs: null }
      }
      if (message.role !== 'user' && message.origin === 'command') {
        const lines = wrapLines(message.content, inner)
        return { lines, rows: null, bgs: null }
      }
      if (message.role === 'assistant') {
        const rendered = renderMarkdown(message.content, inner)
        return { lines: rendered.lines, rows: rendered.rows, bgs: null }
      }
      const lines = wrapLines(message.content, inner)
      return { lines, rows: null, bgs: null }
    }
    case 'collapsible': {
      if (message.thinking === true && !message.collapsed) {
        const rendered = renderMarkdown(message.body, inner, true)
        return { lines: rendered.lines, rows: rendered.rows, bgs: null }
      }
      const lines = wrapLines(message.body, inner)
      return { lines, rows: null, bgs: null }
    }
    case 'tool-diff': {
      if (message.hunks.length === 0 && message.tool === 'write' && message.streaming === true && message.streamText !== undefined && message.streamText !== '') {
        const lines = wrapLines(message.streamText, Math.max(4, inner - 2))
        return { lines, rows: null, bgs: null }
      }
      const rendered = renderToolDiffBody(message, inner)
      return { lines: rendered.lines, rows: rendered.rows, bgs: rendered.bgs }
    }
    case 'plan': {
      if (message.body === '' && message.error === undefined) return { lines: [], rows: null, bgs: null }
      const rendered = message.body === '' ? { lines: [], rows: [] } : renderMarkdown(message.body, inner)
      const lines = [...rendered.lines]
      const rows = [...rendered.rows]
      if (message.error !== undefined && message.error !== '') {
        const text = truncate(`error: ${message.error}`, Math.max(8, inner))
        lines.push(text)
        rows.push([{ text, style: { color: COLORS.errorText } }])
      }
      return { lines, rows, bgs: null }
    }
    case 'compaction': {
      if (message.summary === '' && message.error === undefined) return { lines: [], rows: null, bgs: null }
      const rendered = message.summary === '' ? { lines: [], rows: [] } : renderMarkdown(message.summary, inner)
      const lines = [...rendered.lines]
      const rows = [...rendered.rows]
      if (message.error !== undefined && message.error !== '') {
        const text = truncate(`error: ${message.error}`, Math.max(8, inner))
        lines.push(text)
        rows.push([{ text, style: { color: COLORS.errorText } }])
      }
      return { lines, rows, bgs: null }
    }
  }
}

function planFor(message: Message, body: BodyRendered): PlanRow[] {
  switch (message.kind) {
    case 'bubble': {
      const floating = message.role === 'error' || message.origin === 'command'
        || (message.role === 'assistant' && message.variant === undefined)
      const texts = bodyRows(body.lines.length, {
        colStart: 4,
        bg: !floating,
        muted: !floating && message.variant !== undefined,
        selectable: true,
        role: message.role,
      })
      return floating ? [...texts, blankRow()] : [padRow(message.role), ...texts, padRow(message.role), blankRow()]
    }
    case 'collapsible': {
      const header: PlanRow = {
        type: 'header',
        label: message.label,
        collapsed: message.collapsed,
        clickable: !Boolean(message.streaming),
      }
      if (message.collapsed) return [header, blankRow()]
      return [
        header,
        blankRow(),
        ...bodyRows(body.lines.length, { colStart: HEADER_LABEL_COL, bg: false, muted: true, selectable: true, role: 'assistant' }),
        blankRow(),
      ]
    }
    case 'tool-diff': {
      const header: PlanRow = {
        type: 'lit',
        text: toolDiffHeader(message),
        colStart: 4,
        bg: true,
        muted: true,
        selectable: true,
        role: 'assistant',
      }
      const streamingShell = message.hunks.length === 0 && message.streaming === true
      if (streamingShell && body.lines.length === 0) {
        return [padRow('assistant'), header, padRow('assistant'), blankRow()]
      }
      return [
        padRow('assistant'),
        header,
        padRow('assistant'),
        ...bodyRows(body.lines.length, { colStart: streamingShell ? 6 : 4, bg: true, muted: streamingShell, selectable: !streamingShell, role: 'assistant' }),
        padRow('assistant'),
        blankRow(),
      ]
    }
    case 'compaction': {
      const header: PlanRow = {
        type: 'lit',
        text: 'Compact',
        segments: [{ text: 'Compact', style: { color: COLORS.sectionHeader, bold: true } }],
        colStart: 4,
        bg: true,
        muted: false,
        selectable: false,
        role: 'assistant',
      }
      if (message.running) {
        return [padRow('assistant'), header, padRow('assistant'), blankRow()]
      }
      return [
        padRow('assistant'),
        header,
        padRow('assistant'),
        ...bodyRows(body.lines.length, { colStart: 4, bg: true, muted: false, selectable: true, role: 'assistant' }),
        padRow('assistant'),
        blankRow(),
      ]
    }
    case 'plan': {
      const header: PlanRow = {
        type: 'lit',
        text: PLAN_TOOL_NAME,
        colStart: 4,
        bg: true,
        muted: true,
        selectable: true,
        role: 'assistant',
      }
      if (message.streaming === true && body.lines.length === 0) {
        return [padRow('assistant'), header, padRow('assistant'), blankRow()]
      }
      return [
        padRow('assistant'),
        header,
        padRow('assistant'),
        ...bodyRows(body.lines.length, { colStart: 4, bg: true, muted: false, selectable: true, role: 'assistant' }),
        padRow('assistant'),
        blankRow(),
      ]
    }
  }
}

let cachedId: string | undefined
let cachedKey = ''
let cachedWidth = -1
let cachedRender: MessageRender | undefined

function cacheKeyOf(message: Message): string {
  switch (message.kind) {
    case 'bubble': return `${message.content}\u0000${message.variant ?? ''}`
    case 'collapsible': return `${message.body}\u0000${message.collapsed ? 1 : 0}`
    case 'tool-diff': return toolDiffKey(message)
    case 'compaction': return `${message.summary}\u0000${message.running ? 1 : 0}\u0000${message.error ?? ''}`
    case 'plan': return `${message.body}\u0000${message.streaming ? 1 : 0}\u0000${message.running ? 1 : 0}\u0000${message.error ?? ''}`
  }
}

function renderFor(message: Message, width: number): MessageRender {
  const key = cacheKeyOf(message)
  if (cachedRender !== undefined && cachedId === message.id && cachedKey === key && cachedWidth === width) {
    return cachedRender
  }
  const body = renderBody(message, width)
  const render: MessageRender = { ...body, plan: planFor(message, body) }
  cachedId = message.id
  cachedKey = key
  cachedWidth = width
  cachedRender = render
  return render
}

export function lineCount(message: Message, width: number): number {
  return renderFor(message, width).plan.length
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
      return rowInfo(messages[low]!, low, row - starts[low]!, width)
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

const segKeyMemo = new WeakMap<Segment[], string>()

function segmentsKeyCached(segments: Segment[]): string {
  const hit = segKeyMemo.get(segments)
  if (hit !== undefined) return hit
  const key = segmentsKey(segments)
  segKeyMemo.set(segments, key)
  return key
}

function rowInfo(message: Message, index: number, offset: number, width: number): RowInfo {
  const render = renderFor(message, width)
  const plan = render.plan[offset]
  const base: RowInfo = {
    messageIndex: index,
    messageId: message.id,
    lineNo: offset,
    kind: 'blank',
    text: '',
    colStart: 0,
    selectable: false,
    clickable: false,
    background: false,
    backgroundWidth: width - CHROME_MARGIN_X - SCROLLBAR_COL_FROM_EDGE - SCROLLBAR_GAP_COLS,
    muted: false,
    label: '',
    collapsed: false,
    thinking: false,
    role: undefined,
  }
  if (plan === undefined) return base
  switch (plan.type) {
    case 'pad':
      return { ...base, kind: 'pad', background: true, role: plan.role }
    case 'blank':
      return base
    case 'header':
      return {
        ...base,
        kind: 'header',
        colStart: HEADER_LABEL_COL,
        clickable: plan.clickable,
        label: fitLabel(plan.label, width),
        collapsed: plan.collapsed,
        spinner: Boolean(message.kind === 'collapsible' && (message.running || message.streaming)) || undefined,
      }
    case 'lit':
      return {
        ...base,
        kind: 'text',
        text: plan.text,
        colStart: plan.colStart,
        selectable: plan.selectable,
        background: plan.bg,
        muted: plan.muted,
        role: plan.role,
        ...(plan.segments === undefined ? {} : { segments: plan.segments, segKey: segmentsKeyCached(plan.segments) }),
      }
    case 'body': {
      const lineBg = render.bgs?.[plan.line]
      const segments = render.rows?.[plan.line]
      return {
        ...base,
        kind: 'text',
        text: render.lines[plan.line] ?? '',
        colStart: plan.colStart,
        selectable: plan.selectable,
        background: plan.bg || lineBg !== undefined,
        muted: plan.muted,
        role: plan.role,
        ...(lineBg === undefined ? {} : { lineBg }),
        ...(segments === undefined ? {} : { segments, segKey: segmentsKeyCached(segments) }),
      }
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
