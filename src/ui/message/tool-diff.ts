import { wrapSegments } from '../../core/segments.ts'
import type { Segment } from '../../core/segments.ts'
import { COLORS } from '../../theme.ts'
import { highlightCodeBlock, LANGUAGE_ALIASES } from './md/highlight.ts'
import type { DiffLine } from '../../model/message.ts'

const FILENAME_LANGUAGES: Record<string, string> = {
  makefile: 'makefile',
  dockerfile: 'docker',
  'cmakelists.txt': 'cmake',
}

export function languageFromPath(path: string): string {
  const name = path.replace(/\\/g, '/').split('/').pop() ?? ''
  const filename = FILENAME_LANGUAGES[name.toLowerCase()]
  if (filename !== undefined) return filename
  const dot = name.lastIndexOf('.')
  if (dot < 0) return ''
  return LANGUAGE_ALIASES[name.slice(dot + 1).toLowerCase()] ?? ''
}

const SNIFF_RULES: readonly (readonly [RegExp, string])[] = [
  [/^#!.*\b(ba|z|k)?sh\b/, 'bash'],
  [/^\s*<\?php/, 'php'],
  [/^\s*<!DOCTYPE\s+html/i, 'markup'],
  [/^\s*[{\[][\s\S]*"[^"]+"\s*:/, 'json'],
  [/\b(?:def\s+\w+\s*\(|elif\s|from\s+\w+\s+import\b|__name__\s*==)/, 'python'],
  [/\b(?:package\s+\w+[;\s]|func\s+\w*\(|import\s+"|\bnil\b)/, 'go'],
  [/\bfn\s+\w+\s*\(|\blet\s+mut\b|\bimpl\s+\w+\s+for\b/, 'rust'],
  [/\b(?:interface\s+\w+\s*[<{]|type\s+\w+\s*=\s*[^=]|:\s*(?:string|number|boolean)\b|export\s+(?:default|const|function|class|interface)\b|import\s+[\w{*}\s,]+\s+from\s+)/, 'typescript'],
  [/\b(?:require\(|module\.exports|console\.log\(|function\s+\w+\s*\()/, 'javascript'],
  [/=>|\bconst\s+\w+\s*=|\blet\s+\w+\s*=/, 'javascript'],
  [/^\s*(?:SELECT\b|INSERT\s+INTO\b|CREATE\s+TABLE\b)/im, 'sql'],
]

export function sniffLanguage(content: string): string {
  const sample = content.length > 4000 ? content.slice(0, 4000) : content
  for (const [pattern, lang] of SNIFF_RULES) {
    if (pattern.test(sample)) return lang
  }
  return ''
}

export interface ToolDiffBody {
  lines: string[]
  rows: Segment[][]
  bgs: (string | undefined)[]
}

const PLAIN_STYLE = { color: COLORS.mdCodePlain }

function splitHighlightedLines(source: string, lang: string, streamId: string): Segment[][] {
  if (source === '') return []
  const highlighted = highlightCodeBlock(source, lang, false, streamId)
  const segments = highlighted ?? [{ text: source, style: PLAIN_STYLE }]
  const out: Segment[][] = [[]]
  for (const segment of segments) {
    const parts = segment.text.split('\n')
    for (let p = 0; p < parts.length; p++) {
      if (p > 0) out.push([])
      const part = parts[p]!
      if (part !== '') out[out.length - 1]!.push({ text: part, style: segment.style })
    }
  }
  return out
}

export interface ToolDiffLike {
  tool?: string
  path: string
  hunks: readonly (readonly DiffLine[])[]
  error?: string
  /**
   * Paint whole-line red/green backgrounds behind removed and added lines.
   * Defaults to true when the diff contains any removal: a pure-addition card
   * (a fresh file write) would otherwise read as one noisy column of green.
   * Contributions set this explicitly to override the heuristic either way.
   */
  backgrounds?: boolean
}

function hasRemovals(hunks: readonly (readonly DiffLine[])[]): boolean {
  return hunks.some(hunk => hunk.some(line => line.kind === 'del'))
}

export function renderToolDiffBody(message: ToolDiffLike, width: number): ToolDiffBody {
  const budget = Math.max(4, width)
  const bodyWidth = Math.max(2, budget - 2)
  const lines: string[] = []
  const rows: Segment[][] = []
  const bgs: (string | undefined)[] = []
  const sourceText = message.hunks.map(hunk => hunk.map(line => line.text).join('\n')).join('\n')
  const fromPath = message.path === '' ? '' : languageFromPath(message.path)
  const lang = fromPath !== '' ? fromPath : sniffLanguage(sourceText)
  const withBackgrounds = message.backgrounds ?? hasRemovals(message.hunks)
  for (const [hunkIndex, hunk] of message.hunks.entries()) {
    const perLine = splitHighlightedLines(
      hunk.map(line => line.text).join('\n'),
      lang,
      `${message.tool ?? ''}\u0000${message.path}\u0000${hunkIndex}`,
    )
    for (let index = 0; index < hunk.length; index++) {
      const line = hunk[index]!
      let bg: string | undefined
      let prefix: Segment[]
      if (line.kind === 'add') {
        bg = withBackgrounds ? COLORS.diffAddedBackground : undefined
        prefix = [{ text: '+', style: { color: COLORS.diffAdded } }, { text: ' ', style: {} }]
      } else if (line.kind === 'del') {
        bg = withBackgrounds ? COLORS.diffRemovedBackground : undefined
        prefix = [{ text: '-', style: { color: COLORS.diffRemoved } }, { text: ' ', style: {} }]
      } else {
        prefix = [{ text: '  ', style: {} }]
      }
      const wrapped = wrapSegments(perLine[index] ?? [], bodyWidth)
      for (let r = 0; r < wrapped.length; r++) {
        const codeRow = wrapped[r] ?? []
        const row = r === 0 ? [...prefix, ...codeRow] : [{ text: '  ', style: {} }, ...codeRow]
        rows.push(row)
        lines.push(row.map(segment => segment.text).join(''))
        bgs.push(bg)
      }
    }
  }
  if (message.error !== undefined && message.error !== '') {
    rows.push([])
    lines.push('')
    bgs.push(undefined)
    const wrapped = wrapSegments([{ text: message.error, style: { color: COLORS.errorText } }], bodyWidth)
    for (const segs of wrapped) {
      rows.push(segs)
      lines.push(segs.map(segment => segment.text).join(''))
      bgs.push(undefined)
    }
  }
  return { lines, rows, bgs }
}

export interface ToolReadLike {
  path?: string
  lines: readonly { number: number; text: string }[]
  offset?: number
  totalLines?: number
  lang?: string
}

/**
 * The read card body: a line-number gutter beside syntax-highlighted code,
 * closed by a "lines N-M of total" footer when the window stops short of the
 * end of the file. The gutter is part of the row segments, so the code column
 * stays aligned across wraps.
 */
export function renderToolReadBody(view: ToolReadLike, width: number): ToolDiffBody {
  const budget = Math.max(4, width)
  const lines: string[] = []
  const rows: Segment[][] = []
  const bgs: (string | undefined)[] = []
  const gutterWidth = view.lines.reduce((max, line) => Math.max(max, String(line.number).length), 1)
  const codeWidth = Math.max(2, budget - gutterWidth - 1)
  const source = view.lines.map(line => line.text).join('\n')
  const fromPath = view.path === undefined || view.path === '' ? '' : languageFromPath(view.path)
  const lang = view.lang !== undefined && view.lang !== ''
    ? view.lang
    : fromPath !== '' ? fromPath : sniffLanguage(source)
  const perLine = splitHighlightedLines(source, lang, `read\u0000${view.path ?? ''}`)
  for (const [index, line] of view.lines.entries()) {
    const gutter = String(line.number).padStart(gutterWidth)
    const prefix: Segment[] = [{ text: gutter, style: { color: COLORS.toolBodyText } }, { text: ' ', style: {} }]
    const wrapped = wrapSegments(perLine[index] ?? [], codeWidth)
    for (let r = 0; r < wrapped.length; r++) {
      const row = r === 0 ? [...prefix, ...(wrapped[r] ?? [])] : [{ text: `${' '.repeat(gutterWidth)} `, style: {} }, ...(wrapped[r] ?? [])]
      rows.push(row)
      lines.push(row.map(segment => segment.text).join(''))
      bgs.push(undefined)
    }
  }
  const first = view.lines[0]?.number ?? view.offset ?? 1
  const last = view.lines.length === 0 ? first - 1 : view.lines[view.lines.length - 1]!.number
  if (view.totalLines !== undefined && view.totalLines > last) {
    const text = view.lines.length === 0
      ? `... empty window at line ${first} of ${view.totalLines}`
      : `... lines ${first}-${last} of ${view.totalLines}`
    rows.push([{ text, style: { color: COLORS.toolBodyText } }])
    lines.push(text)
    bgs.push(undefined)
  }
  return { lines, rows, bgs }
}
