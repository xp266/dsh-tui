import { Box, Text } from 'ink'
import { memo } from 'react'
import { colors } from '../../theme.ts'
import { headerSymbol, SPINNER_FRAMES } from './layout.ts'
import type { RowInfo } from './layout.ts'
import { HighlightedText } from '../selection.tsx'

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
          <HighlightedText y={screenRow} col={2} text={' '.repeat(info.backgroundWidth)} />
        </Box>
      )
    case 'text':
      return (
        <Box
          marginLeft={2}
          width={info.backgroundWidth}
          paddingLeft={2}
          paddingRight={2}
          backgroundColor={info.background ? backgroundFor(info.role) : undefined}
        >
          <HighlightedText
            text={info.text || ' '}
            y={screenRow}
            col={4}
            color={info.role === 'error' ? colors.errorText : info.muted ? colors.toolBodyText : undefined}
          />
        </Box>
      )
    case 'header': {
      const symbol = info.running ? SPINNER_FRAMES[spinnerFrame % SPINNER_FRAMES.length] : headerSymbol(info.running, info.collapsed)
      return <HighlightedText y={screenRow} col={0} text={`  ${symbol} ${info.label}`} color={colors.toolLabel} />
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
      (a.kind !== 'header' || prev.spinnerFrame === next.spinnerFrame)
    )
  },
)

function backgroundFor(role: RowInfo['role']): string {
  return role === 'user' ? colors.userBubbleBackground : colors.aiBubbleBackground
}