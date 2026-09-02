import { truncate } from '../core/text.ts'
import type { DiffLine } from '../model/message.ts'

export const SUMMARY_SAFETY_MAX = 300

export function relativize(path: string, cwd: string): string {
  const flatPath = flat(path)
  if (flatPath === cwd) return '.'
  if (flatPath.startsWith(`${cwd}/`)) return flatPath.slice(cwd.length + 1)
  return flatPath
}

export function truncateSummary(text: string, max = SUMMARY_SAFETY_MAX): string {
  const cut = truncate(text, max)
  return cut.length === text.length ? cut : `${cut}...`
}

function flat(text: string): string {
  return text.replace(/\r\n|\r|\n/g, '\\n').replace(/\t/g, '\\t')
}

/**
 * Generic primary-param picker: among single-line values (short strings,
 * numbers, booleans) choose the shortest one, so the header suffix stays as
 * short as possible — a human summary beats a long payload. Empty and
 * multi-line strings, arrays, and objects never qualify.
 */
export function pickPrimaryParam(args: unknown): { key: string; value: string } | undefined {
  if (typeof args !== 'object' || args === null) return undefined
  let best: { key: string; value: string } | undefined
  for (const [key, value] of Object.entries(args as Record<string, unknown>)) {
    const text = singleLineText(value)
    if (text === undefined) continue
    if (best === undefined || text.length < best.value.length) best = { key, value: text }
  }
  return best
}

function singleLineText(value: unknown): string | undefined {
  if (value === undefined || value === null) return undefined
  if (typeof value === 'string') return value === '' || value.includes('\n') ? undefined : value
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  return undefined
}

/** JSON of the remaining args after the primary key, or '' when nothing remains. */
export function remainingArgsJson(args: unknown, excludeKey: string | undefined): string {
  if (typeof args !== 'object' || args === null) {
    if (typeof args === 'string' && args !== '') return args
    return ''
  }
  if (excludeKey !== undefined) {
    const rest = { ...(args as Record<string, unknown>) }
    delete rest[excludeKey]
    if (Object.keys(rest).length === 0) return ''
    return JSON.stringify(rest, null, 2) ?? ''
  }
  return JSON.stringify(args, null, 2) ?? ''
}

/** The path part of a diff-card title (`Write foo.txt` -> `foo.txt`). */
export function pathFromTitle(title: string | undefined, fallback: string): string {
  if (title === undefined) return fallback
  const rest = title.trim().split(/\s+/).slice(1).join(' ')
  return rest === '' ? fallback : rest
}

export interface DiffLike {
  path: string
  oldText: string | null
  newText: string
}

interface DiffOp {
  kind: 'ctx' | 'del' | 'add'
  text: string
}

function alignDiff(oldLines: string[], newLines: string[]): DiffOp[] {
  const n = oldLines.length
  const m = newLines.length
  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0))
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i]![j] = oldLines[i] === newLines[j]
        ? dp[i + 1]![j + 1]! + 1
        : Math.max(dp[i + 1]![j]!, dp[i]![j + 1]!)
    }
  }
  const ops: DiffOp[] = []
  let i = 0
  let j = 0
  while (i < n && j < m) {
    if (oldLines[i] === newLines[j]) {
      ops.push({ kind: 'ctx', text: oldLines[i]! })
      i++
      j++
    } else if (dp[i + 1]![j]! >= dp[i]![j + 1]!) {
      ops.push({ kind: 'del', text: oldLines[i]! })
      i++
    } else {
      ops.push({ kind: 'add', text: newLines[j]! })
      j++
    }
  }
  while (i < n) {
    ops.push({ kind: 'del', text: oldLines[i]! })
    i++
  }
  while (j < m) {
    ops.push({ kind: 'add', text: newLines[j]! })
    j++
  }
  return ops
}

export function formatDiffDiffs(diffs: readonly DiffLike[]): string {
  const lines: string[] = []
  for (const diff of diffs) {
    for (const op of alignedOps(diff.oldText, diff.newText)) {
      if (op.kind === 'ctx') lines.push(`  ${op.text}`)
      else if (op.kind === 'del') lines.push(`- ${op.text}`)
      else lines.push(`+ ${op.text}`)
    }
  }
  return lines.join('\n')
}

