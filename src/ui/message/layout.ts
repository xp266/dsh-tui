import type { Message, ToolCardMessage } from '../../model/message.ts'
import type { CustomMessage } from '../../contract/index.ts'
import { colToCharIndex, textWidth, truncate, wrapLines } from '../../core/text.ts'
import { hasFieldChar } from '../../core/fields.ts'
import { expandFieldChars, fieldRowSegments } from '../../core/field-view.ts'
import { selectedRange } from '../../model/selection.ts'
import type { LineSelection } from '../../model/selection.ts'
import { sliceByColumns } from '../selection-registry.ts'
import { renderMarkdown, renderMarkdownStreaming, clearMarkdownStreamStates } from './md/index.ts'
import { renderToolDiffBody, renderToolReadBody } from './tool-diff.ts'
import { trimTrailingBlanks } from '../../chat/tool-view.ts'
import { messageViewOf } from './message-views.ts'
import { segmentsKey } from '../../core/segments.ts'
import type { Segment } from '../../core/segments.ts'
import { COLORS } from '../../theme.ts'
import { glyphs } from '../../terminal/glyphs.ts'
import { BUBBLE_WIDTH_OFFSET, HEADER_LABEL_COL } from '../../core/metrics.ts'
import { messageBackgroundWidth } from '../layout-service.ts'
import { messageRendererOf } from './renderers.ts'

export { HEADER_LABEL_COL }

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
  wave?: boolean
  accent?: string
  lineBg?: string
}

interface BodyRendered {
  lines: string[]
  rows: Segment[][] | null
  bgs: (string | undefined)[] | null
  customLabel?: string
  customMuted?: boolean
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
      wave?: boolean
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
      wave?: boolean
    }

interface MessageRender extends BodyRendered {
  plan: PlanRow[]
}

let layoutEpoch = 0

