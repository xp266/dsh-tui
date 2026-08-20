import { Box, Text } from 'ink'
import { memo } from 'react'
import { colors } from '../../theme.ts'
import { headerSymbol, SPINNER_FRAMES } from './layout.ts'
import type { RowInfo } from './layout.ts'
import { SelectableText } from '../selection.tsx'

interface MessageRowProps {
  info: RowInfo
  row: number
  screenRow: number
  spinnerFrame: number
}

export const MessageRow = memo(
  function MessageRow({ info, row, screenRow, spinnerFrame }: MessageRowProps) {
  switch (info.kind) {
    case 'pad':
      return (
        <Box marginLeft={2} width={info.backgroundWidth} backgroundColor={backgroundFor(info.role)}>
          <SelectableText y={screenRow} col={2} text={' '.repeat(info.backgroundWidth)} />
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
            <SelectableText y={screenRow} col={col} segments={info.segments} color={baseColor} />
          ) : (
            <SelectableText
              text={info.text || ' '}
              y={screenRow}
              col={col}
              color={baseColor}
            />
          )}
        </Box>
      )
    }
    case 'header': {
      const symbol = info.running ? SPINNER_FRAMES[spinnerFrame % SPINNER_FRAMES.length] : headerSymbol(info.running, info.collapsed)
      return <SelectableText y={screenRow} col={0} text={`  ${symbol} ${info.label}`} color={colors.toolLabel} />
    }
    case 'blank':
      return <Text> </Text>
  }
  },
  (prev, next) => {
    if (prev.row !== next.row) return false
    if (prev.screenRow !== next.screenRow) return false
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
      a.segKey === b.segKey &&
      (a.kind !== 'header' || prev.spinnerFrame === next.spinnerFrame)
    )
  },
)

function backgroundFor(role: RowInfo['role']): string {
  return role === 'user' ? colors.userBubbleBackground : colors.aiBubbleBackground
}