import { Box, Text, useInput } from 'ink'
import { useEffect, useState } from 'react'
import type { ReactNode, Ref } from 'react'
import { useImperativeHandle } from 'react'
import { wrapLines, padToWidth } from '../../core/text.ts'
import { CHROME_MARGIN_X, CHROME_PAD_X, CHROME_TEXT_X } from '../../core/metrics.ts'
import { writeCursorShape } from '../../terminal/cursor-shape.ts'
import { SelectableText } from '../selection.tsx'
import { Region } from '../region.tsx'

export const APPROVAL_SECTION_ROWS = 3
const BUTTON_GAP_TEXT = ' '.repeat(8)
const BUTTON_ALLOW_TEXT = 'Allow once'
export const APPROVAL_BUTTON_COLS = {
  allow: CHROME_TEXT_X + 1,
  reject: CHROME_TEXT_X + 1 + BUTTON_ALLOW_TEXT.length + BUTTON_GAP_TEXT.length,
}

export interface PanelPointerHandle {
  clickAt(y: number, x: number): void
  wheel(dir: -1 | 1): boolean
}

interface ApprovalPanelProps {
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

export function buildApprovalBody(innerWidth: number, reason: string[], command: string[]): string[] {
  const lines = reason.slice(0, APPROVAL_SECTION_ROWS).map(line => ' ' + padToWidth(line, innerWidth - 1))
  lines.push('')
  if (command.some(line => line.trim() !== '')) {
    lines.push(...command.slice(0, APPROVAL_SECTION_ROWS).map(line => ' ' + padToWidth(line, innerWidth - 1)))
    lines.push('')
  }
  lines.push(' ' + BUTTON_ALLOW_TEXT + BUTTON_GAP_TEXT + 'Reject')
  return lines
}

function clamp(value: number, max: number): number {
  return Math.max(0, Math.min(max, value))
}

export function ApprovalPanel({ handleRef, reason, command, background, active, columns, rows, innerWidth, blockWidth, onDecide, onResize }: ApprovalPanelProps) {
  const [focusAllow, setFocusAllow] = useState(true)
  const [scroll, setScroll] = useState({ reason: 0, command: 0 })
  const allReason = section(reason, innerWidth)
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
  const body = buildApprovalBody(innerWidth, visibleReason, showCommand ? visibleCommand : [])
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
      if (x >= APPROVAL_BUTTON_COLS.allow && x <= APPROVAL_BUTTON_COLS.allow + BUTTON_ALLOW_TEXT.length) {
        onDecide(focusAllow ? 'allowed-once' : 'rejected')
        return
      }
      if (x >= APPROVAL_BUTTON_COLS.reject && x <= APPROVAL_BUTTON_COLS.reject + 'Reject'.length) {
        onDecide(focusAllow ? 'rejected' : 'allowed-once')
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
    if (!active) return
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
          <SelectableText y={buttonY} col={CHROME_TEXT_X} text=" " />
          <SelectableText y={buttonY} col={APPROVAL_BUTTON_COLS.allow} text={BUTTON_ALLOW_TEXT} inverse={focusAllow} />
          <SelectableText y={buttonY} col={APPROVAL_BUTTON_COLS.allow + BUTTON_ALLOW_TEXT.length} text={BUTTON_GAP_TEXT} />
          <SelectableText y={buttonY} col={APPROVAL_BUTTON_COLS.reject} text="Reject" inverse={!focusAllow} />
        </Box>
      )}
    />
  )
}

export function PanelSurface({ columns, rows, body, bodyStart, background, blockWidth, buttonRow }: {
  columns: number
  rows: number
  body: string[]
  bodyStart: number
  background: string
  blockWidth: number
  buttonRow?: ReactNode
}) {
  return (
    <Region>
      <Box position="absolute" top={0} left={0} width={columns} height={rows}>
        <Box position="absolute" top={bodyStart - 1} left={CHROME_MARGIN_X} width={blockWidth}>
          <Text color={background}>{'▄'.repeat(blockWidth)}</Text>
        </Box>
        {body.map((line, index) => (
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
              : <SelectableText y={bodyStart + index} col={CHROME_TEXT_X} text={line === '' ? ' ' : line} />}
          </Box>
        ))}
        <Box position="absolute" top={bodyStart + body.length} left={CHROME_MARGIN_X} width={blockWidth}>
          <Text color={background}>{'▀'.repeat(blockWidth)}</Text>
        </Box>
      </Box>
    </Region>
  )
}

export function approvalPanelHeight(innerWidth: number, reason?: string, command?: string): number {
  return buildApprovalBody(innerWidth, section(reason, innerWidth), section(command, innerWidth)).length + 2
}
