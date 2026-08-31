import { Box, Text, useInput } from 'ink'
import { isKeyConsumed } from '../key-arbiter.ts'
import { useEffect, useState } from 'react'
import type { ReactNode, Ref } from 'react'
import { useImperativeHandle } from 'react'
import { wrapLines, padToWidth, textWidth } from '../../core/text.ts'
import { mergeRuns } from '../../core/segments.ts'
import type { Segment } from '../../core/segments.ts'
import { COLORS } from '../../theme.ts'
import { glyphs } from '../../terminal/glyphs.ts'
import { CHROME_MARGIN_X, CHROME_PAD_X, CHROME_TEXT_X } from '../../core/metrics.ts'
import { writeCursorShape } from '../../terminal/cursor-shape.ts'
import { SelectableText } from '../selection.tsx'
import { Region } from '../region.tsx'

export const APPROVAL_SECTION_ROWS = 3
const BUTTON_GAP_TEXT = ' '.repeat(8)
const BUTTON_ALLOW_TEXT = 'Allow once'
const ALLOW_BLOCK = ` ${BUTTON_ALLOW_TEXT} `
const REJECT_BLOCK = ' Reject '
export const APPROVAL_BUTTON_COLS = {
  allow: CHROME_TEXT_X,
  reject: CHROME_TEXT_X + ALLOW_BLOCK.length + BUTTON_GAP_TEXT.length,
}

export interface PanelPointerHandle {
  clickAt(y: number, x: number): void
  wheel(dir: -1 | 1): boolean
}

export interface ApprovalPanelProps {
  handleRef?: Ref<PanelPointerHandle>
  reason?: string
  command?: string
  background: string
  active: boolean
  columns: number
  rows: number
  innerWidth: number
  blockWidth: number
  onDecide(outcome: 'allowed-once' | 'rejected'): void
  onResize(height: number): void
}

function section(text: string | undefined, innerWidth: number): string[] {
  if (text === undefined || text.trim() === '') return []
  return wrapLines(text, innerWidth)
}

function reasonSection(raw: string | undefined, innerWidth: number): Segment[][] {
  if (raw === undefined || raw.trim() === '') return []
  const colon = raw.indexOf(':')
  const rows: Segment[][] = []
  if (colon === -1) {
    for (const line of wrapLines(raw, Math.max(4, innerWidth))) {
      rows.push([{ text: line, style: { color: COLORS.errorText } }])
    }
    return rows
  }
  rows.push([{ text: raw.slice(0, colon + 1), style: { color: COLORS.errorText } }])
  const description = raw.slice(colon + 1).trim()
  if (description !== '') {
    for (const line of wrapLines(description, Math.max(4, innerWidth))) {
      rows.push([{ text: line, style: {} }])
    }
  }
  return rows
}

function commandSection(lines: string[]): Segment[][] {
  return lines.map(line => [{ text: line, style: { color: COLORS.warning } }])
}

function clamp(value: number, max: number): number {
  return Math.max(0, Math.min(max, value))
}

