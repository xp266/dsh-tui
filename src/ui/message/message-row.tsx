import { Box, Text } from 'ink'
import { memo } from 'react'
import { COLORS } from '../../theme.ts'
import { glyphs } from '../../terminal/glyphs.ts'
import { headerSymbol, HEADER_LABEL_COL } from './layout.ts'
import type { RowInfo } from './layout.ts'
import { SelectableText } from '../selection.tsx'

function TickGlyph({ y, col, color, tick }: { y: number; col: number; color?: string; tick: number }): ReturnType<typeof SelectableText> {
  return (
    <SelectableText
      y={y}
      col={col}
      text={`${glyphs.spinnerFrames[tick % glyphs.spinnerFrames.length]} `}
      color={color}
      messageLayer
    />
  )
}

interface MessageRowProps {
  info: RowInfo
  row: number
  themeTick?: number
  spinnerTick?: number
}

export const MessageRow = memo(
  function MessageRow({ info, row, themeTick = 0, spinnerTick = 0 }: MessageRowProps) {
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
      const baseColor = info.role === 'error' ? COLORS.errorText : info.muted ? COLORS.toolBodyText : undefined
      return (
        <Box
          marginLeft={marginLeft}
          width={info.backgroundWidth}
          paddingLeft={info.spinner ? 0 : paddingLeft}
          backgroundColor={info.lineBg ?? (info.background ? backgroundFor(info.role) : undefined)}
        >
          {info.spinner && <TickGlyph y={row} col={col - 2} color={info.accent ?? baseColor} tick={spinnerTick} />}
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
      const color = COLORS.toolLabel
      return (
        <Box>
          {info.spinner ? (
            <>
              <SelectableText y={row} col={0} text={'  '} color={color} messageLayer />
              <TickGlyph y={row} col={2} color={color} tick={spinnerTick} />
            </>
          ) : (
            <SelectableText y={row} col={0} text={`  ${symbol} `} color={color} messageLayer />
          )}
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
    if ((prev.info.spinner ?? false) && prev.spinnerTick !== next.spinnerTick) return false
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
      a.spinner === b.spinner &&
      a.accent === b.accent &&
      a.lineBg === b.lineBg
    )
  },
)

function backgroundFor(role: RowInfo['role']): string {
  return role === 'user' ? COLORS.userBubbleBackground : COLORS.aiBubbleBackground
}