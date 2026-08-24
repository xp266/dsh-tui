import { colors } from '../../theme.ts'
import { highlightCodeBlock } from './highlight.ts'
import { mergeRuns, segmentsKey, wrapSegments } from '../../core/segments.ts'
import type { MarkStyle, Segment } from '../../core/segments.ts'
import { charWidth, segmentGraphemes, textWidth } from '../../core/text.ts'

export { segmentsKey, wrapSegments }
export type { MarkStyle, Segment }

export const mdStyles = {
  plain: {} as MarkStyle,
  get bold() { return { color: colors.mdBold, bold: true } },
  get italic() { return { italic: true } },
  get strike() { return { strike: true } },
  get link() { return { color: colors.mdLink, underline: true } },
  get quote() { return { color: colors.mdQuote, italic: true } },
  get hr() { return { color: colors.mdHr } },
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

export interface FenceInfo {
  char: string
  len: number
  info: string
  raw: string
}

const FENCE_OPEN_RE = /^ {0,3}(`{3,}|~{3,})[ \t]*(.*)$/
const FENCE_CLOSE_RE = /^ {0,3}(`{3,}|~{3,})[ \t]*$/

export function parseFenceOpen(line: string): FenceInfo | null {
  const match = FENCE_OPEN_RE.exec(line)
  if (match === null) return null
  const marker = match[1]!
  if (marker[0] === '`' && match[2]!.includes('`')) return null
  return { char: marker[0]!, len: marker.length, info: match[2]!.trim(), raw: line }
}

export function isFenceClose(line: string, fence: FenceInfo): boolean {
  const match = FENCE_CLOSE_RE.exec(line)
  if (match === null) return false
  const marker = match[1]!
  return marker[0] === fence.char && marker.length >= fence.len
}

export function fenceLanguage(info: string): string {
  return info.split(/\s+/)[0]?.toLowerCase() ?? ''
}

export type ContentPiece =
  | { kind: 'text'; lines: string[] }
  | { kind: 'code'; fence: FenceInfo; lines: string[]; closed: boolean }

export function splitContentPieces(content: string): ContentPiece[] {
  const pieces: ContentPiece[] = []
  let text: string[] = []
  let code: string[] = []
  let open: FenceInfo | null = null
  const flushText = (): void => {
    if (text.length > 0) pieces.push({ kind: 'text', lines: text })
    text = []
  }
  for (const raw of content.split('\n')) {
    const line = raw.endsWith('\r') ? raw.slice(0, -1) : raw
    if (open !== null) {
      if (isFenceClose(line, open)) {
        pieces.push({ kind: 'code', fence: open, lines: code, closed: true })
        open = null
        code = []
      } else {
        code.push(line)
      }
      continue
    }
    const fence = parseFenceOpen(line)
    if (fence !== null) {
      flushText()
      open = fence
    } else {
      text.push(line)
    }
  }
  if (open !== null) {
    pieces.push({ kind: 'code', fence: open, lines: code, closed: false })
  } else {
    flushText()
  }
  return pieces
}

interface CodePieceState {
  inCode: boolean
  fence: FenceInfo | null
}

function createFenceState(): CodePieceState {
  return { inCode: false, fence: null }
}

export interface FenceState {
  inCode: boolean
  codeLang: string
}

export interface LineTokenizer {
  tokenize(line: string): Segment[] | null
  snapshot(): FenceState
  restore(state: FenceState): void
  readonly mode?: 'md' | 'thinking'
}

function legacyState(state: CodePieceState): FenceState {
  return { inCode: state.inCode, codeLang: state.fence === null ? '' : state.fence.info.trim() }
}

function makeLineTokenizer(mode: 'md' | 'thinking'): LineTokenizer {
  const state = createFenceState()
  const dark = mode === 'thinking'
  return {
    mode,
    tokenize(line) {
      if (state.inCode && state.fence !== null) {
        if (isFenceClose(line, state.fence)) {
          state.inCode = false
          state.fence = null
          return dark ? [{ text: line, style: mdStyles.plain }] : null
        }
        const lang = fenceLanguage(state.fence.info)
        if (lang === '') {
          return [{ text: line, style: dark ? mdStyles.codeNoLangDark : mdStyles.codeNoLang }]
        }
        return highlightCodeBlock(line, lang, dark) ?? [{ text: line, style: dark ? mdStyles.codeDark : mdStyles.code }]
      }
      const fence = parseFenceOpen(line)
      if (fence !== null) {
        state.inCode = true
        state.fence = fence
        return dark ? [{ text: line, style: mdStyles.plain }] : null
      }
      return mode === 'thinking' ? tokenizeInline(line, true) : lineSegments(line)
    },
    snapshot: () => legacyState(state),
    restore: next => {
      state.inCode = next.inCode
      state.fence = next.codeLang === ''
      ? null
      : { char: '`', len: 3, info: next.codeLang, raw: `\`\`\`${next.codeLang}` }
    },
  }
}

export function createMarkdownTokenizer(): LineTokenizer {
  return makeLineTokenizer('md')
}

export function createThinkingTokenizer(): LineTokenizer {
  return makeLineTokenizer('thinking')
}

function joinLogicalLines(lines: Segment[][]): Segment[] {
  const out: Segment[] = []
  let pending = false
  for (const line of lines) {
    if (pending) out.push({ text: '\n', style: mdStyles.plain })
    out.push(...line)
    pending = true
  }
  return out
}

function flattenPieces(content: string, thinking: boolean): Segment[] {
  const tokenizer = thinking ? createThinkingTokenizer() : createMarkdownTokenizer()
  const logical: Segment[][] = []
  for (const piece of splitContentPieces(content)) {
    if (piece.kind === 'text') {
      for (const line of piece.lines) {
        const segments = tokenizer.tokenize(line)
        if (segments !== null) logical.push(segments)
      }
      continue
    }
    if (thinking) logical.push([{ text: fenceMarkerText(piece.fence), style: mdStyles.plain }])
    const lang = fenceLanguage(piece.fence.info)
    const fallbackStyle = lang === ''
      ? (thinking ? mdStyles.codeNoLangDark : mdStyles.codeNoLang)
      : (thinking ? mdStyles.codeDark : mdStyles.code)
    const body = piece.lines.join('\n')
    if (body !== '') {
      const segments = highlightCodeBlock(body, lang, thinking) ?? [{ text: body, style: fallbackStyle }]
      logical.push(segments)
    }
    if (thinking && piece.closed) logical.push([{ text: piece.fence.char.repeat(piece.fence.len), style: mdStyles.plain }])
  }
  return joinLogicalLines(logical)
}

function fenceMarkerText(fence: FenceInfo): string {
  return fence.raw
}

export function tokenizeMarkdown(content: string): Segment[] {
  return flattenPieces(content, false)
}

export function tokenizeThinking(content: string): Segment[] {
  return flattenPieces(content, true)
}

function isAsciiPunct(ch: string): boolean {
  const code = ch.charCodeAt(0)
  return (code >= 33 && code <= 47) || (code >= 58 && code <= 64) || (code >= 91 && code <= 96) || (code >= 123 && code <= 126)
}

function findBacktickRun(line: string, from: number, n: number): number {
  let i = from
  while (i < line.length) {
    if (line[i] === '`') {
      let run = 1
      while (line[i + run] === '`') run++
      if (run === n) return i
      i += run
      continue
    }
    i++
  }
  return -1
}

function normalizeCodeSpan(content: string): string {
  if (content.length >= 2 && content.startsWith(' ') && content.endsWith(' ') && content.trim() !== '') {
    return content.slice(1, -1)
  }
  return content
}

function isSpaceChar(ch: string | undefined): boolean {
  return ch === undefined || ch === ' ' || ch === '\t'
}

function isWordChar(ch: string | undefined): boolean {
  return ch !== undefined && /[A-Za-z0-9_]/.test(ch)
}

function findSingleClose(line: string, ch: string, from: number): number {
  let idx = line.indexOf(ch, from)
  while (idx !== -1) {
    if (!isSpaceChar(line[idx - 1])) return idx
    idx = line.indexOf(ch, idx + 1)
  }
  return -1
}

function mapInline(content: string, keep: boolean, base: MarkStyle): Segment[] {
  const inner = tokenizeInline(content, keep)
  const out: Segment[] = []
  for (const segment of inner) {
    out.push({
      text: segment.text,
      style: {
        color: base.color ?? segment.style.color,
        bold: base.bold === true || segment.style.bold === true ? true : undefined,
        italic: base.italic === true || segment.style.italic === true ? true : undefined,
        strike: base.strike === true || segment.style.strike === true ? true : undefined,
        underline: base.underline === true || segment.style.underline === true ? true : undefined,
      },
    })
  }
  return out
}

function appendMapped(out: Segment[], flush: () => void, segments: Segment[]): void {
  flush()
  out.push(...segments)
}

export function tokenizeInline(line: string, keep: boolean): Segment[] {
  const out: Segment[] = []
  let plain = ''
  const flush = (): void => {
    if (plain !== '') {
      out.push({ text: plain, style: mdStyles.plain })
      plain = ''
    }
  }
  const emit = (text: string, style: MarkStyle): void => {
    flush()
    out.push({ text, style })
  }
  let i = 0
  while (i < line.length) {
    const ch = line[i]!
    if (ch === '\\' && i + 1 < line.length && isAsciiPunct(line[i + 1]!)) {
      plain += line[i + 1]
      i += 2
      continue
    }
    if (ch === '`') {
      let run = 1
      while (line[i + run] === '`') run++
      const close = findBacktickRun(line, i + run, run)
      if (close === -1) {
        const content = normalizeCodeSpan(line.slice(i + run))
        if (keep) {
          emit('`'.repeat(run), mdStyles.plain)
          if (content !== '') emit(content, mdStyles.thinkInlineCode)
        } else if (content !== '') {
          emit(content, mdStyles.inlineCode)
        }
        i = line.length
        continue
      }
      const content = normalizeCodeSpan(line.slice(i + run, close))
      if (keep) {
        emit('`'.repeat(run), mdStyles.plain)
        if (content !== '') emit(content, mdStyles.thinkInlineCode)
        emit('`'.repeat(run), mdStyles.plain)
      } else if (content !== '') {
        emit(content, mdStyles.inlineCode)
      }
      i = close + run
      continue
    }
    if (keep && ch === '"') {
      const end = line.indexOf('"', i + 1)
      const finalEnd = end === -1 ? line.length : end
      if (line.slice(i + 1, finalEnd).trim() !== '') {
        emit('"', mdStyles.plain)
        emit(line.slice(i + 1, finalEnd), mdStyles.thinkQuote)
        if (end !== -1) emit('"', mdStyles.plain)
        i = finalEnd + 1
        continue
      }
    }
    if (line.startsWith('~~', i)) {
      const end = line.indexOf('~~', i + 2)
      if (end === -1) {
        appendMapped(out, flush, mapInline(line.slice(i + 2), keep, mdStyles.strike))
        i = line.length
        continue
      }
      if (end > i + 2) {
        appendMapped(out, flush, mapInline(line.slice(i + 2, end), keep, mdStyles.strike))
        i = end + 2
        continue
      }
    }
    if (line.startsWith('***', i) || line.startsWith('___', i)) {
      const delimiter = line.slice(i, i + 3)
      const end = line.indexOf(delimiter, i + 3)
      if (end === -1) {
        appendMapped(out, flush, mapInline(line.slice(i + 3), keep, { color: colors.mdBold, bold: true, italic: true }))
        i = line.length
        continue
      }
      if (end > i + 3) {
        appendMapped(out, flush, mapInline(line.slice(i + 3, end), keep, { color: colors.mdBold, bold: true, italic: true }))
        i = end + 3
        continue
      }
    }
    if (line.startsWith('**', i) || line.startsWith('__', i)) {
      const delimiter = line.slice(i, i + 2)
      const end = line.indexOf(delimiter, i + 2)
      if (end === -1) {
        appendMapped(out, flush, mapInline(line.slice(i + 2), keep, mdStyles.bold))
        i = line.length
        continue
      }
      if (end > i + 2) {
        appendMapped(out, flush, mapInline(line.slice(i + 2, end), keep, mdStyles.bold))
        i = end + 2
        continue
      }
    }
    if ((ch === '*' || ch === '_') && !isSpaceChar(line[i + 1]) && line[i + 1] !== ch) {
      const openerOk = ch === '*' ? true : !isWordChar(line[i - 1])
      if (openerOk) {
        const end = findSingleClose(line, ch, i + 1)
        const closerOk = end !== -1 && (ch === '*' ? true : !isWordChar(line[end + 1]))
        if (closerOk) {
          appendMapped(out, flush, mapInline(line.slice(i + 1, end), keep, mdStyles.italic))
          i = end + 1
          continue
        }
      }
    }
    if (ch === '!' && line[i + 1] === '[') {
      const parsed = parseLink(line, i + 1)
      if (parsed !== null) {
        emit(parsed.text, mdStyles.plain)
        i = parsed.end
        continue
      }
    }
    if (ch === '[') {
      const parsed = parseLink(line, i)
      if (parsed !== null) {
        emit(parsed.text, mdStyles.link)
        i = parsed.end
        continue
      }
    }
    if (ch === '<') {
      const end = line.indexOf('>', i + 1)
      if (end !== -1) {
        const url = line.slice(i + 1, end)
        if (/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(url) && !url.includes(' ')) {
          emit(url, mdStyles.link)
          i = end + 1
          continue
        }
      }
    }
    plain += ch
    i++
  }
  flush()
  return out
}

function parseLink(line: string, start: number): { text: string; end: number } | null {
  const closeBracket = line.indexOf(']', start + 1)
  if (closeBracket === -1 || closeBracket === start + 1) return null
  if (line[closeBracket + 1] !== '(') return null
  const closeParen = line.indexOf(')', closeBracket + 2)
  if (closeParen === -1) return null
  const url = line.slice(closeBracket + 2, closeParen)
  if (url.includes(' ') || url.includes('[')) return null
  return { text: line.slice(start + 1, closeBracket), end: closeParen + 1 }
}

const HEADING_RE = /^(#{1,6})[ \t]+(.*)$|^#{1,6}$/
const LIST_RE = /^(\s*)(-|\*|\+|\d+\.)[ \t]+/
const HR_RE = /^ {0,3}(?:(?:-[ \t]*){3,}|(?:\*[ \t]*){3,}|(?:_[ \t]*){3,})$/
const QUOTE_RE = /^ {0,3}>/

function lineSegments(line: string): Segment[] {
  if (HR_RE.test(line)) return [{ text: line.trim(), style: mdStyles.hr }]
  if (QUOTE_RE.test(line)) return [{ text: line, style: mdStyles.quote }]
  const heading = HEADING_RE.exec(line)
  if (heading !== null) {
    const level = heading[1]!.length
    const style: MarkStyle = level === 1 ? mdStyles.h1 : level === 2 ? mdStyles.h2 : mdStyles.h3
    const text = stripClosingHashes(heading[2] ?? '')
    const inline = tokenizeInline(text, false)
    return inline.map(segment => ({
      text: segment.text,
      style: {
        color: style.color,
        bold: style.bold === true || segment.style.bold === true ? true : undefined,
        italic: segment.style.italic,
        strike: segment.style.strike,
        underline: segment.style.underline,
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

function stripClosingHashes(text: string): string {
  const stripped = text.replace(/[ \t]+#+[ \t]*$/, '')
  return stripped
}

export interface WrappedLines {
  rows: Segment[][]
  lines: string[]
}

export interface SegmentWrapper {
  update(content: string): WrappedLines
}

interface RenderedPiece {
  rows: Segment[][]
  texts: string[]
}

function plainTextOf(segments: Segment[]): string {
  return segments.map(segment => segment.text).join('')
}

function renderTextLine(tokenizer: LineTokenizer, line: string, width: number): RenderedPiece {
  const segments = tokenizer.tokenize(line)
  if (segments === null) return { rows: [], texts: [] }
  const rows = layoutLineSegments(segments, width)
  return { rows, texts: rows.map(plainTextOf) }
}

function renderCodePiece(codeLines: string[], fence: FenceInfo, closed: boolean, thinking: boolean, width: number, pendingOpen = false): RenderedPiece {
  const body = codeLines.join('\n')
  const hasLines = codeLines.length > 0
  const lang = fenceLanguage(fence.info)
  const fallbackStyle = lang === ''
    ? (thinking ? mdStyles.codeNoLangDark : mdStyles.codeNoLang)
    : (thinking ? mdStyles.codeDark : mdStyles.code)
  const highlighted = hasLines ? highlightCodeBlock(body, lang, thinking) : []
  const segments = highlighted ?? [{ text: body, style: fallbackStyle }]
  if (!thinking) {
    if (!hasLines && (closed || pendingOpen)) return { rows: [], texts: [] }
    const rows = wrapSegments(segments, width)
    return { rows, texts: rows.map(plainTextOf) }
  }
  const openRows = wrapSegments([{ text: fenceMarkerText(fence), style: mdStyles.plain }], width)
  const closeRows = closed
    ? wrapSegments([{ text: fence.char.repeat(fence.len), style: mdStyles.plain }], width)
    : []
  const innerRows = hasLines ? wrapSegments(segments, width) : []
  return {
    rows: [...openRows, ...innerRows, ...closeRows],
    texts: [...openRows.map(r => plainTextOf(r)), ...innerRows.map(r => plainTextOf(r)), ...closeRows.map(r => plainTextOf(r))],
  }
}

export function createSegmentWrapper(tokenizer: LineTokenizer, width: number): SegmentWrapper {
  const thinking = tokenizer.mode === 'thinking'
  let consumed: string | null = null
  const lineCache = new Map<string, RenderedPiece>()
  const codeCache = new Map<string, RenderedPiece>()

  const cachedTextLine = (tokenizer: LineTokenizer, line: string): RenderedPiece => {
    const key = `${width}\u0000${line}`
    const hit = lineCache.get(key)
    if (hit !== undefined) return hit
    const rendered = renderTextLine(tokenizer, line, width)
    if (lineCache.size >= 4096) lineCache.clear()
    lineCache.set(key, rendered)
    return rendered
  }

  const cachedCode = (piece: ContentPiece & { kind: 'code' }, pendingOpen: boolean): RenderedPiece => {
    const key = `${width}\u0000${piece.closed ? 'c' : 'o'}\u0000${pendingOpen ? 'p' : '-'}\u0000${piece.fence.info}\u0000${piece.lines.length}\u0000${piece.lines.join('\n')}`
    const hit = codeCache.get(key)
    if (hit !== undefined) return hit
    const rendered = renderCodePiece(piece.lines, piece.fence, piece.closed, thinking, width, pendingOpen)
    if (codeCache.size >= 512) codeCache.clear()
    codeCache.set(key, rendered)
    return rendered
  }

  return {
    update(content) {
      if (consumed === null || !content.startsWith(consumed)) {
        lineCache.clear()
        codeCache.clear()
      }
      consumed = content
      const endsWithNewline = content.endsWith('\n')
      const rows: Segment[][] = []
      const texts: string[] = []
      const pieces = splitContentPieces(content)
      for (let index = 0; index < pieces.length; index++) {
        const piece = pieces[index]!
        let rendered: RenderedPiece
        if (piece.kind === 'text') {
          rendered = { rows: [], texts: [] }
          for (const line of piece.lines) {
            const lineRendered = cachedTextLine(tokenizer, line)
            for (const row of lineRendered.rows) rendered.rows.push(row)
            for (const text of lineRendered.texts) rendered.texts.push(text)
          }
        } else {
          const isLast = index === pieces.length - 1
          const pendingOpen = isLast && !piece.closed && !endsWithNewline
          rendered = cachedCode(piece, pendingOpen)
        }
        for (const row of rendered.rows) rows.push(row)
        for (const text of rendered.texts) texts.push(text)
      }
      return { rows, lines: texts }
    },
  }
}

const LIST_MARKER_RE = /^[ \t]*(?:[-*+]|\d+\.)[ \t]/

export function layoutLineSegments(segments: Segment[], width: number, inCode = false): Segment[][] {
  if (inCode) return wrapSegments(segments, width)
  const first = segments[0]?.text ?? ''
  const marker = LIST_MARKER_RE.exec(first)?.[0]
  if (marker === undefined) return wrapSegments(segments, width)
  const head = segments[0]!
  const hang = Math.min(textWidth(marker), Math.max(0, width - 4))
  const tail: Segment[] = first.length > marker.length
    ? [{ text: first.slice(marker.length), style: head.style }, ...segments.slice(1)]
    : segments.slice(1)
  const rest = wrapSegments(tail, Math.max(4, width - hang))
  return rest.map((row, index) => index === 0
    ? mergeRuns([{ text: marker, style: head.style }, ...row])
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

function isTableHeaderAt(lines: string[], i: number): boolean {
  if (i + 1 >= lines.length) return false
  const header = lines[i]!
  if (!header.includes('|') || !isTableSeparator(lines[i + 1]!)) return false
  const headerCells = splitTableRow(header)
  const sepCells = splitTableRow(lines[i + 1]!)
  if (sepCells.length !== headerCells.length) return false
  return headerCells.length >= 2 || header.trimStart().startsWith('|')
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
  for (const piece of splitContentPieces(content)) {
    if (piece.kind !== 'text') continue
    for (let i = 0; i + 1 < piece.lines.length; i++) {
      if (isTableHeaderAt(piece.lines, i)) return true
    }
  }
  return false
}

export interface BuiltMarkdown {
  rows: Segment[][]
  lines: string[]
}

export function buildMarkdownRows(content: string, width: number): BuiltMarkdown {
  const rows: Segment[][] = []
  const texts: string[] = []
  const pushRows = (rendered: RenderedPiece): void => {
    for (const row of rendered.rows) rows.push(row)
    for (const text of rendered.texts) texts.push(text)
  }
  for (const piece of splitContentPieces(content)) {
    if (piece.kind === 'code') {
      pushRows(renderCodePiece(piece.lines, piece.fence, piece.closed, false, width))
      continue
    }
    const tokenizer = createMarkdownTokenizer()
    const lines = piece.lines
    let i = 0
    while (i < lines.length) {
      if (isTableHeaderAt(lines, i)) {
        let end = i
        while (end < lines.length && isTableRowLine(lines[end]!)) end++
        const before = rows.length
        pushMarkdownTable(rows, lines.slice(i, end), width)
        for (const row of rows.slice(before)) texts.push(plainTextOf(row))
        i = end
        continue
      }
      pushRows(renderTextLine(tokenizer, lines[i]!, width))
      i++
    }
  }
  return { rows, lines: texts }
}