export function clearLayoutCache(): void {
  layoutEpoch += 1
  clearMarkdownStreamStates()
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
  const override = messageRendererOf(message.kind)
  if (override !== undefined) {
    const rendered = override.render(message, inner)
    if (rendered !== undefined) {
      return {
        lines: rendered.lines,
        rows: rendered.rows ?? null,
        bgs: rendered.bgs ?? null,
        ...(rendered.customLabel === undefined ? {} : { customLabel: rendered.customLabel }),
        ...(rendered.customMuted === undefined ? {} : { customMuted: rendered.customMuted }),
      }
    }
  }
  switch (message.kind) {
    case 'bubble': {
      if (message.role !== 'user' && message.origin === 'command') {
        const lines = wrapLines(message.content, inner)
        return { lines, rows: null, bgs: null }
      }
      if (message.role === 'assistant') {
        const rendered = message.streaming === true
          ? renderMarkdownStreaming(message.content, inner, false, `bubble:${message.id}`)
          : renderMarkdown(message.content, inner, false, `bubble:${message.id}`)
        return { lines: rendered.lines, rows: rendered.rows, bgs: null }
      }
      const lines = wrapLines(message.content, inner)
      if (hasFieldChar(message.content)) {
        return {
          lines: lines.map(expandFieldChars),
          rows: lines.map(line => fieldRowSegments(line, { background: COLORS.userBubbleBackground })),
          bgs: null,
        }
      }
      return { lines, rows: null, bgs: null }
    }
    case 'collapsible': {
      if (message.thinking === true && !message.collapsed) {
        const streaming = message.running === true || message.streaming === true
        const rendered = streaming
          ? renderMarkdownStreaming(message.body, inner, true, `thinking:${message.id}`)
          : renderMarkdown(message.body, inner, true, `thinking:${message.id}`)
        return { lines: rendered.lines, rows: rendered.rows, bgs: null }
      }
      const lines = wrapLines(message.body, inner)
      return { lines, rows: null, bgs: null }
    }
    case 'tool-card': {
      if (message.diff !== undefined && message.diff.hunks.length > 0) {
        const rendered = renderToolDiffBody({
          tool: message.tool,
          path: message.diff.path,
          hunks: message.diff.hunks,
          error: message.error,
          ...(message.diff.backgrounds === undefined ? {} : { backgrounds: message.diff.backgrounds }),
        }, inner)
        return { lines: rendered.lines, rows: rendered.rows, bgs: rendered.bgs }
      }
      if (message.read !== undefined) {
        const rendered = renderToolReadBody({
          ...(message.read.path === undefined ? {} : { path: message.read.path }),
          lines: message.read.lines,
          ...(message.read.offset === undefined ? {} : { offset: message.read.offset }),
          ...(message.read.totalLines === undefined ? {} : { totalLines: message.read.totalLines }),
          ...(message.read.lang === undefined ? {} : { lang: message.read.lang }),
        }, inner)
        return { lines: rendered.lines, rows: rendered.rows, bgs: rendered.bgs }
      }
      const lines: string[] = []
      const rows: Segment[][] = []
      const push = (text: string, segments?: Segment[]): void => {
        lines.push(text)
        if (segments !== undefined) rows[lines.length - 1] = segments
      }
      const hasError = message.error !== undefined && message.error !== ''
      // `failed` is a render state, not content: the result text of an
      // errored call IS the error message, so it renders in red instead of
      // gaining a synthetic "failed" line next to it.
      const failed = message.failed === true && !hasError
      const resultBody = message.resultBody !== undefined && message.resultBody.trimEnd() !== ''
        ? trimTrailingBlanks(message.resultBody)
        : undefined
      const pill = message.exitCode !== undefined
        ? `[exit code: ${message.exitCode}]`
        : message.signal !== undefined ? `[killed by signal: ${message.signal}]` : undefined
      const hasArgs = message.argsBody !== ''
      const hasNested = (message.nested?.length ?? 0) > 0
      if (!hasArgs && resultBody === undefined && pill === undefined && !hasNested && !hasError && !failed) {
        return { lines: [], rows: null, bgs: null }
      }
      if (hasArgs) {
        for (const line of wrapLines(message.argsBody, inner)) push(line)
      }
      if (resultBody !== undefined) {
        if (hasArgs) push('')
        for (const line of wrapLines(resultBody, inner)) {
          push(line, failed ? [{ text: line, style: { color: COLORS.errorText } }] : undefined)
        }
      } else if (failed) {
        if (hasArgs) push('')
        push('failed', [{ text: 'failed', style: { color: COLORS.errorText } }])
      }
      if (pill !== undefined) push(pill)
      if (hasNested) {
        const prefix = `${glyphs.treeBranch} `
        for (const child of message.nested!) {
          const state = child.running
            ? ''
            : child.error !== undefined
              ? ` ${glyphs.separator} error`
              : child.resultBody === undefined || child.resultBody === '' ? '' : ` ${glyphs.separator} ${firstLine(child.resultBody)}`
          const label = truncate(child.label, Math.max(4, inner - 6))
          push(
            `${prefix}${label}${state}`,
            [
              { text: prefix, style: { color: COLORS.toolBodyText } },
              { text: `${label}${state}`, style: {} },
            ],
          )
        }
      }
      if (hasError) {
        if (lines.length > 0 && lines[lines.length - 1] !== '') push('')
        const text = truncate(message.error!, Math.max(8, inner))
        push(text, [{ text, style: { color: COLORS.errorText } }])
      }
      return { lines, rows: rows.length === 0 ? null : rows, bgs: null }
    }
    case 'compaction': {
      if (message.summary === '' && message.error === undefined) return { lines: [], rows: null, bgs: null }
      const streaming = message.running === true && message.summary !== ''
      const rendered = message.summary === ''
        ? { lines: [], rows: [] }
        : streaming
          ? renderMarkdownStreaming(message.summary, inner, false, `compaction:${message.id}`)
          : renderMarkdown(message.summary, inner, false, `compaction:${message.id}`)
      const lines = [...rendered.lines]
      const rows = [...rendered.rows]
      if (message.error !== undefined && message.error !== '') {
        const text = truncate(`error: ${message.error}`, Math.max(8, inner))
        lines.push(text)
        rows.push([{ text, style: { color: COLORS.errorText } }])
      }
      return { lines, rows, bgs: null }
    }
    case 'custom': {
      const view = messageViewOf(message.view)
      if (view === undefined) {
        return { lines: wrapLines(describeCustomData(message.data), inner), rows: null, bgs: null }
      }
      const rendered = view.render({ message, width: inner })
      const lines = rendered.wrap === false
        ? [...rendered.lines]
        : rendered.lines.flatMap(line => wrapLines(line, inner))
      return {
        lines,
        rows: null,
        bgs: null,
        customLabel: rendered.label ?? message.view,
        customMuted: rendered.muted ?? true,
      }
    }
  }
}

