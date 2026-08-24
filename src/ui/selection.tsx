import { createContext, useContext, memo } from 'react'
import type { ReactNode } from 'react'
import { useLayoutEffect, useRef } from 'react'
import { Text } from 'ink'
import { colToCharIndex, textWidth } from '../core/text.ts'
import { selectedRange } from '../model/selection.ts'
import type { LineSelection } from '../model/selection.ts'
import { envelopeOverlaps, registerRowPiece } from './selection-registry.ts'
import { useOrigin } from './region.tsx'
import type { Segment } from './message/markdown.ts'
import { colors } from '../theme.ts'

export const SelectionContext = createContext<LineSelection | null>(null)

export interface SelectableTextProps {
  y: number
  col: number
  text?: string
  segments?: Segment[]
  color?: string
  bold?: boolean
  inverse?: boolean
  backgroundColor?: string
  messageLayer?: boolean
  flow?: boolean
}

export const SelectableText = memo(function SelectableText({ y, col, text, segments, color, bold = false, inverse = false, backgroundColor, messageLayer = false, flow = false }: SelectableTextProps) {
  const selection = useContext(SelectionContext)
  const origin = useOrigin()
  const absY = origin.y + y
  const absCol = origin.x + col
  const content = text ?? (segments?.map(segment => segment.text).join('') ?? '')
  const pieceId = useRef({})
  useLayoutEffect(() => {
    registerRowPiece(pieceId.current, absY, { col: absCol, text: content, ...(messageLayer ? { layer: 'message' as const } : {}) })
    return () => registerRowPiece(pieceId.current, absY, null)
  }, [absY, absCol, content, messageLayer])
  const range = selection === null ? null : selectedRange(selection, absY)
  const gated = !flow && selection !== null && range !== null && !envelopeOverlaps(selection, absCol, textWidth(content))
  if (selection !== null && range !== null && !gated) {
    const lineWidth = textWidth(content)
    const start = Math.max(range.start, absCol)
    const end = Math.min(range.end, absCol + lineWidth)
    if (start < end) {
      const startIndex = colToCharIndex(content, start - absCol)
      const endIndex = colToCharIndex(content, end - absCol)
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
        <Text backgroundColor={backgroundColor} inverse={inverse} color={color} bold={bold}>
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
    <Text backgroundColor={backgroundColor} inverse={inverse} color={color} bold={bold}>
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
      <Text key={out.length} color={segment.style.color ?? baseColor} bold={segment.style.bold} italic={segment.style.italic} underline={segment.style.underline} strikethrough={segment.style.strike}>
        {segment.text.slice(from, to)}
      </Text>,
    )
  }
  return out
}