import { EventEmitter } from 'node:events'
import { charWidth, segmentGraphemes } from '../../src/core/text.ts'

export interface Cell {
  ch: string
  attr: string
}

interface SgrState {
  flags: Set<number>
  fg: number[] | null
  bg: number[] | null
}

function defaultCell(): Cell {
  return { ch: ' ', attr: '' }
}

function attrOf(state: SgrState): string {
  const parts = [...state.flags].sort((a, b) => a - b)
  if (state.fg !== null) parts.push(...state.fg)
  if (state.bg !== null) parts.push(...state.bg)
  return parts.join(';')
}

class TerminalGrid {
  columns: number
  rows: number
  grid: Cell[][]
  cursorX = 0
  cursorY = 0
  private pending = ''
  private state: SgrState = { flags: new Set(), fg: null, bg: null }
  lastWriteAt = 0

  constructor(columns: number, rows: number) {
    this.columns = columns
    this.rows = rows
    this.grid = this.freshGrid()
  }

  private freshGrid(): Cell[][] {
    return Array.from({ length: this.rows }, () =>
      Array.from({ length: this.columns }, () => defaultCell()),
    )
  }

  private blankRow(): Cell[] {
    return Array.from({ length: this.columns }, () => defaultCell())
  }

  private setCell(y: number, x: number, ch: string): void {
    if (y < 0 || y >= this.rows || x < 0 || x >= this.columns) return
    const row = this.grid[y]!
    const attr = attrOf(this.state)
    row[x] = { ch, attr }
    const width = charWidth(ch)
    for (let k = 1; k < width; k++) {
      if (x + k < this.columns) row[x + k] = { ch: '', attr }
    }
  }

  private eraseLine(mode: number): void {
    if (this.cursorY < 0 || this.cursorY >= this.rows) return
    const row = this.grid[this.cursorY]!
    const x = Math.max(0, Math.min(this.cursorX, this.columns - 1))
    if (mode === 0) {
      for (let i = x; i < this.columns; i++) row[i] = defaultCell()
    } else if (mode === 1) {
      for (let i = 0; i <= x; i++) row[i] = defaultCell()
    } else {
      this.grid[this.cursorY] = this.blankRow()
    }
  }

  private eraseScreen(mode: number): void {
    if (mode === 2 || mode === 3) {
      this.grid = this.freshGrid()
      this.cursorX = 0
      this.cursorY = 0
      return
    }
    if (mode === 0) {
      this.eraseLine(0)
      for (let y = this.cursorY + 1; y < this.rows; y++) this.grid[y] = this.blankRow()
    } else {
      this.eraseLine(1)
      for (let y = 0; y < this.cursorY; y++) this.grid[y] = this.blankRow()
    }
  }

  private applySgr(params: number[]): void {
    if (params.length === 0 || params[0] === 0) {
      this.state = { flags: new Set(), fg: null, bg: null }
      if (params.length === 0 || params.every(p => p === 0)) return
    }
    for (let i = params[0] === 0 ? 1 : 0; i < params.length; i++) {
      const p = params[i]!
      const state = this.state
      if (p === 39) state.fg = null
      else if (p === 49) state.bg = null
      else if ((p >= 30 && p <= 37) || (p >= 90 && p <= 97)) state.fg = [p]
      else if ((p >= 40 && p <= 47) || (p >= 100 && p <= 107)) state.bg = [p]
      else if (p === 38 || p === 48) {
        const mode = params[i + 1]
        if (mode === 5 && i + 2 < params.length) {
          const code = [p, 5, params[i + 2]!]
          i += 2
          if (p === 38) state.fg = code
          else state.bg = code
        } else if (mode === 2 && i + 4 < params.length) {
          const code = [p, 2, params[i + 2]!, params[i + 3]!, params[i + 4]!]
          i += 4
          if (p === 38) state.fg = code
          else state.bg = code
        }
      } else if (p === 22) {
        state.flags.delete(1)
        state.flags.delete(2)
      } else if (p === 24) state.flags.delete(4)
      else if (p === 27) state.flags.delete(7)
      else if (p === 29) state.flags.delete(9)
      else if (p >= 1 && p <= 9) state.flags.add(p)
    }
  }

  private writeText(text: string): void {
    for (const { segment } of segmentGraphemes(text)) {
      if (segment === '\n') {
        this.cursorY += 1
        this.cursorX = 0
        continue
      }
      if (segment === '\r') {
        this.cursorX = 0
        continue
      }
      if (segment === '\t') {
        this.cursorX += 4
        continue
      }
      this.setCell(this.cursorY, this.cursorX, segment)
      this.cursorX += charWidth(segment)
    }
  }

