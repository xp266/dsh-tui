import { Box, useInput } from 'ink'
import type { Message } from '../../model/message.ts'
import { rowIndexFor } from './layout.ts'
import { MessageRow } from './message-row.tsx'
import { Region } from '../region.tsx'

interface MessageListProps {
  messages: Message[]
  height: number
  width: number
  scrollTop: number
  onScroll: (next: number) => void
  interactive?: boolean
  themeTick?: number
}

export function MessageList({ messages, height, width, scrollTop, onScroll, interactive = true, themeTick = 0 }: MessageListProps) {
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
    if (info) rows.push(<MessageRow key={row} info={info} row={row} themeTick={themeTick} />)
  }
  return (
    <Box height={height} flexDirection="column" overflow="hidden">
      <Region y={-scrollTop}>
        {rows}
      </Region>
    </Box>
  )
}