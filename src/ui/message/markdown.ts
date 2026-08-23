import { colors } from '../../theme.ts'
import { highlightCode } from './highlight.ts'
import { mergeRuns, segmentsKey, wrapSegments } from '../../core/segments.ts'
import type { MarkStyle, Segment } from '../../core/segments.ts'
import { charWidth, segmentGraphemes, textWidth } from '../../core/text.ts'

export { segmentsKey, wrapSegments }
export type { MarkStyle, Segment }

export const mdStyles = {
  plain: {} as MarkStyle,
  get bold() { return { color: colors.mdBold, bold: true } },
  get inlineCode() { return { color: colors.mdInlineCode } },
  get list() { return { color: colors.mdList } },
  get h1() { return { color: colors.mdH1, bold: true } },
  get h2() { return { color: colors.mdH2 } },
  get h3() { return { color: colors.mdH3 } },
  get code() { return { color: colors.mdCode } },
  get codeNoLang() { return { color: colors.mdCodeNoLang } },
  get codeDark() { return { color: colors.codeOperatorDark } },
  get codeNoLangDark() { return { color: colors.codeNoLangDark } },
  get thinkInlineCode() { return { color: colors.thinkInlineCode } },
  get thinkQuote() { return { color: colors.thinkQuote } },
} as const

const FENCE_RE = /^```/
const HEADING_RE = /^(#{1,6})\s+/
const LIST_RE = /^(\s*)(-|\*|\+|\d+\.)\s/

interface FenceState {
  inCode: boolean
  codeLang: string
}

export interface LineTokenizer {
  tokenize(line: string): Segment[] | null
  snapshot(): FenceState
  restore(state: FenceState): void
}

function createFenceState(): FenceState {
  return { inCode: false, codeLang: '' }
}

export function createMarkdownTokenizer(): LineTokenizer {
  const state = createFenceState()
  return {
    tokenize(line) {
      if (state.inCode) {
        if (FENCE_RE.test(line)) {
          state.inCode = false
          return null
        }
        if (state.codeLang === '') {
          return [{ text: line, style: mdStyles.codeNoLang }]
        }
        return highlightCode(line, state.codeLang) ?? [{ text: line, style: mdStyles.code }]
      }
      if (FENCE_RE.test(line)) {
        state.inCode = true
        state.codeLang = line.slice(3).trim()
        return null
      }
      return lineSegments(line)
    },
    snapshot: () => ({ inCode: state.inCode, codeLang: state.codeLang }),
    restore: next => {
      state.inCode = next.inCode
      state.codeLang = next.codeLang
    },
  }
}

export function createThinkingTokenizer(): LineTokenizer {
  const state = createFenceState()
  return {
    tokenize(line) {
      if (state.inCode) {
        if (FENCE_RE.test(line)) {
          state.inCode = false
          return [{ text: line, style: mdStyles.plain }]
        }
        if (state.codeLang === '') {
          return [{ text: line, style: mdStyles.codeNoLangDark }]
        }
        return highlightCode(line, state.codeLang, true) ?? [{ text: line, style: mdStyles.codeDark }]
      }
      if (FENCE_RE.test(line)) {
        state.inCode = true
        state.codeLang = line.slice(3).trim()
        return [{ text: line, style: mdStyles.plain }]
      }
      return tokenizeInline(line, true)
    },
    snapshot: () => ({ inCode: state.inCode, codeLang: state.codeLang }),
    restore: next => {
      state.inCode = next.inCode
      state.codeLang = next.codeLang
    },
  }
}

function collectLines(tokenizer: LineTokenizer, content: string): (Segment[] | null)[] {
  return content.split('\n').map(line => tokenizer.tokenize(line))
}

function joinLineSegments(styled: (Segment[] | null)[]): Segment[] {
  const segments: Segment[] = []
  let pending = false
  for (const line of styled) {
    if (line === null) continue
    if (pending) segments.push({ text: '\n', style: mdStyles.plain })
    segments.push(...line)
    pending = true
  }
  return segments
}

export function tokenizeMarkdown(content: string): Segment[] {
  return joinLineSegments(collectLines(createMarkdownTokenizer(), content))
}

export function tokenizeThinking(content: string): Segment[] {
  return joinLineSegments(collectLines(createThinkingTokenizer(), content))
}

function tokenizeInline(line: string, keep: boolean): Segment[] {
  const segments: Segment[] = []
  let plain = ''
  const flush = () => {
    if (plain !== '') {
      segments.push({ text: plain, style: mdStyles.plain })
      plain = ''
    }
  }
  let i = 0
  while (i < line.length) {
    const ch = line[i]!
    if (ch === '`') {
      flush()
      const end = line.indexOf('`', i + 1)
      const rest = line.slice(i + 1, end < 0 ? undefined : end)
      if (keep) segments.push({ text: '`', style: mdStyles.plain })
      if (rest !== '') segments.push({ text: rest, style: keep ? mdStyles.thinkInlineCode : mdStyles.inlineCode })
      if (end >= 0) {
        if (keep) segments.push({ text: '`', style: mdStyles.plain })
        i = end + 1
      } else {
        i = line.length
      }
      continue
    }
    if (keep && ch === '"') {
      flush()
      const end = line.indexOf('"', i + 1)
      const rest = line.slice(i + 1, end < 0 ? undefined : end)
      segments.push({ text: '"', style: mdStyles.plain })
      if (rest !== '') segments.push({ text: rest, style: mdStyles.thinkQuote })
      if (end >= 0) {
        segments.push({ text: '"', style: mdStyles.plain })
        i = end + 1
      } else {
        i = line.length
      }
      continue
    }
    if (!keep && line.startsWith('**', i)) {
      flush()
      const end = line.indexOf('**', i + 2)
      const rest = line.slice(i + 2, end < 0 ? undefined : end)
      if (rest !== '') segments.push({ text: rest, style: mdStyles.bold })
      i = end < 0 ? line.length : end + 2
      continue
    }
    plain += ch
    i++
  }
  flush()
  return segments
}

