import { createContext, useContext } from 'react'
import { Text } from 'ink'
import { colToCharIndex, textWidth } from '../utils/text.ts'
import { selectedRange } from '../model/selection.ts'
import type { LineSelection } from '../model/selection.ts'

export const SelectionContext = createContext<LineSelection | null>(null)

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
