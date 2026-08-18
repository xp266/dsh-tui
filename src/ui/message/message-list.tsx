import { Box, useInput } from 'ink'
import { useEffect, useMemo, useState } from 'react'
import type { Message } from '../../model/message.ts'
import { buildRowIndex } from './layout.ts'
import { MessageRow } from './message-row.tsx'

interface MessageListProps {
  messages: Message[]
  height: number
  width: number
  scrollTop: number
  onScroll: (next: number) => void
  interactive?: boolean
}

export function MessageList({ messages, height, width, scrollTop, onScroll, interactive = true }: MessageListProps) {
  const [spinnerFrame, setSpinnerFrame] = useState(0)
  const index = useMemo(() => buildRowIndex(messages, width), [messages, width])
  const total = index.total
  const halfPage = Math.max(1, Math.ceil(height / 2))
  useEffect(() => {
    if (!interactive) return
    if (!messages.some(m => m.kind === 'collapsible' && m.running)) return
    const timer = setInterval(() => setSpinnerFrame(f => (f + 1) % 10), 100)
    return () => clearInterval(timer)
  }, [messages, interactive])
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
    if (info) rows.push(<MessageRow key={row} info={info} row={row} screenRow={row - scrollTop} spinnerFrame={spinnerFrame} />)
  }
  return (
    <Box height={height} flexDirection="column" overflow="hidden">
      {rows}
    </Box>
  )
}