export function ApprovalPanel({ handleRef, reason, command, background, active, columns, rows, innerWidth, blockWidth, onDecide, onResize }: ApprovalPanelProps) {
  const [focusAllow, setFocusAllow] = useState(true)
  const [scroll, setScroll] = useState({ reason: 0, command: 0 })
  const allReason = reasonSection(reason, innerWidth)
  const allCommand = section(command, innerWidth)
  const reasonOverflow = Math.max(0, allReason.length - APPROVAL_SECTION_ROWS)
  const commandOverflow = Math.max(0, allCommand.length - APPROVAL_SECTION_ROWS)
  useEffect(() => {
    setScroll(current => ({
      reason: Math.min(current.reason, reasonOverflow),
      command: Math.min(current.command, commandOverflow),
    }))
  }, [reasonOverflow, commandOverflow])
  const visibleReason = allReason.slice(scroll.reason, scroll.reason + APPROVAL_SECTION_ROWS)
  const visibleCommand = allCommand.slice(scroll.command, scroll.command + APPROVAL_SECTION_ROWS)
  const showCommand = visibleCommand.some(line => line.trim() !== '')
  const body: Segment[][] = [...visibleReason]
  body.push([])
  if (showCommand) {
    body.push(...commandSection(visibleCommand))
    body.push([])
  }
  body.push([{ text: BUTTON_ALLOW_TEXT + BUTTON_GAP_TEXT + 'Reject', style: {} }])
  const bodyCount = body.length
  const totalHeight = bodyCount + 2
  const bodyStart = rows - 2 - bodyCount
  useEffect(() => {
    writeCursorShape('hide')
    return () => {
      writeCursorShape('show')
      writeCursorShape('reset')
    }
  }, [])
  useEffect(() => {
    onResize(totalHeight)
  }, [totalHeight])
  useImperativeHandle(handleRef, () => ({
    clickAt(y, x) {
      if (!active) return
      if (y !== bodyStart + bodyCount - 1) return
      if (x >= APPROVAL_BUTTON_COLS.allow && x < APPROVAL_BUTTON_COLS.allow + ALLOW_BLOCK.length) {
        onDecide('allowed-once')
        return
      }
      if (x >= APPROVAL_BUTTON_COLS.reject && x < APPROVAL_BUTTON_COLS.reject + REJECT_BLOCK.length) {
        onDecide('rejected')
      }
    },
    wheel(dir) {
      if (!active) return false
      const delta = dir === -1 ? -1 : 1
      if (reasonOverflow > 0) {
        setScroll(current => ({ ...current, reason: clamp(current.reason + delta, reasonOverflow) }))
        return true
      }
      if (commandOverflow > 0) {
        setScroll(current => ({ ...current, command: clamp(current.command + delta, commandOverflow) }))
        return true
      }
      return false
    },
  }))
  useInput((input, key) => {
    if (!active || isKeyConsumed()) return
    if (key.leftArrow || key.rightArrow || key.tab) {
      setFocusAllow(current => !current)
      return
    }
    if (key.upArrow || key.downArrow) {
      const delta = key.upArrow ? -1 : 1
      if (reasonOverflow > 0) {
        setScroll(current => ({ ...current, reason: clamp(current.reason + delta, reasonOverflow) }))
      } else if (commandOverflow > 0) {
        setScroll(current => ({ ...current, command: clamp(current.command + delta, commandOverflow) }))
      }
      return
    }
    if (key.return) {
      onDecide(focusAllow ? 'allowed-once' : 'rejected')
      return
    }
    if (key.escape) {
      onDecide('rejected')
    }
  })
  const buttonY = bodyStart + bodyCount - 1
  return (
    <PanelSurface
      columns={columns}
      rows={rows}
      body={body}
      bodyStart={bodyStart}
      background={background}
      blockWidth={blockWidth}
      buttonRow={(
        <Box flexDirection="row">
          <SelectableText y={buttonY} col={APPROVAL_BUTTON_COLS.allow} text={ALLOW_BLOCK} inverse={focusAllow} />
          <SelectableText y={buttonY} col={APPROVAL_BUTTON_COLS.allow + ALLOW_BLOCK.length} text={BUTTON_GAP_TEXT} />
          <SelectableText y={buttonY} col={APPROVAL_BUTTON_COLS.reject} text={REJECT_BLOCK} inverse={!focusAllow} />
        </Box>
      )}
    />
  )
}

export function PanelSurface({ columns, rows, body, bodyStart, background, blockWidth, buttonRow }: {
  columns: number
  rows: number
  body: Segment[][]
  bodyStart: number
  background: string
  blockWidth: number
  buttonRow?: ReactNode
}) {
  return (
    <Region>
      <Box position="absolute" top={0} left={0} width={columns} height={rows}>
        <Box position="absolute" top={bodyStart - 1} left={CHROME_MARGIN_X} width={blockWidth}>
          {glyphs.halfBlockCaps
            ? <Text color={background}>{glyphs.blockCapTop.repeat(blockWidth)}</Text>
            : <Text backgroundColor={background}>{' '.repeat(blockWidth)}</Text>}
        </Box>
        {body.map((row, index) => {
          const padded = padRow(row, blockWidth - CHROME_PAD_X * 2)
          return (
            <Box
              key={`panel-row-${index}`}
              position="absolute"
              top={bodyStart + index}
              left={CHROME_MARGIN_X}
              width={blockWidth}
              paddingLeft={CHROME_PAD_X}
              paddingRight={CHROME_PAD_X}
              backgroundColor={background}
            >
              {buttonRow !== undefined && index === body.length - 1
                ? buttonRow
                : <SelectableText y={bodyStart + index} col={CHROME_TEXT_X} segments={padded.length > 0 ? padded : [{ text: ' ', style: {} }]} />}
            </Box>
          )
        })}
        <Box position="absolute" top={bodyStart + body.length} left={CHROME_MARGIN_X} width={blockWidth}>
          {glyphs.halfBlockCaps
            ? <Text color={background}>{glyphs.blockCapBottom.repeat(blockWidth)}</Text>
            : <Text backgroundColor={background}>{' '.repeat(blockWidth)}</Text>}
        </Box>
      </Box>
    </Region>
  )
}

function padRow(row: Segment[], width: number): Segment[] {
  const used = textWidth(row.map(segment => segment.text).join(''))
  if (used >= width) return row
  return mergeRuns([...row, { text: ' '.repeat(width - used), style: {} }])
}
