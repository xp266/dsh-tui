import { createContext, useContext } from 'react'
import type { ReactNode } from 'react'
import { Text } from 'ink'
import { colToCharIndex, textWidth } from '../utils/text.ts'
import { selectedRange } from '../model/selection.ts'
import type { LineSelection } from '../model/selection.ts'
import type { Segment } from './message/markdown.ts'

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

interface RichTextProps {
  y: number
  col: number
  segments: Segment[]
  baseColor?: string
}

export function RichText({ y, col, segments, baseColor }: RichTextProps) {
  const selection = useContext(SelectionContext)
  const text = segments.map(segment => segment.text).join('')
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
          <Text>
            {renderSegments(segments, 0, startIndex, baseColor)}
            <Text backgroundColor="white" color="black">{text.slice(startIndex, endIndex)}</Text>
            {renderSegments(segments, endIndex, text.length, baseColor)}
          </Text>
        )
      }
    }
  }
  return <Text>{renderSegments(segments, 0, text.length, baseColor)}</Text>
}

function renderSegments(segments: Segment[], start: number, end: number, baseColor?: string): ReactNode[] {
  const out: ReactNode[] = []
  let offset = 0
  for (const segment of segments) {
    const segmentStart = offset
    const segmentEnd = offset + segment.text.length
    offset = segmentEnd
    if (segmentEnd <= start || segmentStart >= end) continue
    const from = Math.max(0, start - segmentStart)
    const to = Math.min(segment.text.length, end - segmentStart)
    if (from >= to) continue
    out.push(
      <Text key={out.length} color={segment.style.color ?? baseColor} bold={segment.style.bold} italic={segment.style.italic}>
        {segment.text.slice(from, to)}
      </Text>,
    )
  }
  return out
}