function lineSegments(line: string): Segment[] {
  const heading = HEADING_RE.exec(line)
  if (heading !== null) {
    const level = heading[1]!.length
    const style: MarkStyle = level === 1 ? mdStyles.h1 : level === 2 ? mdStyles.h2 : mdStyles.h3
    const text = line.slice(heading[0].length)
    const inline = tokenizeInline(text, false)
    return inline.map(segment => ({
      text: segment.text,
      style: {
        color: style.color,
        bold: style.bold === true || segment.style.bold === true ? true : undefined,
        italic: segment.style.italic,
      },
    }))
  }
  const list = LIST_RE.exec(line)
  if (list !== null) {
    const marker = { text: list[0], style: mdStyles.list }
    const rest = line.slice(list[0].length)
    if (rest === '') return [marker]
    return [marker, ...tokenizeInline(rest, false)]
  }
  return tokenizeInline(line, false)
}

export interface WrappedLines {
  rows: Segment[][]
  lines: string[]
}

export interface SegmentWrapper {
  update(content: string): WrappedLines
}

export function createSegmentWrapper(tokenizer: LineTokenizer, width: number): SegmentWrapper {
  let consumed = ''
  let partial = ''
  const doneRows: Segment[][] = []
  const doneTexts: string[] = []
  let tailRows: Segment[][] = [[]]
  let tailTexts: string[] = ['']
  const appendLine = (line: string): void => {
    const segments = tokenizer.tokenize(line)
    if (segments === null) return
    const rows = layoutLineSegments(segments, width)
    for (const row of rows) {
      doneRows.push(row)
      doneTexts.push(row.map(segment => segment.text).join(''))
    }
  }
  const refreshTail = (): void => {
    const segments = tokenizer.tokenize(partial)
    tailRows = segments === null ? [] : layoutLineSegments(segments, width)
    tailTexts = tailRows.map(row => row.map(segment => segment.text).join(''))
  }
  refreshTail()
  return {
    update(content) {
      if (!content.startsWith(consumed)) {
        tokenizer.restore(createFenceState())
        doneRows.length = 0
        doneTexts.length = 0
        consumed = ''
        partial = ''
      }
      const incoming = content.slice(consumed.length)
      consumed = content
      const parts = (partial + incoming).split('\n')
      partial = parts.pop()!
      for (const line of parts) appendLine(line)
      const saved = tokenizer.snapshot()
      refreshTail()
      tokenizer.restore(saved)
      return { rows: doneRows.concat(tailRows), lines: doneTexts.concat(tailTexts) }
    },
  }
}

const LIST_MARKER_RE = /^[ \t]*(?:[-*+]|\d+\.)[ \t]/

export function layoutLineSegments(segments: Segment[], width: number): Segment[][] {
  const first = segments[0]?.text ?? ''
  if (!LIST_MARKER_RE.test(first)) return wrapSegments(segments, width)
  const hang = Math.min(textWidth(first), Math.max(0, width - 4))
  const rest = wrapSegments(segments.slice(1), Math.max(4, width - hang))
  return rest.map((row, index) => index === 0
    ? mergeRuns([segments[0]!, ...row])
    : [{ text: ' '.repeat(hang), style: mdStyles.plain }, ...row])
}

const TABLE_ROW_RE = /^[ \t]*\|/
const TABLE_SEP_CELL_RE = /^[ \t]*:?-+:?[ \t]*$/

function splitTableRow(line: string): string[] {
  let s = line.trim()
  if (s.startsWith('|')) s = s.slice(1)
  if (s.endsWith('|')) s = s.slice(0, -1)
  const cells: string[] = []
  let current = ''
  for (let i = 0; i < s.length; i++) {
    const ch = s[i]!
    if (ch === '\\' && s[i + 1] === '|') {
      current += '|'
      i++
      continue
    }
    if (ch === '|') {
      cells.push(current)
      current = ''
      continue
    }
    current += ch
  }
  cells.push(current)
  return cells
}

function isTableSeparator(line: string): boolean {
  if (!line.includes('|') || !line.includes('-')) return false
  const cells = splitTableRow(line)
  return cells.length > 0 && cells.every(cell => TABLE_SEP_CELL_RE.test(cell))
}

