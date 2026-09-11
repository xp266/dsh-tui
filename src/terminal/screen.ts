import { EventEmitter } from 'node:events'
import { charWidth, segmentGraphemes } from '../core/text.ts'
import { selectedRange } from '../model/selection.ts'
import type { LineSelection } from '../model/selection.ts'

export interface ScreenRect {
  top: number
  bottom: number
  left: number
  right: number
}

export interface ScreenCapture {
  stream: NodeJS.WriteStream
  feed(chunk: string): void
  extract(rect: ScreenRect): string
  extractSelection(selection: LineSelection): string
  rowHasText(y: number): boolean
}

export function createScreenCapture(): ScreenCapture {
  const real = process.stdout
  let grid: string[][] = []
  let cursorX = 0
  let cursorY = 0
  let pending = ''
  let regionTop = 0
  let regionBottom = -1
  // Every ink frame flows through write(); parsing it into the grid eagerly
  // costs ~1ms per frame even when nothing ever queries the grid. Chunks are
  // buffered and parsed on first query instead — pointer events and copy
  // actions are the only readers, and they are rare relative to frames.
  const buffered: string[] = []
  let bufferedBytes = 0
  const BUFFER_MAX_BYTES = 1024 * 1024

  function flushBuffer(): void {
    for (const chunk of buffered) feed(chunk)
    buffered.length = 0
    bufferedBytes = 0
  }

  function bufferChunk(chunk: string): void {
    buffered.push(chunk)
    bufferedBytes += chunk.length
    if (bufferedBytes <= BUFFER_MAX_BYTES) return
    // A reader that never queries keeps the grid stale beyond this point;
    // pointer queries still parse the most recent megabyte. The newest chunk
    // always survives: an immediately following query must see the frame
    // that triggered it, not the one before the cap.
    while (buffered.length > 1 && bufferedBytes - buffered[0]!.length > BUFFER_MAX_BYTES) {
      bufferedBytes -= buffered[0]!.length
      buffered.shift()
    }
  }

  function ensureRow(y: number): void {
    while (grid.length <= y) grid.push([])
  }

  function effectiveRegionBottom(): number {
    const fallback = Math.max(real.rows ?? 24, grid.length) - 1
    return regionBottom < 0 ? fallback : Math.min(regionBottom, Math.max(fallback, regionTop))
  }

  function scrollRegionLines(n: number, down: boolean): void {
    if (n <= 0) return
    const top = Math.max(0, Math.min(regionTop, grid.length))
    const bottom = Math.max(top, effectiveRegionBottom())
    ensureRow(bottom)
    const count = Math.min(n, bottom - top)
    for (let k = 0; k < count; k++) {
      if (down) {
        for (let y = bottom; y > top; y--) grid[y] = grid[y - 1] ?? []
        grid[top] = []
      } else {
        for (let y = top; y < bottom; y++) grid[y] = grid[y + 1] ?? []
        grid[bottom] = []
      }
    }
  }

  function setCell(y: number, x: number, ch: string): void {
    ensureRow(y)
    const row = grid[y]!
    while (row.length < x) row.push(' ')
    row[x] = ch
    const width = charWidth(ch)
    for (let k = 1; k < width; k++) row[x + k] = ''
  }

  function eraseLine(y: number, mode: number): void {
    ensureRow(y)
    const row = grid[y]!
    const x = Math.max(0, Math.min(cursorX, row.length))
    if (mode === 0) grid[y] = row.slice(0, x)
    else if (mode === 1) grid[y] = row.slice(x)
    else grid[y] = []
  }

  function writeText(text: string): void {
    for (const { segment } of segmentGraphemes(text)) {
      if (segment === '\n') {
        cursorY += 1
        cursorX = 0
        continue
      }
      if (segment === '\r') {
        cursorX = 0
        continue
      }
      if (segment === '\t') {
        cursorX += 4
        continue
      }
      if (cursorY < 0) cursorY = 0
      if (cursorX < 0) cursorX = 0
      setCell(cursorY, cursorX, segment)
      cursorX += charWidth(segment)
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
          for (let y = 0; y <= cursorY && y < grid.length; y++) grid[y] = []
        }
        break
      }
      case 'K':
        eraseLine(cursorY, params[0] ?? 0)
        break
      case 'r': {
        regionTop = Math.max(0, (params[0] ?? 1) - 1)
        const bottomParam = params[1] ?? 0
        regionBottom = bottomParam > 0 ? Math.max(regionTop, bottomParam - 1) : -1
        cursorX = 0
        cursorY = 0
        break
      }
      case 'S':
        scrollRegionLines(Math.max(1, params[0] || 1), false)
        break
      case 'T':
        scrollRegionLines(Math.max(1, params[0] || 1), true)
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
    flushBuffer()
    const top = Math.max(0, Math.min(rect.top, grid.length - 1))
    const bottom = Math.max(0, Math.min(rect.bottom, grid.length - 1))
    const left = Math.max(0, rect.left)
    const right = Math.max(left, rect.right)
    const lines: string[] = []
    for (let y = top; y <= bottom; y++) {
      lines.push((grid[y] ?? []).slice(left, right).join(''))
    }
    return lines.join('\n').replace(/[ \t]+$/gm, '').replace(/\n+$/, '')
  }

  function isBlockOnly(text: string): boolean {
    const stripped = text.replace(/[▀▄█░▒▓\t ]/g, '')
    return stripped === ''
  }

  function extractSelection(selection: LineSelection): string {
    flushBuffer()
    const top = Math.max(0, Math.min(selection.anchorRow, selection.focusRow))
    const bottom = Math.min(Math.max(selection.anchorRow, selection.focusRow), grid.length - 1)
    const lines: string[] = []
    for (let y = top; y <= bottom; y++) {
      const row = grid[y] ?? []
      if (isBlockOnly(row.join(''))) {
        lines.push('')
        continue
      }
      const range = selectedRange(selection, y)
      if (range === null) continue
      const start = Math.max(0, range.start)
      const end = range.end === Infinity ? undefined : Math.max(start, range.end)
      const text = row.slice(start, end).join('')
      if (text.length > 0) lines.push(text)
    }
    return lines.join('\n').replace(/[ \t]+$/gm, '').replace(/\n+$/, '')
  }

  function rowHasText(y: number): boolean {
    flushBuffer()
    if (y < 0 || y >= grid.length) return false
    const row = (grid[y] ?? []).join('')
    return !isBlockOnly(row) && row.trim() !== ''
  }

  class CaptureStream extends EventEmitter {
    constructor() {
      super()
      // Re-emit the real terminal's resize events onto the capture stream so
      // subscribers that registered locally (below) observe them too.
      ;(real as unknown as EventEmitter).on('resize', () => {
        this.emit('resize')
      })
    }
    write(chunk: string | Buffer): boolean {
      bufferChunk(typeof chunk === 'string' ? chunk : chunk.toString('utf8'))
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
      if (event === 'resize') return super.on(event, listener)
      ;(real as unknown as EventEmitter).on(event, listener)
      return this
    }
    override off(event: string, listener: (...args: unknown[]) => void): this {
      if (event === 'resize') return super.off(event, listener)
      ;(real as unknown as EventEmitter).off(event, listener)
      return this
    }
    override once(event: string, listener: (...args: unknown[]) => void): this {
      if (event === 'resize') return super.once(event, listener)
      ;(real as unknown as EventEmitter).once(event, listener)
      return this
    }
    override removeListener(event: string, listener: (...args: unknown[]) => void): this {
      if (event === 'resize') return super.removeListener(event, listener)
      ;(real as unknown as EventEmitter).removeListener(event, listener)
      return this
    }
  }

  return { stream: new CaptureStream() as unknown as NodeJS.WriteStream, feed, extract, extractSelection, rowHasText }
}