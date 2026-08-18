import { Box, Text, useCursor, useStdout } from 'ink'
import { useEffect, useMemo } from 'react'
import { colors, permissionModeInfo } from '../../theme.ts'
import { colToCharIndex, locToPoint, textWidth, wrapLines } from '../../utils/text.ts'
import { filterCommands } from './commands.ts'
import type { CommandHintState } from './commands.ts'
import { useComposer } from './use-composer.ts'
import { HighlightedText } from '../selection.tsx'

export const INPUT_BAR_HEIGHT = 5

const CONTENT_ROWS = 2
const INPUT_WIDTH_OFFSET = 8

interface InputBarProps {
  width: number
  modelName: string
  permissionMode: string
  onCyclePermission: () => void
  onSend: (text: string) => void
  interactive?: boolean
  onHintChange?: (hint: CommandHintState | null) => void
}

export function InputBar({ width, modelName, permissionMode, onCyclePermission, onSend, interactive = true, onHintChange }: InputBarProps) {
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
  const hintCommands = useMemo(() => commands.slice(0, 5), [commands])
  const showHint = interactive && hintOpen && commands.length > 0
  useEffect(() => {
    onHintChange?.(showHint ? { commands: hintCommands, selectedIndex: commandIndex } : null)
  }, [onHintChange, showHint, hintCommands, commandIndex])
  const lines = wrapLines(value, contentWidth)
  const point = locToPoint(value, contentWidth, cursor)
  const visibleStart = Math.max(0, Math.min(point.row, Math.max(0, lines.length - CONTENT_ROWS)))
  const visibleLines = Array.from({ length: CONTENT_ROWS }, (_, i) => lines[visibleStart + i] ?? '')
  const cursorRow = point.row - visibleStart
  if (interactive) {
    const index = colToCharIndex(visibleLines[cursorRow] ?? '', point.col)
    setCursorPosition({
      x: 4 + textWidth((visibleLines[cursorRow] ?? '').slice(0, index)),
      y: totalRows - INPUT_BAR_HEIGHT + 1 + cursorRow,
    })
  } else {
    setCursorPosition(undefined)
  }
  return (
    <Box flexDirection="column">
      <EdgeBlock width={blockWidth} color={permission.color} />
      <Box
        height={CONTENT_ROWS + 1}
        marginLeft={2}
        width={blockWidth}
        paddingLeft={2}
        paddingRight={2}
        flexDirection="column"
        backgroundColor={permission.color}
      >
        {visibleLines.map((line, row) => (
          <Box key={row}>
            <HighlightedText y={totalRows - INPUT_BAR_HEIGHT + row} col={4} text={line || ' '} />
          </Box>
        ))}
        <HighlightedText y={totalRows - INPUT_BAR_HEIGHT + CONTENT_ROWS} col={4} text={`${modelName} · ${permission.name}`} color={colors.modelText} />
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