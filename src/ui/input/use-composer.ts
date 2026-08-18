import { useInput } from 'ink'
import { useRef, useState } from 'react'
import { isMouseResidue } from '../../terminal/mouse.ts'
import { colToCharIndex, lineBreaks, locToPoint } from '../../utils/text.ts'
import { filterCommands } from './commands.ts'

export interface ComposerState {
  value: string
  cursor: number
  hintOpen: boolean
  commandIndex: number
}

export function useComposer(
  onSend: (text: string) => void,
  interactive: boolean,
  contentWidth: number,
): ComposerState {
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
  return { value, cursor, hintOpen, commandIndex }
}

function moveLine(value: string, width: number, cursor: number, delta: -1 | 1): number {
  const breaks = lineBreaks(value, width)
  const point = locToPoint(value, width, cursor)
  const targetRow = point.row + delta
  if (targetRow < 0 || targetRow >= breaks.length) return cursor
  const target = breaks[targetRow]!
  return target.start + colToCharIndex(value.slice(target.start, target.end), point.col)
}