import { Box, Text } from 'ink'
import { memo } from 'react'
import { colors } from '../../theme.ts'
import { headerSymbol, HEADER_LABEL_COL, SPINNER_FRAMES } from './layout.ts'
import type { RowInfo } from './layout.ts'
import { SelectableText } from '../selection.tsx'

interface MessageRowProps {
  info: RowInfo
  row: number
  spinnerFrame: number
  themeTick?: number
}

export const MessageRow = memo(
  function MessageRow({ info, row, spinnerFrame, themeTick = 0 }: MessageRowProps) {
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
          paddingLeft={paddingLeft}
          paddingRight={2}
          backgroundColor={info.background ? backgroundFor(info.role) : undefined}
        >
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
      const symbol = info.running ? SPINNER_FRAMES[spinnerFrame % SPINNER_FRAMES.length] : headerSymbol(info.running, info.collapsed)
      const color = info.thinking ? colors.thinkingLabel : colors.toolLabel
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
      a.running === b.running &&
      a.collapsed === b.collapsed &&
      a.thinking === b.thinking &&
      a.segKey === b.segKey &&
      (a.kind !== 'header' || prev.spinnerFrame === next.spinnerFrame)
    )
  },
)

function backgroundFor(role: RowInfo['role']): string {
  return role === 'user' ? colors.userBubbleBackground : colors.aiBubbleBackground
}