function isTableRowLine(line: string): boolean {
  return line.trim() !== '' && line.includes('|')
}

function isTableHeaderAt(raw: string[], i: number): boolean {
  if (i + 1 >= raw.length) return false
  const header = raw[i]!
  if (!header.includes('|') || !isTableSeparator(raw[i + 1]!)) return false
  const headerCells = splitTableRow(header)
  const sepCells = splitTableRow(raw[i + 1]!)
  if (sepCells.length !== headerCells.length) return false
  return headerCells.length >= 2 || header.trimStart().startsWith('|')
}

function plainTextOf(segments: Segment[]): string {
  return segments.map(segment => segment.text).join('')
}

function borderRow(widths: number[], left: string, mid: string, right: string): Segment[] {
  return [{ text: left + widths.map(w => '─'.repeat(w + 2)).join(mid) + right, style: mdStyles.plain }]
}

const TABLE_SAFETY_COLS = 2

function pushMarkdownTable(rows: Segment[][], block: string[], width: number): void {
  const cols = Math.max(1, splitTableRow(block[0]!).length)
  const tableRows = [splitTableRow(block[0]!), ...block.slice(2).map(splitTableRow)]
  const cellAt = (cells: string[], c: number): string => (cells[c] ?? '').trim()
  const widths: number[] = []
  const mins: number[] = []
  for (let c = 0; c < cols; c++) {
    let natural = 1
    let min = 1
    for (const cells of tableRows) {
      const text = cellAt(cells, c)
      natural = Math.max(natural, textWidth(text))
      for (const { segment } of segmentGraphemes(text)) min = Math.max(min, charWidth(segment))
    }
    widths.push(natural)
    mins.push(min)
  }
  const budget = Math.max(cols, width - (cols * 3 + 1) - TABLE_SAFETY_COLS)
  const sum = (): number => widths.reduce((a, b) => a + b, 0)
  while (sum() > budget) {
    let maxIdx = -1
    for (let c = 0; c < cols; c++) {
      if (widths[c]! <= mins[c]!) continue
      if (maxIdx === -1 || widths[c]! > widths[maxIdx]!) maxIdx = c
    }
    if (maxIdx === -1) break
    widths[maxIdx] -= 1
  }
  const blocksByRow = tableRows.map(cells => {
    const blocks: Segment[][][] = []
    for (let c = 0; c < cols; c++) {
      const segs = tokenizeInline(cellAt(cells, c), false)
      blocks.push(segs.length === 0 ? [[]] : wrapSegments(segs, widths[c]!))
    }
    return blocks
  })
  const effective = widths.slice()
  for (const blocks of blocksByRow) {
    for (let c = 0; c < cols; c++) {
      for (const rowSegs of blocks[c]!) {
        effective[c] = Math.max(effective[c]!, textWidth(plainTextOf(rowSegs)))
      }
    }
  }
  const renderRowBlock = (blocks: Segment[][][]): Segment[][] => {
    let height = 1
    for (let c = 0; c < cols; c++) height = Math.max(height, blocks[c]!.length)
    const out: Segment[][] = []
    for (let h = 0; h < height; h++) {
      const line: Segment[] = [{ text: '│', style: mdStyles.plain }]
      for (let c = 0; c < cols; c++) {
        const rowSegs = blocks[c]![h] ?? []
        const used = textWidth(plainTextOf(rowSegs))
        line.push({ text: ' ', style: mdStyles.plain })
        line.push(...rowSegs)
        line.push({ text: ' '.repeat(Math.max(0, effective[c]! - used + 1)), style: mdStyles.plain }, { text: '│', style: mdStyles.plain })
      }
      out.push(mergeRuns(line))
    }
    return out
  }
  rows.push(borderRow(effective, '┌', '┬', '┐'))
  rows.push(...renderRowBlock(blocksByRow[0]!))
  rows.push(borderRow(effective, '├', '┼', '┤'))
  for (const blocks of blocksByRow.slice(1)) rows.push(...renderRowBlock(blocks))
  rows.push(borderRow(effective, '└', '┴', '┘'))
}

export function hasMarkdownTable(content: string): boolean {
  const lines = content.split('\n')
  for (let i = 0; i + 1 < lines.length; i++) {
    if (isTableHeaderAt(lines, i)) return true
  }
  return false
}

export interface BuiltMarkdown {
  rows: Segment[][]
  lines: string[]
}

export function buildMarkdownRows(content: string, width: number): BuiltMarkdown {
  const tokenizer = createMarkdownTokenizer()
  const raw = content.split('\n')
  const rows: Segment[][] = []
  for (let i = 0; i < raw.length; i++) {
    const line = raw[i]!
    if (!tokenizer.snapshot().inCode && isTableHeaderAt(raw, i)) {
      let end = i
      while (end < raw.length && isTableRowLine(raw[end]!)) end++
      pushMarkdownTable(rows, raw.slice(i, end), width)
      i = end - 1
      continue
    }
    const segments = tokenizer.tokenize(line)
    if (segments !== null) rows.push(...layoutLineSegments(segments, width))
  }
  const lines = rows.map(row => plainTextOf(row))
  return { rows, lines }
}
