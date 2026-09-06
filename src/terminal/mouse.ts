export type MouseEventType = 'down' | 'up' | 'drag' | 'move' | 'scroll'

export interface MouseEventData {
  type: MouseEventType
  button: number
  x: number
  y: number
  modifiers: { shift: boolean; alt: boolean; ctrl: boolean }
  scrollDirection?: 'up' | 'down'
}

import { enterMode, exitMode } from './modes.ts'

const MOUSE_ENABLE_SEQUENCES = '\x1b[?1003l\x1b[?1000h\x1b[?1002h\x1b[?1006h'
const MOUSE_DISABLE_SEQUENCES = '\x1b[?1003l\x1b[?1000l\x1b[?1002l\x1b[?1006l'

/**
 * Terminal-mode sequences must reach the device even when the process exits
 * right after: on Windows, TTY writes through process.stdout are
 * asynchronous and a trailing restore sequence is silently dropped, leaving
 * the terminal in mouse-tracking mode. fd 1 writes are synchronous.
 */


interface ParsedSequence {
  event: MouseEventData
  consumed: number
}

const MAX_BUFFER = 64
const SGR_PREFIX = '\x1b[<'

function partialPrefixLength(buffer: string): number {
  for (let keep = Math.min(2, buffer.length); keep > 0; keep--) {
    if (SGR_PREFIX.startsWith(buffer.slice(-keep))) return keep
  }
  return 0
}

export function createMouseParser(onEvent: (event: MouseEventData) => void) {
  let buffer = ''
  const pressedButtons = new Set<number>()
  function parseSequenceAt(str: string, offset: number): ParsedSequence | null {
    if (!str.startsWith('\x1b[<', offset)) return null
    let index = offset + 3
    const values: number[] = []
    let current = 0
    let hasDigit = false
    let terminator = ''
    for (; index < str.length; index++) {
      const ch = str[index]
      if (ch >= '0' && ch <= '9') {
        current = current * 10 + (ch.charCodeAt(0) - 48)
        hasDigit = true
      } else if (ch === ';' && hasDigit) {
        values.push(current)
        current = 0
        hasDigit = false
      } else if (ch === 'M' || ch === 'm') {
        if (!hasDigit) return null
        values.push(current)
        terminator = ch
        break
      } else {
        return null
      }
    }
    if (terminator === '') return null
    if (values.length !== 3) return null
    return { event: decodeSgrEvent(values[0], values[1], values[2], terminator as 'M' | 'm', pressedButtons), consumed: index - offset + 1 }
  }
  return {
    feed(chunk: string): void {
      buffer += chunk
      while (true) {
        const start = buffer.indexOf('\x1b[<')
        if (start === -1) {
          const keep = partialPrefixLength(buffer)
          buffer = keep === 0 ? '' : buffer.slice(-keep)
          return
        }
        if (start > 0) {
          buffer = buffer.slice(start)
          continue
        }
        if (buffer.length > MAX_BUFFER) {
          buffer = ''
          return
        }
        const parsed = parseSequenceAt(buffer, 0)
        if (parsed === null) return
        const { event, consumed } = parsed
        buffer = buffer.slice(consumed)
        onEvent(event)
      }
    },
  }
}

function decodeSgrEvent(rawButtonCode: number, wireX: number, wireY: number, pressRelease: 'M' | 'm', pressed: Set<number>): MouseEventData {
  const button = rawButtonCode & 3
  const isScroll = (rawButtonCode & 64) !== 0
  const isMotion = (rawButtonCode & 32) !== 0
  const modifiers = {
    shift: (rawButtonCode & 4) !== 0,
    alt: (rawButtonCode & 8) !== 0,
    ctrl: (rawButtonCode & 16) !== 0,
  }
  let type: MouseEventType
  let scrollDirection: 'up' | 'down' | undefined
  if (isScroll) {
    type = 'scroll'
    scrollDirection = button === 0 ? 'up' : 'down'
  } else if (isMotion) {
    type = pressed.size > 0 ? 'drag' : 'move'
  } else if (pressRelease === 'M') {
    type = 'down'
    if (button !== 3) pressed.add(button)
  } else {
    type = 'up'
    if (button === 3) pressed.clear()
    else pressed.delete(button)
  }
  return {
    type,
    button: button === 3 ? 0 : button,
    x: wireX - 1,
    y: wireY - 1,
    modifiers,
    ...(scrollDirection === undefined ? {} : { scrollDirection }),
  }
}

export function isMouseResidue(input: string): boolean {
  return input.includes('\x1b') || /^\[<\d+(;\d+)*[Mm]$/.test(input)
}

export interface MouseController {
  enable: () => void
  disable: () => void
}

export function createMouseController(onEvent: (event: MouseEventData) => void): MouseController {
  const parser = createMouseParser(onEvent)
  const onData = (chunk: Buffer) => parser.feed(chunk.toString('latin1'))
  return {
    enable() {
      enterMode('mouse', MOUSE_ENABLE_SEQUENCES, MOUSE_DISABLE_SEQUENCES)
      process.stdin.on('data', onData)
    },
    disable() {
      exitMode('mouse')
      process.stdin.off('data', onData)
    },
  }
}
