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
import type { CommandHintState, CommandHintArgs } from './commands.ts'
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
  /** Parameter strip for a typed command with parameters (`/goal `); mutually exclusive with `hint`. */
  args?: CommandHintArgs | null
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
  args = null,
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
  const argTokens = args?.tokens ?? []
  const argsCount = argTokens.length === 0 ? 0 : 1
  // The parameter row is a header band of the same input block, exactly like
  // the command menu: both stack above the frame's top cap, inside the gap row
  // the block reserves, so the block keeps one cap and never opens a hole.
  const bandRows = hintCount + argsCount
  // `hintBlockTop` anchors the top of the band stack; the cap shares that row,
  // so content starts one row below it.
  const blockTop = bandRows > 0 ? hintBlockTop(rows, barHeight, bandRows) - 1 : firstRealY - 1
  const hintTop = blockTop + 1
  const argsTop = blockTop + 1 + hintCount
  const statusLocalY = inputStatusRow(rows) - blockTop
  return (
    <Region y={blockTop}>
      <Box position="absolute" top={0} left={0} width={columns} height={rows}>
        <Box position="absolute" top={blockTop} left={CHROME_MARGIN_X} width={blockWidth}>
          <CapText background={permission.color} top width={blockWidth} />
        </Box>
        {hintCount > 0 && hint?.commands.map((command, index) => {
          const selected = index === hint.selectedIndex
          // The command column sizes to the widest name across the filtered
          // list (commands carry no inline parameter text), so every
          // description starts at the same column and moves well forward.
          const nameWidth = hint!.nameWidth ?? Math.max(...hint!.commands.map(entry => textWidth(entry.command)))
          const labelWidth = Math.min(nameWidth, Math.max(1, blockWidth - 6))
          const labelPiece = truncate(command.command, labelWidth)
          const descriptionPiece = truncate(command.description, Math.max(1, blockWidth - labelWidth - 4))
          const gap = Math.max(2, labelWidth - textWidth(labelPiece) + 2)
          const trail = Math.max(0, blockWidth - 2 - textWidth(labelPiece) - gap - textWidth(descriptionPiece))
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
                <SelectableText y={hintTop + index - blockTop} col={CHROME_MARGIN_X + 2 + textWidth(labelPiece) + gap} text={descriptionPiece} inverse={selected} />
                <Text inverse={selected} color={COLORS.ink}>{' '.repeat(trail)}</Text>
              </Box>
            </Box>
          )
        })}
        {bandRows > 0 && (
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
        {argsCount > 0 && (
          <Box
            position="absolute"
            top={argsTop}
            left={CHROME_MARGIN_X}
            width={blockWidth}
            height={1}
            backgroundColor={permission.color}
          >
            <Box flexDirection="row">
              <Text color={COLORS.ink}>{'  '}</Text>
              {(() => {
                let col = CHROME_MARGIN_X + 2
                let used = 0
                return argTokens.flatMap((token, index) => {
                  const remaining = blockWidth - 4 - used
                  if (remaining <= 0) return []
                  const text = truncate(token.literal ? token.label : `<${token.label}>`, remaining)
                  if (text === '') return []
                  used += textWidth(text) + 3
                  const nodes = [
                    <SelectableText
                      key={`arg-${index}`}
                      y={argsTop - blockTop}
                      col={col}
                      text={text}
                      color={COLORS.ink}
                    />,
                  ]
                  col += textWidth(text)
                  if (index < argTokens.length - 1) {
                    nodes.push(<Text key={`sep-${index}`} color={COLORS.ink}>{' | '}</Text>)
                    col += 3
                  }
                  return nodes
                })
              })()}
            </Box>
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
