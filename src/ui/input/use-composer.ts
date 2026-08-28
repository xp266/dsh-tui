import { useInput, usePaste } from 'ink'
import { useRef, useState } from 'react'
import { isMouseResidue } from '../../terminal/mouse.ts'
import { colToCharIndex } from '../../core/text.ts'
import { moveCaretLine } from '../../core/composer-layout.ts'
import { editBackspace, editDelete, editInsert } from '../../core/edit.ts'
import { COMMANDS, filterHintEntries, literalHintArgs } from './commands.ts'
import type { CommandHintItem } from './commands.ts'

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
  hintPick(absoluteIndex: number): void
}

function opensHint(text: string): boolean {
  return text.startsWith('/') && !/\s/.test(text)
}

export function useComposer(
  onSend: (text: string) => void,
  interactive: boolean,
  contentWidth: number,
  onCycleMode?: () => void,
  entries?: readonly CommandHintItem[],
  listCommandArgs?: (name: string) => Promise<string[]>,
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
  const entriesRef = useRef<readonly CommandHintItem[] | undefined>(entries)
  const listCommandArgsRef = useRef(listCommandArgs)
  widthRef.current = contentWidth
  entriesRef.current = entries
  listCommandArgsRef.current = listCommandArgs
  valueRef.current = value
  cursorRef.current = cursor
  hintOpenRef.current = hintOpen
  commandIndexRef.current = commandIndex
  const visibleFor = (text: string) => filterHintEntries(entriesRef.current ?? COMMANDS, text)
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
      const commands = visibleFor(valueRef.current)
      const clamped = Math.max(0, Math.min(absoluteIndex, commands.length - 1))
      commandIndexRef.current = clamped
      setCommandIndex(clamped)
    },
    confirmHint() {
      const commands = visibleFor(valueRef.current)
      if (commands.length === 0) return
      const command = commands[Math.min(commandIndexRef.current, commands.length - 1)]?.command
      if (command === undefined) return
      const completed = `${command} `
      valueRef.current = completed
      cursorRef.current = completed.length
      setValue(completed)
      setCursor(completed.length)
      setHintOpen(false)
      hintOpenRef.current = false
      setCommandIndex(0)
      commandIndexRef.current = 0
    },
    hintMove(delta) {
      const commands = visibleFor(valueRef.current)
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
    hintPick(absoluteIndex) {
      if (!hintOpenRef.current) return
      apiRef.current.selectHint(absoluteIndex)
      apiRef.current.confirmHint()
    },
  })
  usePaste(text => {
    if (!interactive) return
    const normalized = text.replace(/\r\n?/g, '\n')
    if (normalized === '') return
    const next = editInsert({ value: valueRef.current, cursor: cursorRef.current }, normalized)
    valueRef.current = next.value
    cursorRef.current = next.cursor
    setValue(next.value)
    setCursor(next.cursor)
    const open = opensHint(next.value)
    setHintOpen(open)
    hintOpenRef.current = open
    if (open) {
      setCommandIndex(0)
      commandIndexRef.current = 0
    }
  }, { isActive: interactive })
  const insertText = (text: string): void => {
    const v = valueRef.current
    const c = cursorRef.current
    const next = editInsert({ value: v, cursor: c }, text)
    valueRef.current = next.value
    cursorRef.current = next.cursor
    setValue(next.value)
    setCursor(next.cursor)
  }
  const completeCommandArg = (): void => {
    const v = valueRef.current
    const match = /^(\/\S+)(?:\s+(\S*))?(?:\s+(.*\S))?\s*$/.exec(v)
    if (match === null) return
    const commandToken = match[1]!
    const entry = entriesRef.current?.find(candidate => candidate.command === commandToken)
    if (entry === undefined) return
    const currentArg = match[2] ?? ''
    const rest = match[3]
    void (async () => {
      let candidates: string[] = []
      try {
        candidates = await listCommandArgsRef.current?.(entry.command.slice(1)) ?? []
      } catch {
        return
      }
      if (candidates.length === 0) candidates = literalHintArgs(entry.hint)
      if (candidates.length === 0) return
      const exactIndex = candidates.indexOf(currentArg)
      let next: string
      if (exactIndex >= 0) {
        next = candidates[(exactIndex + 1) % candidates.length]!
      } else {
        next = candidates.find(candidate => candidate.startsWith(currentArg)) ?? candidates[0]!
      }
      const completed = `${commandToken} ${next}${rest === undefined ? '' : ` ${rest}`}`
      valueRef.current = completed
      cursorRef.current = completed.length
      setValue(completed)
      setCursor(completed.length)
      setHintOpen(false)
      hintOpenRef.current = false
      setCommandIndex(0)
      commandIndexRef.current = 0
    })()
  }
  useInput((input, key) => {
    if (!interactive) return
    if (input === '\n') {
      insertText('\n')
      return
    }
    const v = valueRef.current
    const c = cursorRef.current
    const commands = visibleFor(v)
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
      if (!v.startsWith('/')) {
        onCycleMode?.()
        return
      }
      const lastChar = v.length > 0 ? v[v.length - 1] : undefined
      const completable = c === v.length && lastChar !== undefined && !/\s/.test(lastChar)
      const trailingCommand = c === v.length && /^(\/\S+)\s+$/.test(v)
      const exactCommand = entriesRef.current?.some(entry => entry.command === v) ?? false
      if (completable && exactCommand) {
        completeCommandArg()
        return
      }
      if (showHint) {
        apiRef.current.confirmHint()
        return
      }
      if (completable || trailingCommand) {
        completeCommandArg()
      }
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
      insertText('\n')
      return
    }
    if (key.backspace) {
      const next = editBackspace({ value: v, cursor: c })
      if (next !== null) {
        valueRef.current = next.value
        cursorRef.current = next.cursor
        setValue(next.value)
        setCursor(next.cursor)
        const open = opensHint(next.value)
        setHintOpen(open)
        hintOpenRef.current = open
        setCommandIndex(0)
        commandIndexRef.current = 0
        return
      }
    }
    if (key.delete) {
      const next = editDelete({ value: v, cursor: c })
      if (next !== null) {
        valueRef.current = next.value
        cursorRef.current = next.cursor
        setValue(next.value)
        setCursor(next.cursor)
        const open = opensHint(next.value)
        setHintOpen(open)
        hintOpenRef.current = open
        setCommandIndex(0)
        commandIndexRef.current = 0
        return
      }
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
      if (/[\u0000-\u001f\u007f]/.test(input)) return
      const next = editInsert({ value: v, cursor: c }, input)
      valueRef.current = next.value
      cursorRef.current = next.cursor
      setValue(next.value)
      setCursor(next.cursor)
      const open = opensHint(next.value)
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
  return moveCaretLine(value, cursor, width, delta)
}