function describeCustomData(data: unknown): string {
  if (typeof data === 'string') return data
  try {
    return JSON.stringify(data, null, 2) ?? ''
  } catch {
    return String(data)
  }
}

function firstLine(text: string): string {
  const at = text.indexOf('\n')
  return at === -1 ? text : text.slice(0, at)
}

function planFor(message: Message, body: BodyRendered): PlanRow[] {
  switch (message.kind) {
    case 'bubble': {
      // User bubbles sit inside the background box; assistant, error, and
      // command output float without it.
      const floating = message.role === 'error' || message.role === 'assistant' || message.origin === 'command'
      const texts = bodyRows(body.lines.length, {
        colStart: 4,
        bg: !floating,
        muted: false,
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
    case 'tool-card': {
      const header: PlanRow = {
        type: 'lit',
        text: message.label,
        colStart: 4,
        bg: true,
        muted: true,
        selectable: true,
        role: 'assistant',
        ...(message.streaming === true || message.running === true ? { wave: true } : {}),
      }
      if (body.lines.length === 0 && message.running === true) {
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
        ...(message.running ? { wave: true } : {}),
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
    case 'custom': {
      const header: PlanRow = {
        type: 'header',
        label: body.customLabel ?? message.view,
        collapsed: false,
        clickable: false,
      }
      return [
        header,
        blankRow(),
        ...bodyRows(body.lines.length, {
          colStart: HEADER_LABEL_COL,
          bg: false,
          muted: body.customMuted ?? true,
          selectable: true,
          role: 'assistant',
        }),
        blankRow(),
      ]
    }
  }
}

type RenderFingerprint =
  | { kind: 'bubble'; content: string; role: string | undefined; origin: string | undefined; streaming: boolean | undefined }
  | { kind: 'collapsible'; body: string; label: string; collapsed: boolean; running: boolean; thinking: boolean | undefined; streaming: boolean | undefined }
  | { kind: 'tool-card'; tool: string; label: string; argsBody: string; resultBody: string | undefined; diff: ToolCardMessage['diff']; read: ToolCardMessage['read']; nested: ToolCardMessage['nested']; error: string | undefined; failed: boolean | undefined; exitCode: number | undefined; signal: string | undefined; bodyCol: number | undefined; running: boolean; streaming: boolean | undefined }
  | { kind: 'compaction'; summary: string; running: boolean; error: string | undefined }
  | { kind: 'custom'; view: string; data: unknown; running: boolean | undefined; streaming: boolean | undefined }

interface RenderMemoEntry {
  epoch: number
  width: number
  fingerprint: RenderFingerprint
  render: MessageRender
}

const renderMemo = new WeakMap<Message, RenderMemoEntry>()

function fingerprintOf(message: Message): RenderFingerprint {
  switch (message.kind) {
    case 'bubble':
      return {
        kind: 'bubble',
        content: message.content,
        role: message.role,
        origin: message.origin,
        streaming: message.streaming,
      }
    case 'collapsible':
      return {
        kind: 'collapsible',
        body: message.body,
        label: message.label,
        collapsed: message.collapsed,
        running: message.running,
        thinking: message.thinking,
        streaming: message.streaming,
      }
    case 'tool-card':
      return {
        kind: 'tool-card',
        tool: message.tool,
        label: message.label,
        argsBody: message.argsBody,
        resultBody: message.resultBody,
        diff: message.diff,
        read: message.read,
        nested: message.nested,
        error: message.error,
        failed: message.failed,
        exitCode: message.exitCode,
        signal: message.signal,
        bodyCol: message.bodyCol,
        running: message.running,
        streaming: message.streaming,
      }
    case 'compaction':
      return {
        kind: 'compaction',
        summary: message.summary,
        running: message.running,
        error: message.error,
      }
    case 'custom':
      return {
        kind: 'custom',
        view: message.view,
        data: message.data,
        running: message.running,
        streaming: message.streaming,
      }
  }
}

function fingerprintMatches(entry: RenderFingerprint, message: Message): boolean {
  switch (entry.kind) {
    case 'bubble':
      return message.kind === 'bubble'
        && entry.content === message.content
        && entry.role === message.role
        && entry.origin === message.origin
        && entry.streaming === message.streaming
    case 'collapsible':
      return message.kind === 'collapsible'
        && entry.body === message.body
        && entry.label === message.label
        && entry.collapsed === message.collapsed
        && entry.running === message.running
        && entry.thinking === message.thinking
        && entry.streaming === message.streaming
    case 'tool-card':
      return message.kind === 'tool-card'
        && entry.tool === message.tool
        && entry.label === message.label
        && entry.argsBody === message.argsBody
        && entry.resultBody === message.resultBody
        && entry.diff === message.diff
        && entry.read === message.read
        && entry.nested === message.nested
        && entry.error === message.error
        && entry.failed === message.failed
        && entry.exitCode === message.exitCode
        && entry.signal === message.signal
        && entry.bodyCol === message.bodyCol
        && entry.running === message.running
        && entry.streaming === message.streaming
    case 'compaction':
      return message.kind === 'compaction'
        && entry.summary === message.summary
        && entry.running === message.running
        && entry.error === message.error
    case 'custom':
      return message.kind === 'custom'
        && entry.view === message.view
        && entry.data === message.data
        && entry.running === message.running
        && entry.streaming === message.streaming
  }
}

function renderFor(message: Message, width: number): MessageRender {
  const memo = renderMemo.get(message)
  if (memo !== undefined && memo.epoch === layoutEpoch && memo.width === width && fingerprintMatches(memo.fingerprint, message)) {
    return memo.render
  }
  const body = renderBody(message, width)
  const render: MessageRender = { ...body, plan: planFor(message, body) }
  renderMemo.set(message, { epoch: layoutEpoch, width, fingerprint: fingerprintOf(message), render })
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
    backgroundWidth: messageBackgroundWidth(width),
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
        spinner: Boolean(
          (message.kind === 'collapsible' || message.kind === 'custom')
          && (message.running || message.streaming),
        ) || undefined,
      }
    case 'lit':
      return {
        ...base,
        kind: 'text',
        text: fitLabel(plan.text, width),
        colStart: plan.colStart,
        selectable: plan.selectable,
        background: plan.bg,
        muted: plan.muted,
        role: plan.role,
        ...(plan.wave === true ? { wave: true } : {}),
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
        ...(plan.wave === true ? { wave: true } : {}),
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
  return collapsed ? glyphs.headerCollapsed : glyphs.headerExpanded
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
      lines.push(expandFieldChars(line.slice(startIndex, endIndex)))
      continue
    }
    lines.push('')
  }
  return lines.join('\n').replace(/[ \t]+$/gm, '').replace(/\n+$/, '')
}
