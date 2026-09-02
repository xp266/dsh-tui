import { widgetOf } from '../widgets/registry.ts'
import type { DialogItemKinds } from '../../contract/index.ts'

export interface DialogRow {
  items: DialogItem[]
}

type PluginDialogItem = DialogItemKinds[keyof DialogItemKinds]

export type DialogItem =
  | { type: 'input'; label: string; value: string; onChange: (value: string) => void; onEnter?: () => void }
  | { type: 'select'; label: string; value: string; options: string[]; onChange: (value: string) => void; onEnter?: () => void; spaced?: boolean }
  | { type: 'search'; value: string; onChange: (value: string) => void }
  | { type: 'button'; label: string; right?: string; rightColor?: string; onPress: () => void }
  | { type: 'checkbox'; label: string; checked: boolean; onToggle: () => void; onConfirm: () => void }
  | { type: 'header'; label: string; leadingBlank?: boolean }
  | { type: 'static'; label: string }
  | { type: 'actions'; confirmLabel: string; cancelLabel: string; onConfirm: () => void; onCancel: () => void }
  | { type: string; data?: unknown }
  | PluginDialogItem

export interface DialogFocus {
  row: number
  col: number
}

export function isSelectableRow(row: DialogRow | undefined): boolean {
  if (row === undefined) return false
  return row.items.some(item => widgetOf(item.type).selectable === true)
}

export function selectableSpan(row: DialogRow | undefined): number {
  if (row === undefined) return 0
  let stops = 0
  for (const item of row.items) {
    stops += widgetOf(item.type).stops?.(item) ?? 1
  }
  return Math.max(0, stops - 1)
}

export function snapRow(rows: DialogRow[], row: number): number {
  const count = rows.length
  if (count === 0) return 0
  const index = Math.min(Math.max(row, 0), count - 1)
  if (isSelectableRow(rows[index])) return index
  for (let down = index + 1; down < count; down++) {
    if (isSelectableRow(rows[down])) return down
  }
  for (let up = index - 1; up >= 0; up--) {
    if (isSelectableRow(rows[up])) return up
  }
  return index
}

function stepRow(rows: DialogRow[], from: number, delta: -1 | 1): number {
  let row = from + delta
  while (row >= 0 && row < rows.length && !isSelectableRow(rows[row])) row += delta
  return row >= 0 && row < rows.length ? row : from
}

function focusedItem(row: DialogRow | undefined, col: number): DialogItem | undefined {
  if (row === undefined) return undefined
  const only = row.items.length === 1 ? row.items[0] : undefined
  if (only !== undefined && widgetOf(only.type).fullRowFocus === true) return only
  return row.items[col]
}

export { focusedItem }

export function moveFocus(rows: DialogRow[], focus: DialogFocus, key: 'up' | 'down' | 'left' | 'right'): DialogFocus {
  switch (key) {
    case 'up':
      return { row: stepRow(rows, focus.row, -1), col: 0 }
    case 'down':
      return { row: stepRow(rows, focus.row, 1), col: 0 }
    case 'left':
      return { row: focus.row, col: Math.max(0, focus.col - 1) }
    case 'right': {
      const max = selectableSpan(rows[focus.row])
      return { row: focus.row, col: Math.max(0, Math.min(max, focus.col + 1)) }
    }
  }
}

export function clampFocus(rows: DialogRow[], focus: DialogFocus, minRow: number, maxRow: number): DialogFocus {
  const row = snapRow(rows, Math.min(Math.max(focus.row, minRow), maxRow))
  return { row, col: Math.min(focus.col, selectableSpan(rows[row])) }
}

export type TextItem = Extract<DialogItem, { type: 'input' }> | Extract<DialogItem, { type: 'search' }>

export function asTextItem(item: DialogItem): TextItem | null {
  return widgetOf(item.type).editable === true ? item as TextItem : null
}

export function filterRowsWithHeaders(rows: DialogRow[], query: string, searchRight: boolean): DialogRow[] {
  const q = query.trim().toLowerCase()
  if (q === '') return rows
  const matches = (item: DialogItem): boolean => {
    const texts = widgetOf(item.type).searchTexts?.(item, searchRight)
    if (texts === undefined) return false
    return texts.some(text => text.toLowerCase().includes(q))
  }
  const out: DialogRow[] = []
  let pendingHeader: DialogRow | undefined
  for (const row of rows) {
    if (!isSelectableRow(row)) {
      pendingHeader = row
      continue
    }
    if (!row.items.some(matches)) continue
    if (pendingHeader !== undefined) {
      out.push(pendingHeader)
      pendingHeader = undefined
    }
    out.push(row)
  }
  const first = out[0]
  if (first !== undefined && first.items.length === 1 && first.items[0]?.type === 'header') {
    const header = first.items[0] as { type: 'header'; label: string; leadingBlank?: boolean }
    out[0] = { items: [{ ...header, leadingBlank: false }] }
  }
  return out
}
