import { createContext, useContext } from 'react'
import { Text } from 'ink'
import { colToCharIndex, textWidth } from '../utils/text.ts'

export interface LineSelection {
  anchorRow: number
  anchorCol: number
  focusRow: number
  focusCol: number
  anchorInMessage: boolean
  focusInMessage: boolean
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
  const rawAnchor = selection.anchorInMessage ? selection.anchorRow - scrollTop : selection.anchorRow
  const rawFocus = selection.focusInMessage ? selection.focusRow - scrollTop : selection.focusRow
  const visible = (row: number) => row >= 0 && row < messageHeight
  const anchorVisible = !selection.anchorInMessage || visible(rawAnchor)
  const focusVisible = !selection.focusInMessage || visible(rawFocus)
  if (!anchorVisible && !focusVisible) return null
  const clampRow = (row: number, inMessage: boolean): number => {
    if (!inMessage) return row
    return row < 0 ? 0 : row >= messageHeight ? messageHeight - 1 : row
  }
  return {
    anchorRow: clampRow(rawAnchor, selection.anchorInMessage),
    anchorCol: selection.anchorCol,
    focusRow: clampRow(rawFocus, selection.focusInMessage),
    focusCol: selection.focusCol,
    anchorInMessage: selection.anchorInMessage,
    focusInMessage: selection.focusInMessage,
  }
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