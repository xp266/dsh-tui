import { useInput, usePaste } from 'ink'
import { useRef, useState } from 'react'
import { isMouseResidue } from '../../terminal/mouse.ts'
import { colToCharIndex, lineBreaks, locToPoint } from '../../utils/text.ts'
import { filterCommands } from './commands.ts'

export interface ComposerState {
  value: string
  cursor: number
  hintOpen: boolean
  commandIndex: number
  api: ComposerApi
}

export interface ComposerApi {
  moveLineBy(delta: -1 | 1): void
  placeCursor(charIndex: number): void
  selectHint(absoluteIndex: number): void
  confirmHint(): void
  hintMove(delta: -1 | 1): void
  hintClickAt(absoluteIndex: number): void
}

export function useComposer(
  onSend: (text: string) => void,
  interactive: boolean,
  contentWidth: number,
  onCycleMode?: () => void,
): ComposerState {
  const [value, setValue] = useState('')
  const [cursor, setCursor] = useState(0)
  const [hintOpen, setHintOpen] = useState(false)
  const [commandIndex, setCommandIndex] = useState(0)
  const valueRef = useRef('')
  const cursorRef = useRef(0)
  const hintOpenRef = useRef(false)
  const commandIndexRef = useRef(0)
  const widthRef = useRef(contentWidth)
  widthRef.current = contentWidth
  valueRef.current = value
  cursorRef.current = cursor
  hintOpenRef.current = hintOpen
  commandIndexRef.current = commandIndex
  const apiRef = useRef<ComposerApi>({
    moveLineBy(delta) {
      const next = moveLine(valueRef.current, widthRef.current, cursorRef.current, delta)
      cursorRef.current = next
      setCursor(next)
    },
    placeCursor(charIndex) {
      const clamped = Math.max(0, Math.min(charIndex, valueRef.current.length))
      cursorRef.current = clamped
      setCursor(clamped)
    },
    selectHint(absoluteIndex) {
      const commands = filterCommands(valueRef.current)
      const clamped = Math.max(0, Math.min(absoluteIndex, commands.length - 1))
      commandIndexRef.current = clamped
      setCommandIndex(clamped)
    },
    confirmHint() {
      const commands = filterCommands(valueRef.current)
      if (commands.length === 0) return
      const command = commands[Math.min(commandIndexRef.current, commands.length - 1)]?.command
      if (command === undefined) return
      valueRef.current = command
      cursorRef.current = command.length
      setValue(command)
      setCursor(command.length)
      setHintOpen(false)
      hintOpenRef.current = false
      setCommandIndex(0)
      commandIndexRef.current = 0
    },
    hintMove(delta) {
      const commands = filterCommands(valueRef.current)
      if (commands.length === 0) return
      const next = (commandIndexRef.current + delta + commands.length) % commands.length
      commandIndexRef.current = next
      setCommandIndex(next)
    },
    hintClickAt(absoluteIndex) {
      if (!hintOpenRef.current) return
      if (absoluteIndex === commandIndexRef.current) {
        apiRef.current.confirmHint()
        return
      }
      apiRef.current.selectHint(absoluteIndex)
    },
  })
  usePaste(text => {
    if (!interactive) return
    const normalized = text.replace(/\r\n?/g, '\n')
    if (normalized === '') return
    const v = valueRef.current
    const c = cursorRef.current
    const next = v.slice(0, c) + normalized + v.slice(c)
    valueRef.current = next
    cursorRef.current = c + normalized.length
    setValue(next)
    setCursor(c + normalized.length)
    const open = next.startsWith('/')
    setHintOpen(open)
    hintOpenRef.current = open
    if (open) {
      setCommandIndex(0)
      commandIndexRef.current = 0
    }
  }, { isActive: interactive })
  useInput((input, key) => {
    if (!interactive) return
    if (input === '\n') {
      const v = valueRef.current
      const c = cursorRef.current
      const next = v.slice(0, c) + '\n' + v.slice(c)
      valueRef.current = next
      cursorRef.current = c + 1
      setValue(next)
      setCursor(c + 1)
      return
    }
    const v = valueRef.current
    const c = cursorRef.current
    const commands = filterCommands(v)
    const showHint = hintOpenRef.current && commands.length > 0
    if (key.return && !key.shift && showHint) {
      apiRef.current.confirmHint()
      return
    }
    if (key.escape && showHint) {
      setHintOpen(false)
      hintOpenRef.current = false
      setCommandIndex(0)
      commandIndexRef.current = 0
      return
    }
    if (key.tab) {
      onCycleMode?.()
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
  return { value, cursor, hintOpen, commandIndex, api: apiRef.current }
}

function moveLine(value: string, width: number, cursor: number, delta: -1 | 1): number {
  const breaks = lineBreaks(value, width)
  const point = locToPoint(value, width, cursor)
  const targetRow = point.row + delta
  if (targetRow < 0 || targetRow >= breaks.length) return cursor
  const target = breaks[targetRow]!
  return target.start + colToCharIndex(value.slice(target.start, target.end), point.col)
}