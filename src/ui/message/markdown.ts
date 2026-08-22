import { colors } from '../../theme.ts'
import { highlightCode } from './highlight.ts'
import { segmentsKey, wrapSegments } from '../../core/segments.ts'
import type { MarkStyle, Segment } from '../../core/segments.ts'

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
    const rows = wrapSegments(segments, width)
    for (const row of rows) {
      doneRows.push(row)
      doneTexts.push(row.map(segment => segment.text).join(''))
    }
  }
  const refreshTail = (): void => {
    const segments = tokenizer.tokenize(partial)
    tailRows = segments === null ? [] : wrapSegments(segments, width)
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
