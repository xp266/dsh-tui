import { CHROME_FRAME_ROWS, MESSAGE_INPUT_GAP_ROWS, SCROLLBAR_COL_FROM_EDGE, SCROLLBAR_GAP_COLS, CHROME_MARGIN_X, hintBlockTop } from '../core/metrics.ts'
import { HINT_INPUT_GAP_ROWS } from '../core/metrics.ts'

/**
 * Single source of truth for the shell's derived geometry. Every consumer
 * (App layout, pointer handlers, panels, message scrollbar) derives its
 * region from these helpers instead of repeating the formulas, so changing
 * the chrome skeleton only touches this file.
 */

export interface ShellGeometry {
  columns: number
  rows: number
  /** Full height of the input block (frame rows + content rows). */
  inputHeight: number
  /** Height of the message area. */
  messageHeight: number
  /** Height of the active interaction panel body, when a panel owns the bottom. */
  panelHeight: number | null
}

export function inputContentTop(rows: number, inputHeight: number): number {
  return rows - inputHeight
}

/** Inclusive bottom row of the input's editable content area. */
export function inputContentBottom(rows: number, inputHeight: number): number {
  return inputContentTop(rows, inputHeight) + inputHeight - CHROME_FRAME_ROWS
}

export function inputContentContains(y: number, rows: number, inputHeight: number): boolean {
  return y >= inputContentTop(rows, inputHeight) && y <= inputContentBottom(rows, inputHeight)
}

export function messageHeightOf(rows: number, inputHeight: number): number {
  return Math.max(1, rows - inputHeight - MESSAGE_INPUT_GAP_ROWS)
}

/** Inclusive row span of the active interaction panel (message bottom .. above the status line). */
export function panelSpan(geometry: ShellGeometry): { top: number; bottom: number } {
  return { top: geometry.messageHeight, bottom: geometry.rows - 2 }
}

export function panelContains(y: number, geometry: ShellGeometry): boolean {
  const span = panelSpan(geometry)
  return y >= span.top && y <= span.bottom
}

/** Anchor row where a panel of `bodyRows` lines must start to sit above the status line. */
export function panelAnchorRow(rows: number, bodyRows: number): number {
  return rows - 2 - bodyRows
}

export interface HintSpan {
  top: number
  bottom: number
}

export function hintSpan(rows: number, inputHeight: number, visibleCount: number, dialogOpen: boolean): HintSpan | null {
  if (dialogOpen || visibleCount <= 0) return null
  const top = hintBlockTop(rows, inputHeight, visibleCount)
  const bottom = rows - inputHeight - MESSAGE_INPUT_GAP_ROWS - HINT_INPUT_GAP_ROWS
  return { top, bottom }
}

export function hintContains(y: number, rows: number, inputHeight: number, visibleCount: number, dialogOpen: boolean): boolean {
  const span = hintSpan(rows, inputHeight, visibleCount, dialogOpen)
  return span !== null && y >= span.top && y <= span.bottom
}

export function scrollbarColumn(columns: number): number {
  return columns - SCROLLBAR_COL_FROM_EDGE
}

export function messageBackgroundWidth(width: number): number {
  return width - CHROME_MARGIN_X - SCROLLBAR_COL_FROM_EDGE - SCROLLBAR_GAP_COLS
}
