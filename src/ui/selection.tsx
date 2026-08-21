import { createContext, useContext, memo } from 'react'
import type { ReactNode } from 'react'
import { Text } from 'ink'
import { colToCharIndex, textWidth } from '../utils/text.ts'
import { selectedRange } from '../model/selection.ts'
import type { LineSelection } from '../model/selection.ts'
import type { Segment } from './message/markdown.ts'
import { colors } from '../theme.ts'

export const SelectionContext = createContext<LineSelection | null>(null)

export interface SelectableTextProps {
  y: number
  col: number
  text?: string
  segments?: Segment[]
  color?: string
  inverse?: boolean
  backgroundColor?: string
}

export const SelectableText = memo(function SelectableText({ y, col, text, segments, color, inverse = false, backgroundColor }: SelectableTextProps) {
  const selection = useContext(SelectionContext)
  const content = text ?? (segments?.map(segment => segment.text).join('') ?? '')
  const range = selection === null ? null : selectedRange(selection, y)
  if (range !== null) {
    const lineWidth = textWidth(content)
    const start = Math.max(range.start, col)
    const end = Math.min(range.end, col + lineWidth)
    if (start < end) {
      const startIndex = colToCharIndex(content, start - col)
      const endIndex = colToCharIndex(content, end - col)
      const highlight = (
        <Text backgroundColor={colors.selectionBg} color={colors.selectionFg}>
          {content.slice(startIndex, endIndex)}
        </Text>
      )
      if (segments !== undefined) {
        return (
          <Text backgroundColor={backgroundColor}>
            {renderSegments(segments, 0, startIndex, color)}
            {highlight}
            {renderSegments(segments, endIndex, content.length, color)}
          </Text>
        )
      }
      return (
        <Text backgroundColor={backgroundColor} inverse={inverse} color={color}>
          {content.slice(0, startIndex)}
          {highlight}
          {content.slice(endIndex)}
        </Text>
      )
    }
  }
  if (segments !== undefined) {
    return <Text backgroundColor={backgroundColor}>{renderSegments(segments, 0, content.length, color)}</Text>
  }
  return (
    <Text backgroundColor={backgroundColor} inverse={inverse} color={color}>
      {content}
    </Text>
  )
})

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