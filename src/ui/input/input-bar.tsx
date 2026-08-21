import { Box, Text, useCursor, useStdout } from 'ink'
import { useEffect, useMemo, useRef } from 'react'
import { colors, permissionModeInfo } from '../../theme.ts'
import { colToCharIndex, locToPoint, textWidth, truncate, wrapLines } from '../../utils/text.ts'
import { filterCommands } from './commands.ts'
import type { CommandHintState } from './commands.ts'
import { useComposer } from './use-composer.ts'
import { SelectableText } from '../selection.tsx'

export const INPUT_BAR_MIN_HEIGHT = 5

const INPUT_MIN_CONTENT_ROWS = 2
const INPUT_MAX_CONTENT_ROWS = 8
const INPUT_WIDTH_OFFSET = 8
const HINT_MAX_ROWS = 7

interface InputBarProps {
  width: number
  modelName: string
  permissionMode: string
  onCyclePermission: () => void
  effortName?: string
  presetName?: string
  onSend: (text: string) => void
  interactive?: boolean
  onHintChange?: (hint: CommandHintState | null) => void
  onHeightChange?: (height: number) => void
}

export function InputBar({
  width,
  modelName,
  permissionMode,
  onCyclePermission,
  effortName,
  presetName,
  onSend,
  interactive = true,
  onHintChange,
  onHeightChange,
}: InputBarProps) {
  const { stdout } = useStdout()
  const { setCursorPosition } = useCursor()
  const totalRows = stdout?.rows ?? 24
  const contentWidth = width - INPUT_WIDTH_OFFSET
  const blockWidth = contentWidth + 4
  const { value, cursor, hintOpen, commandIndex } = useComposer(onSend, interactive, contentWidth, onCyclePermission)
  const permission = permissionModeInfo(permissionMode)
  useEffect(() => {
    process.stdout.write(interactive ? '\x1b[1 q' : '\x1b[2 q')
  }, [interactive])
  useEffect(() => {
    return () => {
      process.stdout.write('\x1b[0 q')
    }
  }, [])
  const commands = useMemo(() => filterCommands(value), [value])
  const lines = wrapLines(value, contentWidth)
  const point = locToPoint(value, contentWidth, cursor)
  const contentRows = Math.min(INPUT_MAX_CONTENT_ROWS, Math.max(INPUT_MIN_CONTENT_ROWS, lines.length))
  const barHeight = contentRows + 3
  const reportedHeightRef = useRef(INPUT_BAR_MIN_HEIGHT)
  useEffect(() => {
    if (reportedHeightRef.current !== barHeight) {
      reportedHeightRef.current = barHeight
      onHeightChange?.(barHeight)
    }
  }, [barHeight, onHeightChange])
  const maxVisible = Math.max(1, Math.min(HINT_MAX_ROWS, totalRows - barHeight - 1))
  const hintStartRef = useRef(0)
  let hintVisibleStart = hintStartRef.current
  if (commandIndex < hintVisibleStart) {
    hintVisibleStart = commandIndex
  } else if (commandIndex >= hintVisibleStart + maxVisible) {
    hintVisibleStart = commandIndex - maxVisible + 1
  }
  hintVisibleStart = Math.max(0, Math.min(hintVisibleStart, Math.max(0, commands.length - maxVisible)))
  hintStartRef.current = hintVisibleStart
  const hintCommands = useMemo(
    () => commands.slice(hintVisibleStart, hintVisibleStart + maxVisible),
    [commands, hintVisibleStart, maxVisible],
  )
  const showHint = interactive && hintOpen && commands.length > 0
  const hintSelected = commandIndex - hintVisibleStart
  useEffect(() => {
    onHintChange?.(showHint ? { commands: hintCommands, selectedIndex: hintSelected } : null)
  }, [onHintChange, showHint, hintCommands, hintSelected])
  const visibleStart = Math.max(0, Math.min(point.row, Math.max(0, lines.length - contentRows)))
  const visibleLines = Array.from({ length: contentRows }, (_, i) => lines[visibleStart + i] ?? '')
  const cursorRow = point.row - visibleStart
  if (interactive) {
    const index = colToCharIndex(visibleLines[cursorRow] ?? '', point.col)
    setCursorPosition({
      x: 4 + textWidth((visibleLines[cursorRow] ?? '').slice(0, index)),
      y: totalRows - barHeight + cursorRow,
    })
  } else {
    setCursorPosition(undefined)
  }
  return (
    <Box flexDirection="column">
      <EdgeBlock width={blockWidth} color={permission.color} />
      <Box
        height={contentRows + 1}
        marginLeft={2}
        width={blockWidth}
        paddingLeft={2}
        paddingRight={2}
        flexDirection="column"
        backgroundColor={permission.color}
      >
        {visibleLines.map((line, row) => (
          <Box key={row}>
            <SelectableText y={totalRows - barHeight + row} col={4} text={line || ' '} />
          </Box>
        ))}
        {(() => {
          const y = totalRows - barHeight + contentRows
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
          const segments: Array<{ text: string; color: string }> = []
          let used = 0
          for (const part of parts) {
            const remaining = leftMax - used
            if (remaining <= 0) break
            const text = truncate(part.text, remaining)
            segments.push({ text, color: part.color })
            used += textWidth(text)
          }
          return (
            <Box width={contentWidth} justifyContent="space-between">
              <Box flexDirection="row">
                {(() => {
                  let col = 4
                  return segments.map((segment, index) => {
                    const node = <SelectableText key={index} y={y} col={col} text={segment.text} color={segment.color} />
                    col += textWidth(segment.text)
                    return node
                  })
                })()}
              </Box>
              {presetName !== undefined && (
                <SelectableText y={y} col={4 + contentWidth - textWidth(presetName)} text={presetName} color={colors.presetText} />
              )}
            </Box>
          )
        })()}
      </Box>
      <EdgeBlock width={blockWidth} color={permission.color} bottom />
    </Box>
  )
}

function EdgeBlock({ width, color, bottom = false }: { width: number; color: string; bottom?: boolean }) {
  const char = bottom ? '▀' : '▄'
  return (
    <Box marginLeft={2} width={width}>
      <Text color={color}>{char.repeat(width)}</Text>
    </Box>
  )
}