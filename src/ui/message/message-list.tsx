import { Box, Text, useInput } from 'ink'
import { isKeyConsumed } from '../key-arbiter.ts'
import type { Message } from '../../model/message.ts'
import { rowIndexFor, scrollbarGeometry } from './layout.ts'
import { MessageRow } from './message-row.tsx'
import { textWidth } from '../../core/text.ts'
import { COLORS } from '../../theme.ts'
import { scrollbarColumn } from '../layout-service.ts'
import { Region } from '../region.tsx'
import { dshVersionLine, homeLogoLineColors, homeLogoMetrics, shiftLogoDownHalfRow, tuiVersion, useHomeLogo } from '../home-logo.ts'

interface MessageListProps {
  messages: Message[]
  height: number
  width: number
  scrollTop: number
  onScroll: (next: number) => void
  interactive?: boolean
  themeTick?: number
}

/** Gap between the artwork's right edge and an appended version label. */
const VERSION_GAP = 2

export function MessageList({ messages, height, width, scrollTop, onScroll, interactive = true, themeTick = 0 }: MessageListProps) {
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
    // Shift the block artwork down half a cell so its bottom edge meets the
    // vertically centered version text.
    const clean = shiftLogoDownHalfRow(logo?.lines.map(line => line.trimEnd()) ?? [])
    const metrics = homeLogoMetrics(clean)
    const dshtuiVersionLine = `dshtui ${tuiVersion()}`
    const versionWidth = Math.max(dshVersionLine().length, dshtuiVersionLine.length)
    // The labels hug the bottom word's ink (narrower than the widest row);
    // the anchor is the widest of the two label rows so the labels line up
    // even when the shifted artwork leaves them different lengths.
    const anchorWidth = clean.length >= 2
      ? Math.max(textWidth(clean[clean.length - 2]!.trimEnd()), textWidth(clean[clean.length - 1]!.trimEnd()))
      : metrics.columns
    // The version labels hang right of the centered artwork block, so the
    // width must hold the label at its overhanging position.
    const fits = logo !== undefined && width >= 2 * (anchorWidth + VERSION_GAP + versionWidth) - metrics.columns && height >= metrics.rows
    const colors = homeLogoLineColors(clean, COLORS.homeLogoTop, COLORS.homeLogoBottom)
    const left = Math.floor((width - metrics.columns) / 2)
    const rowText = (i: number): string => {
      const artwork = clean[i]!.padEnd(i >= clean.length - 2 ? anchorWidth : metrics.columns)
      if (i === clean.length - 1) return `${artwork}${' '.repeat(VERSION_GAP)}${dshtuiVersionLine}`
      if (i === clean.length - 2) return `${artwork}${' '.repeat(VERSION_GAP)}${dshVersionLine()}`
      return artwork
    }
    return (
      <Box width={width} height={height} flexDirection="column" justifyContent="center" overflow="hidden">
        {fits && colors.map((color, i) => (
          <Box key={i} marginLeft={left}>
            <Text color={color}>{rowText(i)}</Text>
          </Box>
        ))}
      </Box>
    )
  }
  const rows = []
  const endRow = Math.min(scrollTop + height, total)
  for (let row = scrollTop; row < endRow; row++) {
    const info = index.rowAt(row)
    if (info) rows.push(<MessageRow key={`${info.messageId}:${info.lineNo}`} info={info} row={row} themeTick={themeTick} />)
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
