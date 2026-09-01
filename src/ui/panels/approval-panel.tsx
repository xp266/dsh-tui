import { Box, Text, useInput } from 'ink'
import { panelAnchorRow } from '../layout-service.ts'
import { isKeyConsumed } from '../key-arbiter.ts'
import { useEffect, useState } from 'react'
import type { Ref } from 'react'
import { useImperativeHandle } from 'react'
import { wrapLines } from '../../core/text.ts'
import { mergeRuns } from '../../core/segments.ts'
import type { Segment } from '../../core/segments.ts'
import { COLORS } from '../../theme.ts'
import { glyphs } from '../../terminal/glyphs.ts'
import { CHROME_TEXT_X } from '../../core/metrics.ts'
import { writeCursorShape } from '../../terminal/cursor-shape.ts'
import { SelectableText } from '../selection.tsx'
import { PanelSurface, panelLegend } from './surface.tsx'
import type { PanelPointerHandle, PanelRow } from './surface.tsx'

export type { PanelPointerHandle } from './surface.tsx'

export const APPROVAL_SECTION_ROWS = 3
const BUTTON_GAP_TEXT = ' '.repeat(8)
const BUTTON_ALLOW_TEXT = 'Allow once'
const ALLOW_BLOCK = ` ${BUTTON_ALLOW_TEXT} `
const REJECT_BLOCK = ' Reject '
export const APPROVAL_BUTTON_COLS = {
  allow: CHROME_TEXT_X,
  reject: CHROME_TEXT_X + ALLOW_BLOCK.length + BUTTON_GAP_TEXT.length,
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
    rows.push([])
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
  const body: PanelRow[] = []
  for (const row of visibleReason) body.push({ segments: row })
  if (visibleReason.length > 0) body.push({ segments: [] })
  if (showCommand) {
    for (const row of commandSection(visibleCommand)) body.push({ segments: row })
    body.push({ segments: [] })
  }
  const buttonRowIndex = body.length
  const legend = panelLegend([
    { key: glyphs.pageFlip, description: 'select' },
    { key: 'enter', description: 'submit' },
  ])
  body.push({ segments: mergeRuns([{ text: BUTTON_ALLOW_TEXT + BUTTON_GAP_TEXT + 'Reject', style: {} }]) })
  body.push({ segments: [] })
  body.push({ segments: legend })
  const bodyCount = body.length
  const totalHeight = bodyCount + 2
  const bodyStart = panelAnchorRow(rows, bodyCount)
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
      if (y !== bodyStart + buttonRowIndex) return
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
  const buttonY = bodyStart + buttonRowIndex
  return (
    <PanelSurface
      columns={columns}
      rows={rows}
      body={body.map((row, index) => index === buttonRowIndex
        ? {
            segments: row.segments,
            content: (
              <Box flexDirection="row">
                <SelectableText y={buttonY} col={APPROVAL_BUTTON_COLS.allow} text={ALLOW_BLOCK} inverse={focusAllow} />
                <Text>{BUTTON_GAP_TEXT}</Text>
                <SelectableText y={buttonY} col={APPROVAL_BUTTON_COLS.reject} text={REJECT_BLOCK} inverse={!focusAllow} />
              </Box>
            ),
          }
        : row)}
      bodyStart={bodyStart}
      background={background}
      blockWidth={blockWidth}
    />
  )
}
