import { Box, Text, useInput } from 'ink'
import { isKeyConsumed } from '../key-arbiter.ts'
import type { Message } from '../../model/message.ts'
import { rowIndexFor, scrollbarGeometry } from './layout.ts'
import { MessageRow } from './message-row.tsx'
import { COLORS } from '../../theme.ts'
import { scrollbarColumn } from '../layout-service.ts'
import { Region } from '../region.tsx'
import { homeLogoLineColors, homeLogoMetrics, useHomeLogo } from '../home-logo.ts'

interface MessageListProps {
  messages: Message[]
  height: number
  width: number
  scrollTop: number
  onScroll: (next: number) => void
  interactive?: boolean
  themeTick?: number
  spinnerTick?: number
}

export function MessageList({ messages, height, width, scrollTop, onScroll, interactive = true, themeTick = 0, spinnerTick = 0 }: MessageListProps) {
  const index = rowIndexFor(messages, width)
  const total = index.total
  const halfPage = Math.max(1, Math.ceil(height / 2))
  useInput((input, key) => {
    if (!interactive || isKeyConsumed()) return
    const maxScroll = Math.max(0, total - height)
    const scroll = (delta: number): void => {
      onScroll(Math.max(0, Math.min(maxScroll, scrollTop + delta)))
    }
    if (key.pageUp) scroll(-(height - 2))
    if (key.pageDown) scroll(height - 2)
    if (key.ctrl && input === 'u') scroll(-halfPage)
    if (key.ctrl && input === 'd') scroll(halfPage)
  })
  const logo = useHomeLogo()
  if (messages.length === 0) {
    const clean = logo?.lines.map(line => line.trimEnd()) ?? []
    const metrics = homeLogoMetrics(clean)
    const fits = logo !== undefined && width >= metrics.columns && height >= metrics.rows
    const colors = homeLogoLineColors(clean, COLORS.homeLogoTop, COLORS.homeLogoBottom)
    return (
      <Box width={width} height={height} flexDirection="column" alignItems="center" justifyContent="center" overflow="hidden">
        {fits && colors.map((color, i) => (
          <Text key={i} color={color}>{clean[i]!.padEnd(metrics.columns)}</Text>
        ))}
      </Box>
    )
  }
  const rows = []
  const endRow = Math.min(scrollTop + height, total)
  for (let row = scrollTop; row < endRow; row++) {
    const info = index.rowAt(row)
    if (info) rows.push(<MessageRow key={`${info.messageId}:${info.lineNo}`} info={info} row={row} themeTick={themeTick} spinnerTick={spinnerTick} />)
  }
  const scrollbar = scrollbarGeometry(total, height, scrollTop)
  return (
    <Box width={width} height={height} flexDirection="column" overflow="hidden">
      <Region y={-scrollTop}>
        {rows}
      </Region>
      {scrollbar !== null && (
        <>
          <Box
            position="absolute"
            top={0}
            left={scrollbarColumn(width)}
            width={1}
            height={height}
            backgroundColor={COLORS.scrollTrackBackground}
          />
          <Box
            position="absolute"
            top={scrollbar.top}
            left={scrollbarColumn(width)}
            width={1}
            height={scrollbar.height}
            backgroundColor={COLORS.scrollThumbBackground}
          />
        </>
      )}
    </Box>
  )
}
