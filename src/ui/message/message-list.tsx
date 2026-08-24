import { Box, useInput } from 'ink'
import type { Message } from '../../model/message.ts'
import { rowIndexFor, scrollbarGeometry } from './layout.ts'
import { MessageRow } from './message-row.tsx'
import { colors } from '../../theme.ts'
import { SCROLLBAR_COL_FROM_EDGE } from '../../core/metrics.ts'
import { Region } from '../region.tsx'

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
    if (!interactive) return
    if (key.pageUp) onScroll(scrollTop - height + 2)
    if (key.pageDown) onScroll(scrollTop + height - 2)
    if (key.ctrl && input === 'u') onScroll(scrollTop - halfPage)
    if (key.ctrl && input === 'd') onScroll(scrollTop + halfPage)
  })
  const rows = []
  const endRow = Math.min(scrollTop + height, total)
  for (let row = scrollTop; row < endRow; row++) {
    const info = index.rowAt(row)
    if (info) rows.push(<MessageRow key={row} info={info} row={row} themeTick={themeTick} spinnerTick={spinnerTick} />)
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
            left={width - SCROLLBAR_COL_FROM_EDGE}
            width={1}
            height={height}
            backgroundColor={colors.scrollTrackBackground}
          />
          <Box
            position="absolute"
            top={scrollbar.top}
            left={width - SCROLLBAR_COL_FROM_EDGE}
            width={1}
            height={scrollbar.height}
            backgroundColor={colors.scrollThumbBackground}
          />
        </>
      )}
    </Box>
  )
}
