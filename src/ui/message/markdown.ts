import { colors } from '../../theme.ts'
import { charWidth } from '../../utils/text.ts'
import { highlightCode } from './highlight.ts'

export interface MarkStyle {
  color?: string
  bold?: boolean
  italic?: boolean
}

export interface Segment {
  text: string
  style: MarkStyle
}

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

export function tokenizeMarkdown(content: string): Segment[] {
  const lines = content.split('\n')
  const styled: Segment[][] = []
  let inCode = false
  let codeLang = ''
  for (const line of lines) {
    if (inCode) {
      if (FENCE_RE.test(line)) {
        inCode = false
        continue
      }
      if (codeLang === '') {
        styled.push([{ text: line, style: mdStyles.codeNoLang }])
        continue
      }
      const highlighted = highlightCode(line, codeLang)
      styled.push(highlighted ?? [{ text: line, style: mdStyles.code }])
      continue
    }
    if (FENCE_RE.test(line)) {
      inCode = true
      codeLang = line.slice(3).trim()
      continue
    }
    styled.push(lineSegments(line))
  }
  const segments: Segment[] = []
  for (let i = 0; i < styled.length; i++) {
    segments.push(...styled[i]!)
    if (i < styled.length - 1) segments.push({ text: '\n', style: mdStyles.plain })
  }
  return segments
}

export function tokenizeThinking(content: string): Segment[] {
  const lines = content.split('\n')
  const styled: Segment[][] = []
  let inCode = false
  let codeLang = ''
  for (const line of lines) {
    if (inCode) {
      if (FENCE_RE.test(line)) {
        inCode = false
        styled.push([{ text: line, style: mdStyles.plain }])
        continue
      }
      if (codeLang === '') {
        styled.push([{ text: line, style: mdStyles.codeNoLangDark }])
        continue
      }
      const highlighted = highlightCode(line, codeLang, true)
      styled.push(highlighted ?? [{ text: line, style: mdStyles.codeDark }])
      continue
    }
    if (FENCE_RE.test(line)) {
      inCode = true
      codeLang = line.slice(3).trim()
      styled.push([{ text: line, style: mdStyles.plain }])
      continue
    }
    styled.push(tokenizeInline(line, true))
  }
  const segments: Segment[] = []
  for (let i = 0; i < styled.length; i++) {
    segments.push(...styled[i]!)
    if (i < styled.length - 1) segments.push({ text: '\n', style: mdStyles.plain })
  }
  return segments
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

export function wrapSegments(segments: Segment[], width: number): Segment[][] {
  if (width <= 0) return [[]]
  const rows: Segment[][] = []
  let current: Segment[] = []
  let currentWidth = 0
  for (const seg of segments) {
    for (const ch of seg.text) {
      if (ch === '\n') {
        rows.push(mergeRuns(current))
        current = []
        currentWidth = 0
        continue
      }
      const w = charWidth(ch)
      if (currentWidth + w > width) {
        rows.push(mergeRuns(current))
        current = []
        currentWidth = 0
      }
      current.push({ text: ch, style: seg.style })
      currentWidth += w
    }
  }
  rows.push(mergeRuns(current))
  return rows
}

function mergeRuns(segments: Segment[]): Segment[] {
  if (segments.length === 0) return segments
  const out: Segment[] = []
  for (const seg of segments) {
    const last = out[out.length - 1]
    if (last !== undefined && last.style.color === seg.style.color && last.style.bold === seg.style.bold) {
      last.text += seg.text
    } else {
      out.push({ text: seg.text, style: seg.style })
    }
  }
  return out
}

export function segmentsKey(segments: Segment[]): string {
  let key = ''
  for (const seg of segments) {
    key += `${seg.text.length}:${seg.text}\x1f${seg.style.color ?? ''}\x1e${seg.style.bold ? 'b' : ''}${seg.style.italic ? 'i' : ''}\x1d`
  }
  return key
}