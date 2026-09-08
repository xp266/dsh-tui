export interface LineSelection {
  anchorRow: number
  anchorCol: number
  focusRow: number
  focusCol: number
  inMessage: boolean
}

/**
* Row space of the dialog error strip, far above any real screen row. Strip
* selections anchor to strip content rows through this offset, so scrolling
* the strip moves the viewport over the selection instead of detaching it.
*/
export const STRIP_ROW_BASE = 1_000_000

export function selectedRange(sel: LineSelection, row: number): { start: number; end: number } | null {
  const top = Math.min(sel.anchorRow, sel.focusRow)
  const bottom = Math.max(sel.anchorRow, sel.focusRow)
  if (row < top || row > bottom) return null
  if (sel.anchorRow === sel.focusRow) {
    return { start: Math.min(sel.anchorCol, sel.focusCol), end: Math.max(sel.anchorCol, sel.focusCol) }
  }
  const upward = sel.focusRow < sel.anchorRow
  if (row === sel.anchorRow) {
    return upward ? { start: 0, end: sel.anchorCol } : { start: sel.anchorCol, end: Infinity }
  }
  if (row === sel.focusRow) {
    return upward ? { start: sel.focusCol, end: Infinity } : { start: 0, end: sel.focusCol }
  }
  return { start: 0, end: Infinity }
}

export function toScreenSelection(
  selection: LineSelection | null,
  scrollTop: number,
  messageHeight: number,
): LineSelection | null {
  if (selection === null) return null
  if (!selection.inMessage) return selection
  const rawAnchor = selection.anchorRow - scrollTop
  const rawFocus = selection.focusRow - scrollTop
  const visible = (row: number) => row >= 0 && row < messageHeight
  if (!visible(rawAnchor) && !visible(rawFocus)) return null
  const clampRow = (row: number): number => (row < 0 ? 0 : row >= messageHeight ? messageHeight - 1 : row)
  const snapCol = (raw: number, col: number): number => (raw < 0 ? 0 : raw >= messageHeight ? Infinity : col)
  return {
    anchorRow: clampRow(rawAnchor),
    anchorCol: snapCol(rawAnchor, selection.anchorCol),
    focusRow: clampRow(rawFocus),
    focusCol: snapCol(rawFocus, selection.focusCol),
    inMessage: true,
  }
}

export function clampFocusRow(
  inMessage: boolean,
  eventY: number,
  scrollTop: number,
  messageHeight: number,
  rows: number,
  dialogOpen: boolean,
): number {
  if (inMessage) {
    return Math.min(eventY + scrollTop, scrollTop + messageHeight - 1)
  }
  if (dialogOpen) {
    return Math.max(0, Math.min(eventY, rows - 1))
  }
  return Math.max(messageHeight, eventY)
}