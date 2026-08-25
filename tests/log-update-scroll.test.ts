import { describe, expect, it } from 'vitest'
import logUpdate from '../node_modules/ink/build/log-update.js'

interface FakeStream {
  writes: string[]
  write(chunk: string): boolean
}

function createStream(): FakeStream {
  return { writes: [], write(chunk: string) { this.writes.push(chunk); return true } }
}

interface PatchedRenderer extends ReturnType<typeof logUpdate.create> {
  notifyShift(delta: number, top: number, bottom: number): boolean
}

function createRenderer(stream: FakeStream): PatchedRenderer {
  return logUpdate.create(stream as unknown as NodeJS.WriteStream) as PatchedRenderer
}

describe('patched ink log-update output paths', () => {
  it('writes the first frame as a bare block', () => {
    const stream = createStream()
    const render = createRenderer(stream)
    const frame = Array.from({ length: 10 }, (_, i) => `a${i}`).join('\n')
    render(frame)
    expect(stream.writes).toEqual([frame + '\x1b[?25l'])
  })

  it('blits a shift-shaped frame with hardware scrolling', () => {
    const stream = createStream()
    const render = createRenderer(stream)
    render(Array.from({ length: 10 }, (_, i) => `a${i}`).join('\n'))
    stream.writes.length = 0
    const changed = render(['a1', 'a2', 'a3', 'a4', 'a5', 'a6', 'a7', 'a8', 'a9', 'b9'].join('\n'))
    expect(changed).toBe(true)
    expect(stream.writes).toHaveLength(1)
    const chunk = stream.writes[0]!
    expect(chunk).toContain('\x1b[1;10r')
    expect(chunk).toContain('\x1b[1S')
    expect(chunk).toContain('\x1b[10;1Hb9\x1b[K')
    expect(chunk.endsWith('\x1b[r\x1b[10;1H\x1b[?25l')).toBe(true)
    expect(chunk).not.toContain('\x1b[2K')
  })

  it('rewrites only changed lines for non-shift frames', () => {
    const stream = createStream()
    const render = createRenderer(stream)
    const base = Array.from({ length: 10 }, (_, i) => `row ${i}`)
    render(base.join('\n'))
    stream.writes.length = 0
    const mutated = [...base]
    mutated[4] = 'mutated'
    render(mutated.join('\n'))
    const chunk = stream.writes[0]!
    expect(chunk.startsWith('\x1b[9A')).toBe(true)
    expect(chunk).toContain('\x1b[1Gmutated\x1b[K')
    expect(chunk).not.toContain('\x1b[2K')
    expect((chunk.match(/\x1b\[E/g) ?? []).length).toBe(8)
  })

  it('erases the tail when the block shrinks', () => {
    const stream = createStream()
    const render = createRenderer(stream)
    render(Array.from({ length: 10 }, (_, i) => `a${i}`).join('\n'))
    stream.writes.length = 0
    render(Array.from({ length: 7 }, (_, i) => `a${i}`).join('\n'))
    const chunk = stream.writes[0]!
    expect(chunk).toContain('\x1b[2K')
  })

  it('falls back to a full rewrite when the newline shape flips', () => {
    const stream = createStream()
    const render = createRenderer(stream)
    render(Array.from({ length: 10 }, (_, i) => `a${i}`).join('\n'))
    stream.writes.length = 0
    render(Array.from({ length: 10 }, (_, i) => `a${i}`).join('\n') + '\n')
    const chunk = stream.writes[0]!
    expect(chunk).toContain('\x1b[2K')
    expect(chunk).not.toMatch(/\x1b\[\d+[ST]/)
  })
})

describe('patched ink log-update notifyShift', () => {
  it('rejects shifts before any frame was written', () => {
    const stream = createStream()
    const render = createRenderer(stream)
    expect(render.notifyShift(1, 0, 9)).toBe(false)
    expect(stream.writes).toHaveLength(0)
  })

  it('emits a hardware scroll and rotates the ledger', () => {
    const stream = createStream()
    const render = createRenderer(stream)
    render(Array.from({ length: 10 }, (_, i) => `a${i}`).join('\n'))
    stream.writes.length = 0
    expect(render.notifyShift(1, 0, 9)).toBe(true)
    expect(stream.writes).toEqual(['\x1b[?2026h\x1b[1;10r\x1b[1S\x1b[r\x1b[10;1H\x1b[?2026l'])

    stream.writes.length = 0
    render(['a1', 'a2', 'a3', 'a4', 'a5', 'a6', 'a7', 'a8', 'a9', 'Z'].join('\n'))
    const chunk = stream.writes[0]!
    // Only the freshly exposed band row differs from the rotated ledger, so
    // the repair degenerates to a single line rewrite (cheaper than a blit).
    expect(chunk.startsWith('\x1b[9A')).toBe(true)
    expect(chunk).toContain('\x1b[1GZ\x1b[K')
    expect(chunk).not.toMatch(/\x1b\[\d+[ST]/)
    expect(chunk.endsWith('\x1b[?25l')).toBe(true)
  })

  it('rotates downward shifts symmetrically', () => {
    const stream = createStream()
    const render = createRenderer(stream)
    render(['a0', 'a1', 'a2', 'a3', 'a4', 'a5', 'a6', 'a7', 'a8', 'a9'].join('\n'))
    stream.writes.length = 0
    expect(render.notifyShift(-2, 0, 9)).toBe(true)
    expect(stream.writes[0]).toBe('\x1b[?2026h\x1b[1;10r\x1b[2T\x1b[r\x1b[10;1H\x1b[?2026l')

    stream.writes.length = 0
    render(['y0', 'y1', 'a0', 'a1', 'a2', 'a3', 'a4', 'a5', 'a6', 'a7'].join('\n'))
    const chunk = stream.writes[0]!
    expect(chunk.startsWith('\x1b[9A')).toBe(true)
    expect(chunk).toContain('\x1b[1Gy0\x1b[K')
    expect(chunk).toContain('\x1b[1Gy1\x1b[K')
    expect(chunk).not.toMatch(/\x1b\[\d+[ST]/)
  })

  it('repairs multi-tick lag with per-line writes only', () => {
    const stream = createStream()
    const render = createRenderer(stream)
    const base = Array.from({ length: 12 }, (_, i) => `v${i}`)
    render(base.join('\n'))
    stream.writes.length = 0
    expect(render.notifyShift(1, 0, 11)).toBe(true)
    expect(render.notifyShift(1, 0, 11)).toBe(true)
    stream.writes.length = 0
    // Two ticks landed while React was parked; the true screen rotated twice
    // and grew two fresh bottom rows plus a stray thumb-adjacent row.
    const target = [...base.slice(2), 'w10', 'w11']
    target[4] = 'THUMB'
    render(target.join('\n'))
    const chunk = stream.writes[0]!
    expect(chunk.startsWith('\x1b[11A')).toBe(true)
    expect(chunk).toContain('\x1b[1GTHUMB\x1b[K')
    expect(chunk).toContain('\x1b[1Gw10\x1b[K')
    expect(chunk).toContain('\x1b[1Gw11\x1b[K')
    expect(chunk).not.toMatch(/\x1b\[\d+[ST]/)
    expect(chunk).not.toContain('\x1b[2K')
  })

  it('rejects degenerate windows and oversized deltas', () => {
    const stream = createStream()
    const render = createRenderer(stream)
    render(Array.from({ length: 10 }, (_, i) => `a${i}`).join('\n'))
    stream.writes.length = 0
    expect(render.notifyShift(0, 0, 9)).toBe(false)
    expect(render.notifyShift(10, 0, 9)).toBe(false)
    expect(render.notifyShift(1, 5, 5)).toBe(false)
    expect(render.notifyShift(1, 3, 9)).toBe(true)
    expect(stream.writes).toHaveLength(1)
    expect(stream.writes[0]).toContain('\x1b[4;10r')
  })

  it('keeps the declared cursor position through a shift', () => {
    const stream = createStream()
    const render = createRenderer(stream)
    render.setCursorPosition({ x: 3, y: 4 })
    render(Array.from({ length: 10 }, (_, i) => `a${i}`).join('\n'))
    stream.writes.length = 0
    expect(render.notifyShift(1, 0, 9)).toBe(true)
    expect(stream.writes[0]).toBe('\x1b[?2026h\x1b[1;10r\x1b[1S\x1b[r\x1b[5;4H\x1b[?2026l')
  })
})