export function diffLineGroups(diffs: readonly DiffLike[]): DiffLine[][] {
  const groups: DiffLine[][] = []
  for (const diff of diffs) {
    groups.push(alignedOps(diff.oldText, diff.newText).map(op => ({ kind: op.kind, text: op.text })))
  }
  return groups
}

export interface ToolDiffView {
  path: string
  hunks: readonly (readonly DiffLine[])[]
  /** Override the default "paint backgrounds when a removal exists" rule. */
  backgrounds?: boolean
}

/**
 * Body for a `card: 'generic'` call: the salient `rawInput` (string verbatim,
 * anything else as pretty JSON) followed by the view's content text. A part
 * the header already carries is dropped — the background-bash view puts the
 * command in both `title` and `rawInput`, and `job_output`'s id already rides
 * the header. Empty when nothing remains.
 */
export function genericCallBody(rawInput: unknown, contentText: string, headerSuffix: string): string {
  const raw =
    typeof rawInput === 'string' && rawInput !== '' ? rawInput
    : rawInput !== undefined && rawInput !== null ? stringifyValue(rawInput)
    : ''
  const duplicated = (text: string): boolean =>
    text === headerSuffix || (text.length >= 4 && headerSuffix.includes(text))
  const parts: string[] = []
  if (raw !== '' && !duplicated(raw)) parts.push(raw)
  if (contentText !== '' && !duplicated(contentText) && contentText !== raw) parts.push(contentText)
  return parts.join('\n\n')
}

/**
 * Header suffix for a `card: 'generic'` call: the description wins when the
 * view carries one; otherwise the shorter of the title and a single-line
 * content text — a summary title beats a raw-command one.
 */
export function genericCallHeader(name: string, view: { title?: string; description?: string }, contentText: string): string {
  if (view.description !== undefined && view.description !== '' && !view.description.includes('\n')) {
    return view.description
  }
  const title = dedupeTitle(name, view.title ?? '')
  const contentFirst = contentText.includes('\n') ? '' : contentText.trim()
  if (contentFirst !== '' && (title === '' || contentFirst.length < title.length)) return contentFirst
  return title
}

/** Drop trailing blank lines a result text often ends with. */
export function trimTrailingBlanks(text: string): string {
  return text.replace(/[\s]+$/u, '')
}

/** Collapse `.` and `..` segments so a display path names a real directory. */
export function collapseDotSegments(path: string): string {
  if (!/(?:^|[/\\])\.\.?(?:[/\\]|$)/.test(path)) return path
  const separator = path.includes('\\') && !path.includes('/') ? '\\' : '/'
  const rooted = path.startsWith('/') || path.startsWith('\\')
  const kept: string[] = []
  for (const segment of path.split(/[/\\]/)) {
    if (segment === '' || segment === '.') continue
    if (segment === '..') {
      if (kept.length > 0 && kept[kept.length - 1] !== '..') kept.pop()
      else if (!rooted) kept.push('..')
      continue
    }
    kept.push(segment)
  }
  const body = kept.join(separator)
  return rooted ? `${separator}${body}` : body
}

/**
 * The body line of a terminal call. An explicitly declared workdir renders as
 * a shell-style prompt prefix (`dir $ cmd`), resolved against the session
 * workspace and relativized; an omitted cwd IS the session workspace, so the
 * command renders bare.
 */
export function terminalCallBody(title: string | undefined, viewCwd: string | undefined, sessionCwd: string): string {
  const command = title ?? ''
  if (viewCwd === undefined || viewCwd === '') return command
  const absolute = /^(?:[A-Za-z]:)?[/\\]/.test(viewCwd)
  const resolved = absolute ? viewCwd : `${sessionCwd.replace(/[/\\]+$/, '')}/${viewCwd}`
  const display = relativize(collapseDotSegments(resolved), sessionCwd)
  if (display === '.' || display === '') return command
  return `${display} $ ${command}`
}

function stringifyValue(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2) ?? ''
  } catch {
    return ''
  }
}

/**
 * Flatten a settled result's content blocks to display text: text blocks
 * verbatim, anything else as pretty JSON. Empty when there is no content.
 */
export function flattenContentBlocks(content: readonly { type: string; text?: string }[]): string {
  const parts: string[] = []
  for (const block of content) {
    if (block.type === 'text') parts.push(block.text ?? '')
    else parts.push(stringifyValue(block))
  }
  return parts.filter(part => part !== '').join('\n')
}

