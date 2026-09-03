import { Box, Text } from 'ink'
import type { Ref } from 'react'
import { useCaret } from '../hooks/use-caret.ts'
import { caretNonceBold, caretNonceColor, caretNonceText } from '../../core/caret-nonce.ts'
import { useImperativeHandle, useEffect } from 'react'
import { COLORS, permissionModeInfo } from '../../theme.ts'
import { glyphs } from '../../terminal/glyphs.ts'
import { writeCursorShape } from '../../terminal/cursor-shape.ts'
import { CHROME_FRAME_ROWS, CHROME_MARGIN_X, CHROME_PAD_X, CHROME_TEXT_X, INPUT_WIDTH_OFFSET, hintBlockTop, inputFrameTop, inputStatusRow } from '../../core/metrics.ts'
import { inputStatusParts } from '../chrome/input-status.ts'
import { CapText } from '../chrome/caps.tsx'
import { colToCharIndex, lineBreaks, textWidth, truncate, wrapLines } from '../../core/text.ts'
import { hasFieldChar } from '../../core/fields.ts'
import { expandFieldChars, fieldRowSegments } from '../../core/field-view.ts'
import type { ComposerApi } from './use-composer.ts'
import type { CommandHintState } from './commands.ts'
import { SelectableText } from '../selection.tsx'
import { Region } from '../region.tsx'

export { INPUT_WIDTH_OFFSET }

export const HINT_MAX_ROWS = 10

export { inputLayout, INPUT_MAX_CONTENT_ROWS } from '../../core/composer-layout.ts'
import { inputLayout } from '../../core/composer-layout.ts'

export interface InputBarHandle {
  clickAt(y: number, x: number): void
  wheel(delta: -1 | 1): void
  hintWheel(delta: -1 | 1): void
  hintClick(absoluteIndex: number): void
  hintSelectAt(absoluteIndex: number): void
  hintConfirm(): void
  hintPick(absoluteIndex: number): void
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
  hint?: CommandHintState | null
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
  hint = null,
}: InputBarProps) {
  const { setCursorPosition } = useCaret()
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
  const hintCount = hint?.commands.length ?? 0
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
    hintSelectAt(absoluteIndex) {
      api.selectHint(absoluteIndex)
    },
    hintConfirm() {
      api.confirmHint()
    },
    hintPick(absoluteIndex) {
      api.hintPick(absoluteIndex)
    },
  }))
  const statusSegments: Array<{ text: string; color: string; bold?: boolean }> = []
  if (statusReady) {
    const leftMax = presetName === undefined
      ? contentWidth
      : Math.max(1, contentWidth - textWidth(presetName) - 2)
    const parts: Array<{ text: string; color: string; bold?: boolean }> = [
      { text: permission.name, color: permission.textColor },
      { text: ` ${glyphs.separator} `, color: COLORS.statusSeparator },
      { text: modelName, color: COLORS.modelText },
      ...(effortName === undefined ? [] : [
        { text: ` ${glyphs.separator} `, color: COLORS.statusSeparator },
        { text: effortName, color: COLORS.effortText },
      ]),
      ...(() => {
        const contributed = inputStatusParts({ columns, rows, busy: !interactive, running: !interactive, modelName, permissionMode, effortName, presetName })
        if (contributed.length === 0) return []
        const separator = { text: ` ${glyphs.separator} `, color: COLORS.statusSeparator }
        return [separator, ...contributed.flatMap((part, index) => {
          const entry = { text: part.text, color: part.color ?? COLORS.modelText, ...(part.bold === undefined ? {} : { bold: part.bold }) }
          return index < contributed.length - 1 ? [entry, separator] : [entry]
        })]
      })(),
    ]
    if (interactive) {
      parts.push({ text: caretNonceText(cursor), color: caretNonceColor(cursor), bold: caretNonceBold(cursor) })
    }
    let used = 0
    for (const part of parts) {
      const remaining = leftMax - used
      if (remaining <= 0) break
      const text = truncate(part.text, remaining)
      statusSegments.push({ text, color: part.color, ...(part.bold === undefined ? {} : { bold: part.bold }) })
      used += textWidth(text)
    }
  }
  const blockTop = hintCount > 0 ? Math.max(0, hintBlockTop(rows, barHeight, hintCount) - 1) : firstRealY - 1
  const statusLocalY = inputStatusRow(rows) - blockTop
  const hintTop = hintCount > 0 ? hintBlockTop(rows, barHeight, hintCount) : 0
  return (
    <Region y={blockTop}>
      <Box position="absolute" top={0} left={0} width={columns} height={rows}>
        <Box position="absolute" top={blockTop} left={CHROME_MARGIN_X} width={blockWidth}>
          <CapText background={permission.color} top width={blockWidth} />
        </Box>
        {hintCount > 0 && hint?.commands.map((command, index) => {
          const selected = index === hint.selectedIndex
          const leftWidth = Math.max(1, Math.floor((blockWidth * 2) / 5))
          const label = command.hint === undefined ? command.command : `${command.command} ${command.hint}`
          const labelPiece = truncate(label, leftWidth - 1)
          const descriptionPiece = truncate(command.description, Math.max(1, blockWidth - leftWidth - 2))
          const gap = Math.max(1, leftWidth - textWidth(labelPiece))
          const trail = Math.max(0, blockWidth - 2 - leftWidth - textWidth(descriptionPiece))
          return (
            <Box
              key={command.command}
              position="absolute"
              top={hintTop + index}
              left={CHROME_MARGIN_X}
              width={blockWidth}
              backgroundColor={permission.color}
            >
              <Box flexDirection="row">
                <Text inverse={selected} color={COLORS.ink}>{'  '}</Text>
                <SelectableText y={hintTop + index - blockTop} col={CHROME_MARGIN_X + 2} text={labelPiece} inverse={selected} />
                <Text inverse={selected} color={COLORS.ink}>{' '.repeat(gap)}</Text>
                <SelectableText y={hintTop + index - blockTop} col={CHROME_MARGIN_X + 2 + leftWidth} text={descriptionPiece} inverse={selected} />
                <Text inverse={selected} color={COLORS.ink}>{' '.repeat(trail)}</Text>
              </Box>
            </Box>
          )
        })}
        {hintCount > 0 && (
          <Box
            position="absolute"
            top={firstRealY - 1}
            left={CHROME_MARGIN_X}
            width={blockWidth}
            paddingLeft={CHROME_PAD_X}
            paddingRight={CHROME_PAD_X}
            backgroundColor={permission.color}
          >
            <Text>{' '}</Text>
          </Box>
        )}
        {Array.from({ length: realRows }, (_, row) => {
          const line = lines[visibleStart + row] ?? ''
          const expanded = expandFieldChars(line)
          const segments = hasFieldChar(line) ? fieldRowSegments(line) : undefined
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
                y={firstRealY + row - blockTop}
                col={CHROME_TEXT_X}
                text={expanded || ' '}
                segments={segments}
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
                let col = CHROME_TEXT_X
                return statusSegments.map((segment, index) => {
                  const node = <SelectableText key={index} y={statusLocalY} col={col} text={segment.text} color={segment.color} bold={segment.bold} />
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
              <SelectableText y={statusLocalY} col={CHROME_TEXT_X + contentWidth - textWidth(presetName)} text={presetName} color={COLORS.presetText} />
            </Box>
          )}
        </Box>
        <Box position="absolute" top={inputStatusRow(rows) + 1} left={CHROME_MARGIN_X} width={blockWidth}>
          <CapText background={permission.color} top={false} width={blockWidth} />
        </Box>
      </Box>
    </Region>
  )
}
