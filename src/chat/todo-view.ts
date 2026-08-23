import { textWidth } from '../core/text.ts'

export const TODO_TOOL_NAME = 'todo_write'

export type TodoStatus = 'pending' | 'in_progress' | 'completed'

export interface TodoItemLike {
  content: string
  status: TodoStatus
}

const TODO_SYMBOLS: Record<TodoStatus, string> = {
  pending: '[ ]',
  in_progress: '[●]',
  completed: '[√]',
}

export const TODO_HANG_COLS = textWidth(`${TODO_SYMBOLS.in_progress} `)

export function todoSymbol(status: TodoStatus | undefined): string {
  return status === undefined ? TODO_SYMBOLS.pending : TODO_SYMBOLS[status] ?? TODO_SYMBOLS.pending
}

export function normalizeTodos(raw: unknown): TodoItemLike[] {
  if (!Array.isArray(raw)) return []
  const out: TodoItemLike[] = []
  for (const entry of raw) {
    if (typeof entry !== 'object' || entry === null) continue
    const record = entry as Record<string, unknown>
    if (typeof record.content !== 'string' || record.content.trim() === '') continue
    const status = record.status === 'in_progress' || record.status === 'completed' ? record.status : 'pending'
    out.push({ content: record.content.trim(), status })
  }
  return out
}

export function parseTodoArgs(raw: unknown): TodoItemLike[] {
  if (typeof raw !== 'object' || raw === null) return []
  return normalizeTodos((raw as { todos?: unknown }).todos)
}

export function parseTodoResult(resultText: string): TodoItemLike[] {
  let parsed: unknown
  try {
    parsed = JSON.parse(resultText)
  } catch {
    return []
  }
  if (typeof parsed !== 'object' || parsed === null) return []
  return normalizeTodos((parsed as { todos?: unknown }).todos)
}

export function formatTodoBubble(items: readonly TodoItemLike[]): string {
  const lines = [TODO_TOOL_NAME, '']
  for (const item of items) {
    lines.push(`${todoSymbol(item.status)} ${item.content}`)
  }
  return lines.join('\n')
}

export function isTodoActive(items: readonly TodoItemLike[]): boolean {
  return items.length > 0 && items.some(item => item.status !== 'completed')
}

export function todoProgress(items: readonly TodoItemLike[]): { current: number; total: number } | undefined {
  if (!isTodoActive(items)) return undefined
  const active = items.findIndex(item => item.status === 'in_progress')
  const fallback = items.findIndex(item => item.status !== 'completed')
  const index = active >= 0 ? active : fallback
  return index < 0 ? undefined : { current: index + 1, total: items.length }
}
