import { wrapSegments } from '../../core/segments.ts'
import type { Segment } from '../../core/segments.ts'
import { colors } from '../../theme.ts'
import type { ToolDiffMessage } from '../../model/message.ts'
import { highlightCodeBlock } from './md/highlight.ts'

const EXTENSION_LANGUAGES: Record<string, string> = {
  ts: 'typescript',
  tsx: 'typescript',
  js: 'javascript',
  jsx: 'javascript',
  mjs: 'javascript',
  cjs: 'javascript',
  json: 'json',
  jsonc: 'json',
  py: 'python',
  rb: 'ruby',
  rs: 'rust',
  go: 'go',
  java: 'java',
  kt: 'kotlin',
  swift: 'swift',
  c: 'c',
  h: 'c',
  cpp: 'cpp',
  cc: 'cpp',
  cxx: 'cpp',
  hpp: 'cpp',
  cs: 'csharp',
  php: 'php',
  lua: 'lua',
  sql: 'sql',
  sh: 'bash',
  bash: 'bash',
  zsh: 'bash',
  yml: 'yaml',
  yaml: 'yaml',
  toml: 'toml',
  md: 'markdown',
  markdown: 'markdown',
  html: 'markup',
  htm: 'markup',
  xml: 'markup',
  svg: 'markup',
  vue: 'markup',
  css: 'css',
  scss: 'scss',
  less: 'less',
}

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
  return EXTENSION_LANGUAGES[name.slice(dot + 1).toLowerCase()] ?? ''
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

export function toolDiffHeader(message: ToolDiffMessage): string {
  return message.path === '' ? message.tool : `${message.tool} ${message.path}`
}

export interface ToolDiffBody {
  lines: string[]
  rows: Segment[][]
  bgs: (string | undefined)[]
}

const PLAIN_STYLE = { color: colors.mdCodePlain }

function splitHighlightedLines(source: string, lang: string): Segment[][] {
  if (source === '') return []
  const highlighted = highlightCodeBlock(source, lang)
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

export function renderToolDiffBody(message: ToolDiffMessage, width: number): ToolDiffBody {
  const budget = Math.max(4, width)
  const bodyWidth = Math.max(2, budget - 2)
  const lines: string[] = []
  const rows: Segment[][] = []
  const bgs: (string | undefined)[] = []
  const sourceText = message.hunks.map(hunk => hunk.map(line => line.text).join('\n')).join('\n')
  const fromPath = message.path === '' ? '' : languageFromPath(message.path)
  const lang = fromPath !== '' ? fromPath : sniffLanguage(sourceText)
  const withBackgrounds = message.tool === 'edit'
  for (const hunk of message.hunks) {
    const perLine = splitHighlightedLines(hunk.map(line => line.text).join('\n'), lang)
    for (let index = 0; index < hunk.length; index++) {
      const line = hunk[index]!
      let bg: string | undefined
      let prefix: Segment[]
      if (line.kind === 'add') {
        bg = withBackgrounds ? colors.diffAddedBackground : undefined
        prefix = [{ text: '+', style: { color: colors.diffAdded } }, { text: ' ', style: {} }]
      } else if (line.kind === 'del') {
        bg = withBackgrounds ? colors.diffRemovedBackground : undefined
        prefix = [{ text: '-', style: { color: colors.diffRemoved } }, { text: ' ', style: {} }]
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
    rows.push([{ text: message.error, style: { color: colors.errorText } }])
    lines.push(message.error)
    bgs.push(undefined)
  }
  return { lines, rows, bgs }
}
