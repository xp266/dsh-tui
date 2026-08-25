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