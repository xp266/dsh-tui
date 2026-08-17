import { Box, Text, useCursor, useInput, useStdout } from 'ink'
import { useEffect, useMemo, useRef, useState } from 'react'
import { colors } from '../theme.ts'
import { isMouseResidue } from '../terminal/mouse.ts'
import { colToCharIndex, lineBreaks, locToPoint, padToWidth, textWidth, truncate, wrapLines } from '../utils/text.ts'
import { filterCommands } from './commands.ts'
import type { CommandHintState } from './commands.ts'

export const INPUT_BAR_HEIGHT = 5

const CONTENT_ROWS = 2
const INPUT_WIDTH_OFFSET = 8

interface InputBarProps {
  width: number
  modelName: string
  onSend: (text: string) => void
  interactive?: boolean
  onHintChange?: (hint: CommandHintState | null) => void
}

export function InputBar({ width, modelName, onSend, interactive = true, onHintChange }: InputBarProps) {
  const { stdout } = useStdout()
  const { setCursorPosition } = useCursor()
  const [value, setValue] = useState('')
  const [cursor, setCursor] = useState(0)
  const [hintOpen, setHintOpen] = useState(false)
  const [commandIndex, setCommandIndex] = useState(0)
  const valueRef = useRef('')
  const cursorRef = useRef(0)
  const hintOpenRef = useRef(false)
  const commandIndexRef = useRef(0)
  valueRef.current = value
  cursorRef.current = cursor
  hintOpenRef.current = hintOpen
  commandIndexRef.current = commandIndex
  const totalRows = stdout?.rows ?? 24
  const contentWidth = width - INPUT_WIDTH_OFFSET
  const blockWidth = contentWidth + 4
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
  const renderInlineHint = onHintChange === undefined && showHint
  useEffect(() => {
    onHintChange?.(showHint ? { commands: hintCommands, selectedIndex: commandIndex } : null)
  }, [onHintChange, showHint, hintCommands, commandIndex])
  useInput((input, key) => {
    if (!interactive) return
    const v = valueRef.current
    const c = cursorRef.current
    const commands = filterCommands(v)
    const showHint = hintOpenRef.current && commands.length > 0
    if (key.return && !key.shift && showHint) {
      const command = commands[Math.min(commandIndexRef.current, commands.length - 1)]?.command
      if (command !== undefined) {
        valueRef.current = command
        cursorRef.current = command.length
        setValue(command)
        setCursor(command.length)
        setHintOpen(false)
        hintOpenRef.current = false
        setCommandIndex(0)
        commandIndexRef.current = 0
        return
      }
    }
    if (key.escape && showHint) {
      setHintOpen(false)
      hintOpenRef.current = false
      setCommandIndex(0)
      commandIndexRef.current = 0
      return
    }
    if (key.upArrow && showHint) {
      const next = (commandIndexRef.current - 1 + commands.length) % commands.length
      commandIndexRef.current = next
      setCommandIndex(next)
      return
    }
    if (key.downArrow && showHint) {
      const next = (commandIndexRef.current + 1) % commands.length
      commandIndexRef.current = next
      setCommandIndex(next)
      return
    }
    if (key.return && !key.shift) {
      const text = v.trim()
      if (text) onSend(text)
      valueRef.current = ''
      cursorRef.current = 0
      setValue('')
      setCursor(0)
      setHintOpen(false)
      hintOpenRef.current = false
      setCommandIndex(0)
      commandIndexRef.current = 0
      return
    }
    if (key.return) {
      const next = v.slice(0, c) + '\n' + v.slice(c)
      valueRef.current = next
      cursorRef.current = c + 1
      setValue(next)
      setCursor(c + 1)
      return
    }
    if (key.backspace && c > 0) {
      const next = v.slice(0, c - 1) + v.slice(c)
      valueRef.current = next
      cursorRef.current = c - 1
      setValue(next)
      setCursor(c - 1)
      const open = next.startsWith('/')
      setHintOpen(open)
      hintOpenRef.current = open
      setCommandIndex(0)
      commandIndexRef.current = 0
      return
    }
    if (key.delete && c < v.length) {
      const next = v.slice(0, c) + v.slice(c + 1)
      valueRef.current = next
      setValue(next)
      const open = next.startsWith('/')
      setHintOpen(open)
      hintOpenRef.current = open
      setCommandIndex(0)
      commandIndexRef.current = 0
      return
    }
    if (key.leftArrow && c > 0) {
      cursorRef.current = c - 1
      setCursor(c - 1)
      return
    }
    if (key.rightArrow && c < v.length) {
      cursorRef.current = c + 1
      setCursor(c + 1)
      return
    }
    if (key.upArrow) {
      const next = moveLine(v, contentWidth, c, -1)
      cursorRef.current = next
      setCursor(next)
      return
    }
    if (key.downArrow) {
      const next = moveLine(v, contentWidth, c, 1)
      cursorRef.current = next
      setCursor(next)
      return
    }
    if (key.home) {
      cursorRef.current = 0
      setCursor(0)
      return
    }
    if (key.end) {
      cursorRef.current = v.length
      setCursor(v.length)
      return
    }
    if (input && !key.ctrl && !key.meta && !isMouseResidue(input)) {
      const next = v.slice(0, c) + input + v.slice(c)
      valueRef.current = next
      cursorRef.current = c + input.length
      setValue(next)
      setCursor(c + input.length)
      const open = next.startsWith('/')
      setHintOpen(open)
      hintOpenRef.current = open
      if (open) {
        setCommandIndex(0)
        commandIndexRef.current = 0
      }
      return
    }
  })
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
      {renderInlineHint && (
        <Box marginLeft={2} width={blockWidth} flexDirection="column">
          {hintCommands.map((command, index) => {
            const selected = index === commandIndex
            const line = '  ' + padToWidth(command.command, 20) + command.description
            const filled = padToWidth(truncate(line, blockWidth), blockWidth)
            return (
              <Box key={command.command} width={blockWidth} backgroundColor={selected ? undefined : colors.dialogBackground}>
                <Text inverse={selected}>{filled}</Text>
              </Box>
            )
          })}
        </Box>
      )}
      <EdgeBlock width={blockWidth} />
      <Box
        height={CONTENT_ROWS + 1}
        marginLeft={2}
        width={blockWidth}
        paddingLeft={2}
        paddingRight={2}
        flexDirection="column"
        backgroundColor={colors.userBubbleBackground}
      >
        {visibleLines.map((line, row) => (
          <Box key={row}>
            <Text>{line || ' '}</Text>
          </Box>
        ))}
        <Text color={colors.modelText}>{modelName}</Text>
      </Box>
      <EdgeBlock width={blockWidth} bottom />
    </Box>
  )
}

function EdgeBlock({ width, bottom = false }: { width: number; bottom?: boolean }) {
  const char = bottom ? '▀' : '▄'
  return (
    <Box marginLeft={2} width={width}>
      <Text color={colors.userBubbleBackground}>{char.repeat(width)}</Text>
    </Box>
  )
}

function moveLine(value: string, width: number, cursor: number, delta: -1 | 1): number {
  const breaks = lineBreaks(value, width)
  const point = locToPoint(value, width, cursor)
  const targetRow = point.row + delta
  if (targetRow < 0 || targetRow >= breaks.length) return cursor
  const target = breaks[targetRow]!
  return target.start + colToCharIndex(value.slice(target.start, target.end), point.col)
}