  feed(chunk: string): void {
    this.lastWriteAt = Date.now()
    this.pending += chunk
    while (this.pending.length > 0) {
      const esc = this.pending.indexOf('\x1b')
      if (esc === -1) {
        this.writeText(this.pending)
        this.pending = ''
        return
      }
      if (esc > 0) {
        this.writeText(this.pending.slice(0, esc))
        this.pending = this.pending.slice(esc)
        continue
      }
      if (this.pending.length < 2) return
      const kind = this.pending[1]
      if (kind === '[') {
        let finalIndex = -1
        for (let i = 2; i < this.pending.length; i++) {
          const code = this.pending.charCodeAt(i)
          if (code >= 0x40 && code <= 0x7e) {
            finalIndex = i
            break
          }
        }
        if (finalIndex === -1) {
          if (this.pending.length > 256) this.pending = ''
          return
        }
        const body = this.pending.slice(2, finalIndex)
        const final = this.pending[finalIndex]!
        this.pending = this.pending.slice(finalIndex + 1)
        const params: number[] = []
        let currentStr = ''
        for (const ch of body) {
          if (ch >= '0' && ch <= '9') currentStr += ch
          else if (ch === ';') {
            params.push(currentStr === '' ? 0 : Number(currentStr))
            currentStr = ''
          } else {
            currentStr = ''
          }
        }
        if (currentStr !== '') params.push(Number(currentStr))
        if (final === 'm') this.applySgr(body.trim() === '' ? [0] : params)
        else this.applyCsi(params, final)
        continue
      }
      if (kind === ']') {
        const bel = this.pending.indexOf('\x07')
        const st = this.pending.indexOf('\x1b\\')
        let done = -1
        if (bel !== -1) done = bel + 1
        if (st !== -1 && (done === -1 || st + 2 < done)) done = st + 2
        if (done === -1) {
          if (this.pending.length > 4096) this.pending = ''
          return
        }
        this.pending = this.pending.slice(done)
        continue
      }
      this.pending = this.pending.slice(2)
    }
  }

  private applyCsi(params: number[], final: string): void {
    switch (final) {
      case 'A': this.cursorY = Math.max(0, this.cursorY - (params[0] ?? 1)); break
      case 'B': this.cursorY += params[0] ?? 1; break
      case 'C': this.cursorX += params[0] ?? 1; break
      case 'D': this.cursorX = Math.max(0, this.cursorX - (params[0] ?? 1)); break
      case 'E': this.cursorY += params[0] ?? 1; this.cursorX = 0; break
      case 'F': this.cursorY = Math.max(0, this.cursorY - (params[0] ?? 1)); this.cursorX = 0; break
      case 'G': this.cursorX = Math.max(0, (params[0] ?? 1) - 1); break
      case 'H':
      case 'f':
        this.cursorY = Math.max(0, (params[0] ?? 1) - 1)
        this.cursorX = Math.max(0, (params[1] ?? 1) - 1)
        break
      case 'J': this.eraseScreen(params[0] ?? 0); break
      case 'K': this.eraseLine(params[0] ?? 0); break
      default: break
    }
  }

  snapshotPlain(): string {
    const lines = this.grid.map(row =>
      row.map(c => c.ch).join('').replace(/[ ]+$/, ''),
    )
    while (lines.length > 0 && lines[lines.length - 1] === '') lines.pop()
    return lines.join('\n')
  }

  snapshotAnsi(): string {
    const lines: string[] = []
    for (const row of this.grid) {
      let end = -1
      for (let x = 0; x < this.columns; x++) {
        const cell = row[x]!
        if (cell.ch !== ' ' || cell.attr !== '') end = x
      }
      let out = ''
      let last: string | null = null
      for (let x = 0; x <= end; x++) {
        const cell = row[x]!
        if (cell.ch === '') continue
        if (cell.attr !== last) {
          out += '\x1b[0m'
          if (cell.attr !== '') out += `\x1b[${cell.attr}m`
          last = cell.attr
        }
        out += cell.ch
      }
      if (last !== null) out += '\x1b[0m'
      lines.push(out)
    }
    while (lines.length > 0 && lines[lines.length - 1] === '') lines.pop()
    return lines.join('\n')
  }
}

export class VirtualStdout extends EventEmitter {
  readonly terminal: TerminalGrid

  constructor(columns: number, rows: number) {
    super()
    this.terminal = new TerminalGrid(columns, rows)
  }

  write(chunk: string | Buffer): boolean {
    this.terminal.feed(typeof chunk === 'string' ? chunk : chunk.toString('utf8'))
    return true
  }

  get isTTY(): boolean {
    return true
  }

  get columns(): number {
    return this.terminal.columns
  }

  get rows(): number {
    return this.terminal.rows
  }

  get destroyed(): boolean {
    return false
  }

  get writableEnded(): boolean {
    return false
  }

  get writable(): boolean {
    return true
  }
}

export class VirtualStdin extends EventEmitter {
  isTTY = true

  private queue: string[] = []

  sendKeys(keys: string): void {
    this.queue.push(keys)
    setImmediate(() => this.emit('readable'))
  }

  read(): string | null {
    const next = this.queue.shift()
    return next === undefined ? null : next
  }

  setRawMode(): void {}

  ref(): void {}

  unref(): void {}

  resume(): void {}

  pause(): void {}

  setEncoding(): this {
    return this
  }
}
