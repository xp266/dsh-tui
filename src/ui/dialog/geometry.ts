import { textWidth, truncate, wrapLines } from '../../core/text.ts'
import { glyphs } from '../../terminal/glyphs.ts'
import type { DialogFocus, DialogRow } from './items.ts'
import { isSelectableRow } from './items.ts'
import { widgetOf } from '../widgets/registry.ts'

export const CAROUSEL_BUTTON_WIDTH = 3

const SELECT_BLOCK_WIDTH_RATIO = 0.6
const ACTION_EDGE_RATIO = 0.2

export interface DialogFooterLine {
  text: string
  color?: string
}

interface FooterRenderLine {
  text: string
  color?: string
}

const FOOTER_MAX_LINES_PER_ENTRY = 2

function wrapFooter(footer: DialogFooterLine[] | undefined, width: number): FooterRenderLine[] {
  if (footer === undefined) return []
  const rows: FooterRenderLine[] = []
  for (const line of footer) {
    if (line.text === '') continue
    const wrapped = wrapLines(line.text, width)
    const capped = wrapped.slice(0, FOOTER_MAX_LINES_PER_ENTRY)
    if (wrapped.length > FOOTER_MAX_LINES_PER_ENTRY) {
      capped[1] = truncate(capped[1] ?? '', Math.max(1, width - glyphs.ellipsis.length)) + glyphs.ellipsis
    }
    for (const text of capped) rows.push({ text, color: line.color })
  }
  return rows
}

export { wrapFooter }

export function wrapStatusLines(lines: DialogFooterLine[] | undefined, width: number): FooterRenderLine[] {
  if (lines === undefined) return []
  const rows: FooterRenderLine[] = []
  for (const line of lines) {
    if (line.text === '') continue
    for (const text of wrapLines(line.text, width)) rows.push({ text, color: line.color })
  }
  return rows
}

export function rowHeight(row: DialogRow, width: number): number {
  let height = 1
  for (const item of row.items) {
    const itemHeight = widgetOf(item.type).height(item, width)
    if (itemHeight > height) height = itemHeight
  }
  return height
}

export function rowTopOffset(rows: DialogRow[], rowIndex: number, width: number): number {
  let offset = 0
  for (let i = 0; i < rowIndex; i++) offset += rowHeight(rows[i]!, width)
  return offset
}

export function rowBlockSpan(rows: DialogRow[], rowIndex: number, width: number): { top: number; bottom: number } {
  const top = rowTopOffset(rows, rowIndex, width)
  let blockTop = top
  let bottom = top + rowHeight(rows[rowIndex] ?? { items: [] }, width) - 1
  for (let i = rowIndex - 1; i >= 0 && !isSelectableRow(rows[i]); i--) blockTop -= rowHeight(rows[i]!, width)
  for (let i = rowIndex + 1; i < rows.length && !isSelectableRow(rows[i]); i++) bottom += rowHeight(rows[i]!, width)
  return { top: blockTop, bottom }
}

export function adjustScroll(rows: DialogRow[], focus: DialogFocus, scrollTop: number, contentHeight: number, width: number): number {
  const { top, bottom } = rowBlockSpan(rows, focus.row, width)
  if (top < scrollTop) return top
  if (bottom >= scrollTop + contentHeight) return Math.max(0, bottom - contentHeight + 1)
  return scrollTop
}

export function listCenterScroll(rows: DialogRow[], focusRow: number, viewportHeight: number, width: number, direction: 'up' | 'down'): number {
  const total = rows.reduce((sum, row) => sum + rowHeight(row, width), 0)
  const maxScroll = Math.max(0, total - viewportHeight)
  const anchor = direction === 'down' ? Math.floor(viewportHeight / 2) : Math.floor((viewportHeight - 1) / 2)
  const top = rowTopOffset(rows, focusRow, width)
  return Math.max(0, Math.min(top - anchor, maxScroll))
}

export function hitRowIndex(y: number, top: number, titleLines: number, rows: DialogRow[], scrollTop = 0, width = Number.POSITIVE_INFINITY): number | null {
  const localY = y - top - 1 - titleLines + scrollTop
  let offset = 0
  for (let i = 0; i < rows.length; i++) {
    const height = rowHeight(rows[i]!, width)
    if (localY >= offset && localY < offset + height) return i
    offset += height
  }
  return null
}

export interface SelectBlock {
  blockWidth: number
  blockStart: number
  text: string
  leftPad: number
  fullLeftPad: number
  cursorX: number
}

export function selectBlock(contentWidth: number, value: string): SelectBlock {
  const blockWidth = Math.max(3, Math.floor(contentWidth * SELECT_BLOCK_WIDTH_RATIO))
  const innerWidth = Math.max(1, blockWidth - CAROUSEL_BUTTON_WIDTH * 2)
  const text = truncate(value || '(none)', innerWidth)
  const padding = innerWidth - textWidth(text)
  const fullPadding = blockWidth - textWidth(text)
  return {
    blockWidth,
    blockStart: contentWidth - blockWidth,
    text,
    leftPad: Math.floor(padding / 2),
    fullLeftPad: Math.floor(fullPadding / 2),
    cursorX: CAROUSEL_BUTTON_WIDTH + Math.floor(padding / 2) + textWidth(text),
  }
}

export function actionPositions(contentWidth: number, confirmLabel: string, cancelLabel: string): { confirmX: number; cancelX: number } {
  const edge = Math.floor(contentWidth * ACTION_EDGE_RATIO)
  const confirmX = Math.min(edge, Math.max(0, contentWidth - textWidth(confirmLabel)))
  const cancelX = Math.max(confirmX + textWidth(confirmLabel), contentWidth - edge - textWidth(cancelLabel))
  return { confirmX, cancelX }
}
