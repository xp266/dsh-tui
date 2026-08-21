import { Box, Text, useCursor, useStdout } from 'ink'
import type { Ref } from 'react'
import { useImperativeHandle, useEffect } from 'react'
import { colors, permissionModeInfo } from '../../theme.ts'
import { colToCharIndex, lineBreaks, textWidth, truncate } from '../../utils/text.ts'
import type { ComposerApi } from './use-composer.ts'
import { SelectableText } from '../selection.tsx'

export const INPUT_BAR_MIN_HEIGHT = 5
export const INPUT_MAX_CONTENT_ROWS = 8
export const INPUT_WIDTH_OFFSET = 8
export const HINT_MAX_ROWS = 7

function wrapLine(line: string, width: number): string[] {
  if (line === '') return ['']
  const parts: string[] = []
  let current = ''
  let currentWidth = 0
  for (const ch of line) {
    const w = textWidth(ch)
    if (currentWidth + w > width) {
      parts.push(current)
      current = ch
      currentWidth = w
      continue
    }
    current += ch
    currentWidth += w
  }
  parts.push(current)
  return parts
}

export interface InputLayout {
  lines: string[]
  cursorRow: number
  cursorCol: number
  realRows: number
  barHeight: number
  visibleStart: number
}

export function inputLayout(value: string, cursor: number, width: number): InputLayout {
  const contentWidth = width - INPUT_WIDTH_OFFSET
  const lines: string[] = []
  for (const raw of value.split('\n')) lines.push(...wrapLine(raw, contentWidth))
  const clamped = Math.max(0, Math.min(cursor, value.length))
  let remaining = clamped
  let cursorRow = 0
  let cursorCol = 0
  for (let i = 0; i < lines.length; i++) {
    const len = lines[i]!.length
    if (remaining <= len) {
      cursorRow = i
      cursorCol = textWidth(lines[i]!.slice(0, remaining))
      break
    }
    remaining -= len + 1
    if (i === lines.length - 1) {
      cursorRow = i
      cursorCol = textWidth(lines[i]!)
    }
  }
  const realRows = Math.min(lines.length, INPUT_MAX_CONTENT_ROWS - 1)
  const maxVisibleReal = INPUT_MAX_CONTENT_ROWS - 1
  const visibleStart = Math.min(
    Math.max(0, cursorRow - (maxVisibleReal - 1)),
    Math.max(0, lines.length - maxVisibleReal),
  )
  return {
    lines,
    cursorRow,
    cursorCol,
    realRows,
    barHeight: realRows + 4,
    visibleStart,
  }
}

export interface InputBarHandle {
  clickAt(y: number, x: number): void
  wheel(delta: -1 | 1): void
  hintWheel(delta: -1 | 1): void
  hintClick(absoluteIndex: number): void
}

interface InputBarProps {
  ref?: Ref<InputBarHandle>
  width: number
  columns: number
  rows: number
  value: string
  cursor: number
  api: ComposerApi
  modelName: string
  permissionMode: string
  effortName?: string
  presetName?: string
  interactive?: boolean
  statusReady?: boolean
}

