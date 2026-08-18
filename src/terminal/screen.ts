import { EventEmitter } from 'node:events'
import { colToCharIndex } from '../utils/text.ts'
import { selectedRange } from '../ui/selection.tsx'
import type { LineSelection } from '../ui/selection.tsx'

export interface ScreenRect {
  top: number
  bottom: number
  left: number
  right: number
}

export interface ScreenCapture {
  stream: NodeJS.WriteStream
  extract(rect: ScreenRect): string
  extractSelection(selection: LineSelection): string
  rowHasText(y: number): boolean
}

export function createScreenCapture(): ScreenCapture {
  const real = process.stdout
  let grid: string[] = []
  let cursorX = 0
  let cursorY = 0
  let pending = ''

  function ensureRow(y: number): void {
    while (grid.length <= y) grid.push('')
  }

  function setCell(y: number, x: number, ch: string): void {
    ensureRow(y)
    let row = grid[y]!
    if (x > row.length) row = row + ' '.repeat(x - row.length)
    grid[y] = x < row.length ? row.slice(0, x) + ch + row.slice(x + 1) : row + ch
  }

  function eraseLine(y: number, mode: number): void {
    ensureRow(y)
    const row = grid[y]!
    const x = Math.max(0, Math.min(cursorX, row.length))
    if (mode === 0) grid[y] = row.slice(0, x)
    else if (mode === 1) grid[y] = row.slice(x)
    else grid[y] = ''
  }

  function writeText(text: string): void {
    for (const ch of text) {
      if (ch === '\n') {
        cursorY += 1
        cursorX = 0
        continue
      }
      if (ch === '\r') {
        cursorX = 0
        continue
      }
      if (ch === '\t') {
        cursorX += 4
        continue
      }
      if (cursorY < 0) cursorY = 0
      if (cursorX < 0) cursorX = 0
      setCell(cursorY, cursorX, ch)
      cursorX += 1
    }
  }

  function applyCsi(params: number[], final: string): void {
    switch (final) {
      case 'A':
        cursorY = Math.max(0, cursorY - (params[0] ?? 1))
        break
      case 'B':
        cursorY += params[0] ?? 1
        break
      case 'C':
        cursorX += params[0] ?? 1
        break
      case 'D':
        cursorX = Math.max(0, cursorX - (params[0] ?? 1))
        break
      case 'E':
        cursorY += params[0] ?? 1
        cursorX = 0
        break
      case 'F':
        cursorY = Math.max(0, cursorY - (params[0] ?? 1))
        cursorX = 0
        break
      case 'G':
        cursorX = Math.max(0, (params[0] ?? 1) - 1)
        break
      case 'H':
      case 'f':
        cursorY = Math.max(0, (params[0] ?? 1) - 1)
        cursorX = Math.max(0, (params[1] ?? 1) - 1)
        break
      case 'J': {
        const mode = params[0] ?? 0
        if (mode === 2 || mode === 3) {
          grid = []
          cursorX = 0
          cursorY = 0
        } else if (mode === 0) {
          if (grid.length > cursorY + 1) grid = grid.slice(0, cursorY + 1)
        } else {
          for (let y = 0; y <= cursorY && y < grid.length; y++) grid[y] = ''
        }
        break
      }
      case 'K':
        eraseLine(cursorY, params[0] ?? 0)
        break
      default:
        break
    }
  }

  function feed(chunk: string): void {
    pending += chunk
    while (pending.length > 0) {
      const esc = pending.indexOf('\x1b')
      if (esc === -1) {
        writeText(pending)
        pending = ''
        return
      }
      if (esc > 0) {
        writeText(pending.slice(0, esc))
        pending = pending.slice(esc)
        continue
      }
      if (pending.length < 2) return
      const kind = pending[1]
      if (kind === '[') {
        let finalIndex = -1
        for (let i = 2; i < pending.length; i++) {
          const code = pending.charCodeAt(i)
          if (code >= 0x40 && code <= 0x7e) {
            finalIndex = i
            break
          }
        }
        if (finalIndex === -1) {
          if (pending.length > 64) pending = ''
          return
        }
        const body = pending.slice(2, finalIndex)
        const final = pending[finalIndex]!
        pending = pending.slice(finalIndex + 1)
        const params: number[] = []
        let current = ''
        for (const ch of body) {
          if (ch >= '0' && ch <= '9') current += ch
          else if (ch === ';') {
            params.push(current === '' ? 0 : Number(current))
            current = ''
          } else {
            current = ''
          }
        }
        if (current !== '') params.push(Number(current))
        applyCsi(params, final)
        continue
      }
      if (kind === ']') {
        const bel = pending.indexOf('\x07')
        const st = pending.indexOf('\x1b\\')
        let done = -1
        if (bel !== -1) done = bel + 1
        if (st !== -1 && (done === -1 || st + 2 < done)) done = st + 2
        if (done === -1) {
          if (pending.length > 4096) pending = ''
          return
        }
        pending = pending.slice(done)
        continue
      }
      pending = pending.slice(2)
    }
  }

  function extract(rect: ScreenRect): string {
    const top = Math.max(0, Math.min(rect.top, grid.length - 1))
    const bottom = Math.max(0, Math.min(rect.bottom, grid.length - 1))
    const left = Math.max(0, rect.left)
    const right = Math.max(left, rect.right)
    const lines: string[] = []
    for (let y = top; y <= bottom; y++) {
      const row = grid[y] ?? ''
      const startIndex = colToCharIndex(row, left)
      const endIndex = colToCharIndex(row, right)
      lines.push(row.slice(startIndex, endIndex))
    }
    return lines.join('\n').replace(/[ \t]+$/gm, '').replace(/\n+$/, '')
  }

  function isBlockOnly(text: string): boolean {
    const stripped = text.replace(/[▀▄█░▒▓\t ]/g, '')
    return stripped === ''
  }

  function extractSelection(selection: LineSelection): string {
    const top = Math.max(0, Math.min(selection.anchorRow, selection.focusRow))
    const bottom = Math.min(Math.max(selection.anchorRow, selection.focusRow), grid.length - 1)
    const lines: string[] = []
    for (let y = top; y <= bottom; y++) {
      const row = grid[y] ?? ''
      if (isBlockOnly(row)) {
        lines.push('')
        continue
      }
      const range = selectedRange(selection, y)
      if (range === null) continue
      const endCol = Math.min(range.end, colToCharIndex(row, row.length))
      const startIndex = colToCharIndex(row, Math.max(0, range.start))
      const endIndex = colToCharIndex(row, Math.max(0, endCol))
      if (startIndex < endIndex) lines.push(row.slice(startIndex, endIndex))
    }
    return lines.join('\n').replace(/[ \t]+$/gm, '').replace(/\n+$/, '')
  }

  function rowHasText(y: number): boolean {
    if (y < 0 || y >= grid.length) return false
    const row = grid[y] ?? ''
    return !isBlockOnly(row) && row.trim() !== ''
  }

  class CaptureStream extends EventEmitter {
    write(chunk: string | Buffer): boolean {
      feed(typeof chunk === 'string' ? chunk : chunk.toString('utf8'))
      return real.write(chunk)
    }
    get isTTY(): boolean {
      return real.isTTY
    }
    get columns(): number {
      return real.columns ?? 80
    }
    get rows(): number {
      return real.rows ?? 24
    }
    get destroyed(): boolean {
      return real.destroyed
    }
    get writableEnded(): boolean {
      return real.writableEnded
    }
    get writable(): boolean {
      return real.writable
    }
    override on(event: string, listener: (...args: unknown[]) => void): this {
      ;(real as unknown as EventEmitter).on(event, listener)
      return this
    }
    override off(event: string, listener: (...args: unknown[]) => void): this {
      ;(real as unknown as EventEmitter).off(event, listener)
      return this
    }
    override once(event: string, listener: (...args: unknown[]) => void): this {
      ;(real as unknown as EventEmitter).once(event, listener)
      return this
    }
    override removeListener(event: string, listener: (...args: unknown[]) => void): this {
      ;(real as unknown as EventEmitter).removeListener(event, listener)
      return this
    }
  }

  return { stream: new CaptureStream() as unknown as NodeJS.WriteStream, extract, extractSelection, rowHasText }
}