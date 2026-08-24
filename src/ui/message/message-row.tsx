import { Box, Text } from 'ink'
import { memo, useEffect, useState } from 'react'
import { colors } from '../../theme.ts'
import { headerSymbol, SPINNER_FRAMES, HEADER_LABEL_COL } from './layout.ts'
import type { RowInfo } from './layout.ts'
import { SelectableText } from '../selection.tsx'

function TickGlyph({ y, col, color }: { y: number; col: number; color?: string }): ReturnType<typeof SelectableText> {
  const [tick, setTick] = useState(0)
  useEffect(() => {
    const timer = setInterval(() => setTick(t => (t + 1) % SPINNER_FRAMES.length), 100)
    return () => clearInterval(timer)
  }, [])
  return (
    <SelectableText
      y={y}
      col={col}
      text={`${SPINNER_FRAMES[tick % SPINNER_FRAMES.length]} `}
      color={color}
      messageLayer
    />
  )
}

interface MessageRowProps {
  info: RowInfo
  row: number
  themeTick?: number
}

export const MessageRow = memo(
  function MessageRow({ info, row, themeTick = 0 }: MessageRowProps) {
  switch (info.kind) {
    case 'pad':
      return (
        <Box marginLeft={2} width={info.backgroundWidth} backgroundColor={backgroundFor(info.role)}>
          <Text>{' '.repeat(info.backgroundWidth)}</Text>
        </Box>
      )
    case 'text': {
      const col = info.colStart
      const marginLeft = col >= 2 ? 2 : col
      const paddingLeft = col >= 2 ? col - 2 : 0
      const baseColor = info.role === 'error' ? colors.errorText : info.muted ? colors.toolBodyText : undefined
      return (
        <Box
          marginLeft={marginLeft}
          width={info.backgroundWidth}
          paddingLeft={info.spinner ? 0 : paddingLeft}
          paddingRight={2}
          backgroundColor={info.background ? backgroundFor(info.role) : undefined}
        >
          {info.spinner && <TickGlyph y={row} col={col - 2} color={baseColor} />}
          {info.segments !== undefined && info.segments.length > 0 ? (
            <SelectableText y={row} col={col} segments={info.segments} color={baseColor} messageLayer flow />
          ) : (
            <SelectableText
              text={info.text || ' '}
              y={row}
              col={col}
              color={baseColor}
              messageLayer
              flow
            />
          )}
        </Box>
      )
    }
    case 'header': {
      const symbol = headerSymbol(info.collapsed)
      const color = info.thinking ? colors.thinkingLabel : colors.toolLabel
      if (info.spinner) {
        return (
          <Box>
            <SelectableText y={row} col={0} text={'  '} color={color} messageLayer />
            <TickGlyph y={row} col={2} color={color} />
            <SelectableText y={row} col={HEADER_LABEL_COL} text={info.label} color={color} messageLayer />
          </Box>
        )
      }
      return (
        <Box>
          <SelectableText y={row} col={0} text={`  ${symbol} `} color={color} messageLayer />
          <SelectableText y={row} col={HEADER_LABEL_COL} text={info.label} color={color} messageLayer />
        </Box>
      )
    }
    case 'blank':
      return <Text> </Text>
  }
  },
  (prev, next) => {
    if (prev.row !== next.row) return false
    if (prev.themeTick !== next.themeTick) return false
    const a = prev.info
    const b = next.info
    return (
      a.kind === b.kind &&
      a.text === b.text &&
      a.label === b.label &&
      a.role === b.role &&
      a.muted === b.muted &&
      a.background === b.background &&
      a.backgroundWidth === b.backgroundWidth &&
      a.colStart === b.colStart &&
      a.selectable === b.selectable &&
      a.clickable === b.clickable &&
      a.collapsed === b.collapsed &&
      a.thinking === b.thinking &&
      a.segKey === b.segKey &&
      a.spinner === b.spinner
    )
  },
)

function backgroundFor(role: RowInfo['role']): string {
  return role === 'user' ? colors.userBubbleBackground : colors.aiBubbleBackground
}