export function InputBar({
  ref,
  width,
  columns,
  rows,
  value,
  cursor,
  api,
  modelName,
  permissionMode,
  effortName,
  presetName,
  interactive = true,
  statusReady = true,
}: InputBarProps) {
  const { setCursorPosition } = useCursor()
  const contentWidth = width - INPUT_WIDTH_OFFSET
  const blockWidth = contentWidth + 4
  const permission = permissionModeInfo(permissionMode)
  useEffect(() => {
    process.stdout.write(interactive ? '\x1b[1 q' : '\x1b[2 q')
  }, [interactive])
  useEffect(() => {
    return () => {
      process.stdout.write('\x1b[0 q')
    }
  }, [])
  const layout = inputLayout(value, cursor, width)
  const { lines, cursorRow, cursorCol, realRows, barHeight, visibleStart } = layout
  const firstRealY = rows - 4 - realRows
  const caretVisibleRow = cursorRow - visibleStart
  if (interactive) {
    setCursorPosition({
      x: 4 + cursorCol,
      y: firstRealY + caretVisibleRow,
    })
  } else {
    setCursorPosition(undefined)
  }
  useImperativeHandle(ref, () => ({
    clickAt(y, x) {
      const rowInContent = y - firstRealY
      if (rowInContent < 0 || rowInContent >= realRows) return
      const lineIndex = visibleStart + rowInContent
      const lineText = lines[lineIndex]
      const target = lineBreaks(value, contentWidth)[lineIndex]
      if (lineText === undefined || target === undefined) return
      const col = Math.max(0, Math.min(x - 4, textWidth(lineText)))
      api.placeCursor(target.start + colToCharIndex(lineText, col))
    },
    wheel(delta) {
      api.moveLineBy(delta)
    },
    hintWheel(delta) {
      api.hintMove(delta)
    },
    hintClick(absoluteIndex) {
      api.hintClickAt(absoluteIndex)
    },
  }))
  const statusSegments: Array<{ text: string; color: string }> = []
  if (statusReady) {
    const leftMax = presetName === undefined
      ? contentWidth
      : Math.max(1, contentWidth - textWidth(presetName) - 2)
    const parts: Array<{ text: string; color: string }> = [
      { text: permission.name, color: permission.textColor },
      { text: ' · ', color: colors.statusSeparator },
      { text: modelName, color: colors.modelText },
      ...(effortName === undefined ? [] : [
        { text: ' · ', color: colors.statusSeparator },
        { text: effortName, color: colors.effortText },
      ]),
    ]
    let used = 0
    for (const part of parts) {
      const remaining = leftMax - used
      if (remaining <= 0) break
      const text = truncate(part.text, remaining)
      statusSegments.push({ text, color: part.color })
      used += textWidth(text)
    }
  }
  const statusY = rows - 3
  return (
    <Box position="absolute" top={0} left={0} width={columns} height={rows}>
      <Box position="absolute" top={firstRealY - 1} left={2} width={blockWidth}>
        <Text color={permission.color}>{'▄'.repeat(blockWidth)}</Text>
      </Box>
      {Array.from({ length: realRows }, (_, row) => {
        const y = firstRealY + row
        const line = lines[visibleStart + row] ?? ''
        return (
          <Box
            key={`input-${row}`}
            position="absolute"
            top={y}
            left={2}
            width={blockWidth}
            paddingLeft={2}
            paddingRight={2}
            backgroundColor={permission.color}
          >
            <SelectableText y={y} col={4} text={line || ' '} />
          </Box>
        )
      })}
      <Box
        position="absolute"
        top={rows - 4}
        left={2}
        width={blockWidth}
        paddingLeft={2}
        paddingRight={2}
        backgroundColor={permission.color}
      >
        <Text>{' '}</Text>
      </Box>
      <Box
        position="absolute"
        top={statusY}
        left={2}
        width={blockWidth}
        paddingLeft={2}
        paddingRight={2}
        backgroundColor={permission.color}
      >
        {statusReady ? (
          <Box flexDirection="row">
            {(() => {
              let col = 4
              return statusSegments.map((segment, index) => {
                const node = <SelectableText key={index} y={statusY} col={col} text={segment.text} color={segment.color} />
                col += textWidth(segment.text)
                return node
              })
            })()}
          </Box>
        ) : (
          <Text>{' '}</Text>
        )}
        {statusReady && presetName !== undefined && (
          <Box position="absolute" top={0} left={2 + contentWidth - textWidth(presetName)}>
            <SelectableText y={statusY} col={4 + contentWidth - textWidth(presetName)} text={presetName} color={colors.presetText} />
          </Box>
        )}
      </Box>
      <Box position="absolute" top={rows - 2} left={2} width={blockWidth}>
        <Text color={permission.color}>{'▀'.repeat(blockWidth)}</Text>
      </Box>
    </Box>
  )
}
