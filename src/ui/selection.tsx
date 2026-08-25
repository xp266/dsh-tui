import { createContext, useContext, memo } from 'react'
import type { ReactNode } from 'react'
import { useLayoutEffect, useRef } from 'react'
import { Text } from 'ink'
import { colToCharIndex, textWidth } from '../core/text.ts'
import { selectedRange } from '../model/selection.ts'
import type { LineSelection } from '../model/selection.ts'
import { envelopeOverlaps, registerRowPiece } from './selection-registry.ts'
import { useOrigin } from './region.tsx'
import type { Segment } from '../core/segments.ts'
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

interface SelectableContentProps {
  content: string
  segments?: Segment[]
  color?: string
  bold: boolean
  inverse: boolean
  backgroundColor?: string
  sliceStart: number
  sliceEnd: number
}

const SelectableContent = memo(function SelectableContent({ content, segments, color, bold, inverse, backgroundColor, sliceStart, sliceEnd }: SelectableContentProps) {
  const hasSlice = sliceStart >= 0 && sliceEnd > sliceStart
  if (hasSlice) {
    const highlight = (
      <Text backgroundColor={colors.selectionBg} color={colors.selectionFg}>
        {content.slice(sliceStart, sliceEnd)}
      </Text>
    )
    if (segments !== undefined) {
      return (
        <Text backgroundColor={backgroundColor}>
          {renderSegments(segments, 0, sliceStart, color)}
          {highlight}
          {renderSegments(segments, sliceEnd, content.length, color)}
        </Text>
      )
    }
    return (
      <Text backgroundColor={backgroundColor} inverse={inverse} color={color} bold={bold}>
        {content.slice(0, sliceStart)}
        {highlight}
        {content.slice(sliceEnd)}
      </Text>
    )
  }
  if (segments !== undefined) {
    return <Text backgroundColor={backgroundColor}>{renderSegments(segments, 0, content.length, color)}</Text>
  }
  return (
    <Text backgroundColor={backgroundColor} inverse={inverse} color={color} bold={bold}>
      {content}
    </Text>
  )
}, (prev, next) => (
  prev.content === next.content &&
  prev.segments === next.segments &&
  prev.color === next.color &&
  prev.bold === next.bold &&
  prev.inverse === next.inverse &&
  prev.backgroundColor === next.backgroundColor &&
  prev.sliceStart === next.sliceStart &&
  prev.sliceEnd === next.sliceEnd
))

export const SelectableText = function SelectableText({ y, col, text, segments, color, bold = false, inverse = false, backgroundColor, messageLayer = false, flow = false }: SelectableTextProps) {
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
  let sliceStart = -1
  let sliceEnd = -1
  if (selection !== null) {
    const range = selectedRange(selection, absY)
    if (range !== null && (flow || envelopeOverlaps(selection, absCol, textWidth(content)))) {
      const lineWidth = textWidth(content)
      const start = Math.max(range.start, absCol)
      const end = Math.min(range.end, absCol + lineWidth)
      if (start < end) {
        sliceStart = colToCharIndex(content, start - absCol)
        sliceEnd = colToCharIndex(content, end - absCol)
      }
    }
  }
  return (
    <SelectableContent
      content={content}
      segments={segments}
      color={color}
      bold={bold}
      inverse={inverse}
      backgroundColor={backgroundColor}
      sliceStart={sliceStart}
      sliceEnd={sliceEnd}
    />
  )
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
      <Text key={out.length} color={segment.style.color ?? baseColor} bold={segment.style.bold} italic={segment.style.italic} underline={segment.style.underline} strikethrough={segment.style.strike}>
        {segment.text.slice(from, to)}
      </Text>,
    )
  }
  return out
}