/**
 * The recovery line a truncated result keeps in its raw text: the spill
 * footer the search tools append (`Full ... stored at ...`). The structured
 * card replaces the raw body, so this line is surfaced after it to keep the
 * one path to the dropped rows. Empty when the raw text carries no footer.
 */
export function recoveryLines(resultText: string): string[] {
  const lines = resultText.split('\n')
  for (let index = lines.length - 1; index >= 0; index--) {
    if (/stored at|retrieval hint/i.test(lines[index]!)) return [lines[index]!.trimEnd()]
  }
  return []
}

/** A search result as flat lines: paths, or matches grouped under file paths. */
export function formatSearchView(view: { shape?: 'paths' | 'matches'; paths?: readonly string[]; files?: readonly { path: string; matches: readonly { lineNumber: number; line: string }[] }[] }): string {
  const lines: string[] = []
  if (view.shape === 'paths') {
    lines.push(...(view.paths ?? []))
  } else {
    for (const file of view.files ?? []) {
      lines.push(file.path)
      for (const match of file.matches) lines.push(`${match.lineNumber}: ${match.line}`)
    }
  }
  return lines.join('\n')
}

export function diffsFromResultMeta(meta: unknown): DiffLike[] | undefined {
  if (typeof meta !== 'object' || meta === null || Array.isArray(meta)) return undefined
  const raw = (meta as Record<string, unknown>).diffs
  if (!Array.isArray(raw) || raw.length === 0) return undefined
  const diffs: DiffLike[] = []
  for (const entry of raw) {
    if (typeof entry !== 'object' || entry === null) return undefined
    const record = entry as Record<string, unknown>
    if (typeof record.path !== 'string') return undefined
    if (record.oldText !== null && typeof record.oldText !== 'string') return undefined
    if (typeof record.newText !== 'string') return undefined
    diffs.push({ path: record.path, oldText: record.oldText, newText: record.newText })
  }
  return diffs
}

const DIFF_CELL_CAP = 4_000_000

/** Split on newlines where a trailing `\n` terminates the last line instead of opening an empty one. */
export function splitLines(text: string): string[] {
  if (text === '') return []
  return text.endsWith('\n') ? text.slice(0, -1).split('\n') : text.split('\n')
}

function alignedOps(oldText: string | null, newText: string): DiffOp[] {
  const additionsOnly = (): DiffOp[] => alignDiff([], splitLines(newText))
  if (oldText === null || oldText === '') return additionsOnly()
  const oldLines = splitLines(oldText)
  const newLines = splitLines(newText)
  if (oldLines.length * Math.max(1, newLines.length) > DIFF_CELL_CAP) return additionsOnly()
  return alignDiff(oldLines, newLines)
}

export interface ReadLineLike {
  number: number
  text: string
}

export function formatReadLines(lines: readonly ReadLineLike[]): string {
  const maxDigits = lines.reduce((max, line) => Math.max(max, String(line.number).length), 0)
  return lines.map(line => `${String(line.number).padStart(maxDigits)} ${line.text}`).join('\n')
}

export function readBodyCol(lines: readonly ReadLineLike[]): number {
  const maxDigits = lines.reduce((max, line) => Math.max(max, String(line.number).length), 0)
  return Math.max(0, 3 - maxDigits)
}
/** Generic title dedup against the tool name, applied to every protocol:
 *  1. title === name (case-insensitive)            -> '' (ralph / ralph)
 *  2. title starts with "name:"                    -> strip prefix (workflow: x -> x)
 *  3. title's first word === name's stem           -> strip first word
 *      (create_goal + "Create goal" -> "goal"; grep + "Grep x" -> "x")
 *  4. otherwise title verbatim
 */
export function dedupeTitle(name: string, title: string): string {
  const trimmed = title.trim()
  if (trimmed === '') return ''
  if (trimmed.toLowerCase() === name.toLowerCase()) return ''
  const colon = /^([a-z0-9_-]+):\s*(.*)$/i.exec(trimmed)
  if (colon !== null && colon[1]!.toLowerCase() === name.toLowerCase()) return truncateSummary(colon[2]!)
  const words = trimmed.split(/\s+/)
  const stem = name.split('_')[0]!.toLowerCase()
  if (words[0]!.toLowerCase() === stem) return truncateSummary(words.slice(1).join(' '))
  return truncateSummary(trimmed)
}
