import { Box, Text } from 'ink'
import { memo, useSyncExternalStore } from 'react'
import { COLORS } from '../../theme.ts'
import { glyphs } from '../../terminal/glyphs.ts'
import { headerSymbol, HEADER_LABEL_COL } from './layout.ts'
import type { RowInfo } from './layout.ts'
import { SelectableText } from '../selection.tsx'
import { useSpinnerTick } from '../spinner-tick.tsx'
import { wavePalette, waveSegments } from './wave.ts'
import { hoveredMessageId, subscribeHoveredMessage } from './hover.ts'

function TickGlyph({ y, col, color }: { y: number; col: number; color?: string }): ReturnType<typeof SelectableText> {
  const tick = useSpinnerTick()
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

function WaveText({ info, row, color }: { info: RowInfo; row: number; color: string }): ReturnType<typeof SelectableText> {
  const tick = useSpinnerTick()
  const base = info.segments?.[0]?.style.bold === true ? { bold: true } : {}
  return (
    <SelectableText
      y={row}
      col={info.colStart}
      segments={waveSegments(info.text, tick, wavePalette(color), color, base)}
      messageLayer
      flow
    />
  )
}

function useHoveredMessage(id: string): boolean {
  return useSyncExternalStore(
    subscribeHoveredMessage,
    () => hoveredMessageId() === id,
    () => false,
  )
}

interface MessageRowProps {
  info: RowInfo
  row: number
  themeTick?: number
}

// The row component itself consumes no context: only the spinner, wave, and
// hover subcomponents subscribe to their ticks, so memoized rows that are not
// animating stay untouched on every tick.
export const MessageRow = memo(
  function MessageRow({ info, row, themeTick = 0 }: MessageRowProps) {
  const hovered = useHoveredMessage(info.messageId)
  switch (info.kind) {
    case 'pad':
      return (
        <Box marginLeft={2} width={info.backgroundWidth} backgroundColor={info.hoverable === true && hovered ? COLORS.hoverBackground : backgroundFor(info)}>
          <Text>{' '.repeat(info.backgroundWidth)}</Text>
        </Box>
      )
    case 'text': {
      const col = info.colStart
      const marginLeft = col >= 2 ? 2 : col
      const paddingLeft = col >= 2 ? col - 2 : 0
      const baseColor = info.role === 'error' ? COLORS.errorText : info.muted ? COLORS.toolBodyText : undefined
      const waveColor = info.segments?.[0]?.style.color ?? baseColor
      const hoverBg = info.hoverable === true && hovered ? COLORS.hoverBackground : undefined
      return (
        <Box
          marginLeft={marginLeft}
          width={info.backgroundWidth}
          paddingLeft={info.spinner ? 0 : paddingLeft}
          backgroundColor={hoverBg ?? info.lineBg ?? (info.background ? backgroundFor(info) : undefined)}
        >
          {info.spinner && <TickGlyph y={row} col={col - 2} color={info.accent ?? baseColor} />}
          {info.wave && waveColor !== undefined ? (
            <WaveText info={info} row={row} color={waveColor} />
          ) : info.segments !== undefined && info.segments.length > 0 ? (
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
              <TickGlyph y={row} col={2} color={color} />
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
      a.hoverable === b.hoverable &&
      a.surface === b.surface &&
      a.segKey === b.segKey &&
      a.spinner === b.spinner &&
      a.wave === b.wave &&
      a.accent === b.accent &&
      a.lineBg === b.lineBg
    )
  },
)

function backgroundFor(info: RowInfo): string {
  if (info.surface === 'card') return COLORS.aiBubbleBackground
  return info.role === 'user' ? COLORS.userBubbleBackground : COLORS.aiBubbleBackground
}
