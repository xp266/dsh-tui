import { createContext, useContext } from 'react'
import { Text } from 'ink'
import { colToCharIndex, textWidth } from '../utils/text.ts'

export interface LineSelection {
  anchorRow: number
  anchorCol: number
  focusRow: number
  focusCol: number
  inMessage: boolean
}

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

export const SelectionContext = createContext<LineSelection | null>(null)

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

interface HighlightedTextProps {
  y: number
  col: number
  text: string
  color?: string
  inverse?: boolean
}

export function HighlightedText({ y, col, text, color, inverse = false }: HighlightedTextProps) {
  const selection = useContext(SelectionContext)
  if (selection !== null) {
    const range = selectedRange(selection, y)
    if (range !== null) {
      const lineWidth = textWidth(text)
      const start = Math.max(range.start, col)
      const end = Math.min(range.end, col + lineWidth)
      if (start < end) {
        const startIndex = colToCharIndex(text, start - col)
        const endIndex = colToCharIndex(text, end - col)
        return (
          <Text inverse={inverse} color={color}>
            {text.slice(0, startIndex)}
            <Text backgroundColor="white" color="black">{text.slice(startIndex, endIndex)}</Text>
            {text.slice(endIndex)}
          </Text>
        )
      }
    }
  }
  return <Text inverse={inverse} color={color}>{text}</Text>
}