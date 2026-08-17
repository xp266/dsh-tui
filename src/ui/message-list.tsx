import { Box, useInput } from 'ink'
import { useEffect, useMemo, useState } from 'react'
import type { Message } from '../state/messages.ts'
import { rowCount, rowInfoAt } from './layout.ts'
import { MessageRow } from './message-row.tsx'
import { SelectionContext } from './text-line.tsx'
import type { SelectionRect } from './layout.ts'

interface MessageListProps {
  messages: Message[]
  height: number
  width: number
  selection: SelectionRect | null
  scrollTop: number
  onScroll: (next: number) => void
  interactive?: boolean
}

export function MessageList({ messages, height, width, selection, scrollTop, onScroll, interactive = true }: MessageListProps) {
  const [spinnerFrame, setSpinnerFrame] = useState(0)
  const total = useMemo(() => rowCount(messages, width), [messages, width])
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
    const info = rowInfoAt(messages, width, row)
    if (info) rows.push(<MessageRow key={row} info={info} row={row} spinnerFrame={spinnerFrame} />)
  }
  return (
    <Box height={height} flexDirection="column" overflow="hidden">
      <SelectionContext.Provider value={selection}>{rows}</SelectionContext.Provider>
    </Box>
  )
}