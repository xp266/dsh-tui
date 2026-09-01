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

export function flattenText(text: string): string {
  return flat(text)
}

function flat(text: string): string {
  return text.replace(/\r\n|\r|\n/g, '\\n').replace(/\t/g, '\\t')
}

function valueText(value: unknown, cwd: string): string {
  if (typeof value === 'string') return flat(relativize(value, cwd))
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  if (value === null || value === undefined) return ''
  try {
    return JSON.stringify(value)
  } catch {
    return String(value)
  }
}

export function summarizeParams(args: unknown, cwd: string): string {
  if (typeof args === 'string') return truncateSummary(flat(args))
  if (typeof args !== 'object' || args === null) return ''
  const parts: string[] = []
  for (const [key, value] of Object.entries(args as Record<string, unknown>)) {
    const text = valueText(value, cwd)
    if (text === '') continue
    parts.push(`${key}=${text}`)
  }
  return truncateSummary(parts.join(', '))
}

/**
 * Generic primary-param picker: among single-line values (short strings,
 * numbers, booleans) choose the shortest one. Multi-line text, arrays, and
 * objects never qualify, so a tool whose only arguments are structured shows
 * a bare name header.
 */
export function pickPrimaryParam(args: unknown): { key: string; value: string } | undefined {
  if (typeof args !== 'object' || args === null) return undefined
  let best: { key: string; value: string } | undefined
  for (const [key, value] of Object.entries(args as Record<string, unknown>)) {
    if (value === undefined || value === null) continue
    let text: string
    if (typeof value === 'string') {
      if (value.includes('\n')) continue
      text = value
    } else if (typeof value === 'number' || typeof value === 'boolean') {
      text = String(value)
    } else {
      continue
    }
    if (best === undefined || text.length < best.value.length) best = { key, value: text }
  }
  return best
}

/** JSON of the remaining args after the primary key, or '' when nothing remains. */
export function remainingArgsJson(args: unknown, excludeKey: string | undefined): string {
  if (typeof args !== 'object' || args === null) return ''
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

export function summarizeOthers(args: unknown, skip: readonly string[], cwd: string): string {
  if (typeof args !== 'object' || args === null) return ''
  const parts: string[] = []
  for (const [key, value] of Object.entries(args as Record<string, unknown>)) {
    if (skip.includes(key)) continue
    const text = valueText(value, cwd)
    if (text === '') continue
    parts.push(`${key}=${text}`)
  }
  if (parts.length === 0) return ''
  return `, ${truncateSummary(parts.join(', '))}`
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

export function diffCallFromArgs(tool: string, args: unknown): ToolDiffView {
  const record = typeof args === 'object' && args !== null ? args as Record<string, unknown> : {}
  const path = typeof record.file_path === 'string' ? record.file_path : ''
  const oldString = typeof record.old_string === 'string' && record.old_string !== '' ? record.old_string : null
  const newText = typeof record.content === 'string'
    ? record.content
    : typeof record.new_string === 'string' ? record.new_string : ''
  return { path, hunks: diffLineGroups([{ path, oldText: tool === 'edit' ? oldString : null, newText }]) }
}

const DIFF_CELL_CAP = 4_000_000

function alignedOps(oldText: string | null, newText: string): DiffOp[] {
  const additionsOnly = (): DiffOp[] => alignDiff([], newText === '' ? [] : newText.split('\n'))
  if (oldText === null || oldText === '') return additionsOnly()
  const oldLines = oldText.split('\n')
  const newLines = newText === '' ? [] : newText.split('\n')
  if (oldLines.length * Math.max(1, newLines.length) > DIFF_CELL_CAP) return additionsOnly()
  return alignDiff(oldLines, newLines)
}

export function diffGroupsFromTexts(oldText: string | null, newText: string): DiffLine[][] {
  return [alignedOps(oldText, newText).map(op => ({ kind: op.kind, text: op.text }))]
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
