import { Box, Text, useCursor, useStdout } from 'ink'
import type { Ref } from 'react'
import { useImperativeHandle, useEffect, memo } from 'react'
import { colors, permissionModeInfo } from '../../theme.ts'
import { writeCursorShape } from '../../terminal/cursor-shape.ts'
import { CHROME_FRAME_ROWS, CHROME_MARGIN_X, CHROME_PAD_X, CHROME_TEXT_X, INPUT_WIDTH_OFFSET, inputFrameTop, inputStatusRow } from '../../core/metrics.ts'
import { colToCharIndex, lineBreaks, textWidth, truncate, wrapLines } from '../../core/text.ts'
import type { ComposerApi } from './use-composer.ts'
import { SelectableText } from '../selection.tsx'
import { Region } from '../region.tsx'

export { INPUT_WIDTH_OFFSET }

export const HINT_MAX_ROWS = 7

export { inputLayout, INPUT_MAX_CONTENT_ROWS } from '../../core/composer-layout.ts'
import { inputLayout } from '../../core/composer-layout.ts'

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

export const InputBar = memo(function InputBar({
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
  const blockWidth = contentWidth + CHROME_PAD_X * 2
  const permission = permissionModeInfo(permissionMode)
  useEffect(() => {
    writeCursorShape(interactive ? 'beam' : 'block')
  }, [interactive])
  useEffect(() => {
    return () => {
      writeCursorShape('reset')
    }
  }, [])
  const layout = inputLayout(value, cursor, width)
  const { lines, cursorRow, cursorCol, realRows, barHeight, visibleStart } = layout
  const firstRealY = inputFrameTop(rows, realRows)
  const caretVisibleRow = cursorRow - visibleStart
  if (interactive) {
    setCursorPosition({
      x: CHROME_TEXT_X + cursorCol,
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
      const col = Math.max(0, Math.min(x - CHROME_TEXT_X, textWidth(lineText)))
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
  const blockTop = firstRealY - 1
  const statusLocalY = inputStatusRow(rows) - blockTop
  return (
    <Region y={blockTop}>
      <Box position="absolute" top={0} left={0} width={columns} height={rows}>
        <Box position="absolute" top={blockTop} left={CHROME_MARGIN_X} width={blockWidth}>
          <Text color={permission.color}>{'▄'.repeat(blockWidth)}</Text>
        </Box>
        {Array.from({ length: realRows }, (_, row) => {
          const line = lines[visibleStart + row] ?? ''
          return (
            <Box
              key={`input-${row}`}
              position="absolute"
              top={firstRealY + row}
              left={CHROME_MARGIN_X}
              width={blockWidth}
              paddingLeft={CHROME_PAD_X}
              paddingRight={CHROME_PAD_X}
              backgroundColor={permission.color}
            >
              <SelectableText
                y={row + 1}
                col={CHROME_TEXT_X}
                text={line || ' '}
              />
            </Box>
          )
        })}
        <Box
          position="absolute"
          top={inputStatusRow(rows) - 1}
          left={CHROME_MARGIN_X}
          width={blockWidth}
          paddingLeft={CHROME_PAD_X}
          paddingRight={CHROME_PAD_X}
          backgroundColor={permission.color}
        >
          <Text>{' '}</Text>
        </Box>
        <Box
          position="absolute"
          top={inputStatusRow(rows)}
          left={CHROME_MARGIN_X}
          width={blockWidth}
          paddingLeft={CHROME_PAD_X}
          paddingRight={CHROME_PAD_X}
          backgroundColor={permission.color}
        >
          {statusReady ? (
            <Box flexDirection="row">
              {(() => {
                let col = 4
                return statusSegments.map((segment, index) => {
                  const node = <SelectableText key={index} y={statusLocalY} col={col} text={segment.text} color={segment.color} />
                  col += textWidth(segment.text)
                  return node
                })
              })()}
            </Box>
          ) : (
            <Text>{' '}</Text>
          )}
          {statusReady && presetName !== undefined && (
            <Box position="absolute" top={0} left={CHROME_MARGIN_X + contentWidth - textWidth(presetName)}>
              <SelectableText y={statusLocalY} col={CHROME_TEXT_X + contentWidth - textWidth(presetName)} text={presetName} color={colors.presetText} />
            </Box>
          )}
        </Box>
        <Box position="absolute" top={inputStatusRow(rows) + 1} left={CHROME_MARGIN_X} width={blockWidth}>
          <Text color={permission.color}>{'▀'.repeat(blockWidth)}</Text>
        </Box>
      </Box>
    </Region>
  )
})
