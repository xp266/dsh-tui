import { truncate } from '../utils/text.ts'

export const SUMMARY_MAX = 20

export function relativize(path: string, cwd: string): string {
  if (path === cwd) return '.'
  if (path.startsWith(`${cwd}/`)) return path.slice(cwd.length + 1)
  return path
}

export function truncateSummary(text: string): string {
  const cut = truncate(text, SUMMARY_MAX)
  return cut.length === text.length ? cut : `${cut}...`
}

function valueText(value: unknown, cwd: string): string {
  if (typeof value === 'string') return relativize(value, cwd)
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  if (value === null || value === undefined) return ''
  try {
    return JSON.stringify(value)
  } catch {
    return String(value)
  }
}

export function summarizeParams(args: unknown, cwd: string): string {
  if (typeof args === 'string') return truncateSummary(args)
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
    const oldLines = diff.oldText === null || diff.oldText === '' ? [] : diff.oldText.split('\n')
    const newLines = diff.newText === '' ? [] : diff.newText.split('\n')
    for (const op of alignDiff(oldLines, newLines)) {
      if (op.kind === 'ctx') lines.push(`  ${op.text}`)
      else if (op.kind === 'del') lines.push(`- ${op.text}`)
      else lines.push(`+ ${op.text}`)
    }
  }
  return lines.join('\n')
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