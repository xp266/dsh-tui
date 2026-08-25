import { describe, expect, it } from 'vitest'
import logUpdate from '../node_modules/ink/build/log-update.js'
import { createScreenCapture } from '../src/terminal/screen.ts'

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

function plainOf(capture: ReturnType<typeof createScreenCapture>, rows: number): string {
  const text = capture.extract({ top: 0, bottom: rows - 1, left: 0, right: 120 })
  return text.replace(/\n+$/, '')
}

describe('log-update frame paths round-trip through the capture grid', () => {
  it('keeps the parsed screen identical to the target frame across every path', () => {
    const stream = createStream()
    const render = createRenderer(stream)
    const capture = createScreenCapture()
    const paint = (frame: string): void => {
      render(frame)
      for (const chunk of stream.writes) capture.feed(chunk)
      stream.writes.length = 0
    }
    const expectScreen = (lines: string[]): void => {
      expect(plainOf(capture, lines.length)).toBe(lines.join('\n').replace(/\n+$/, ''))
    }

    const base = Array.from({ length: 12 }, (_, i) => `line-${i}`)
    paint(base.join('\n'))
    expectScreen(base)

    // Hardware shift via notifyShift, then a React-style repair frame.
    expect(render.notifyShift(3, 0, 11)).toBe(true)
    for (const chunk of stream.writes) capture.feed(chunk)
    stream.writes.length = 0
    const up3 = [...base.slice(3), 'tail-a', 'tail-b', 'tail-c']
    paint(up3.join('\n'))
    expectScreen(up3)

    // Downward shift with a fresh top band.
    expect(render.notifyShift(-1, 0, 11)).toBe(true)
    for (const chunk of stream.writes) capture.feed(chunk)
    stream.writes.length = 0
    const down1 = ['fresh', ...up3.slice(0, -1)]
    paint(down1.join('\n'))
    expectScreen(down1)

    // Non-shift mutation exercises the line-diff path.
    const mutated = [...down1]
    mutated[7] = 'mutated-in-place'
    paint(mutated.join('\n'))
    expectScreen(mutated)

    // Shrink exercises the erase-tail path.
    const shrunk = mutated.slice(0, 8)
    paint(shrunk.join('\n'))
    expectScreen(shrunk)

    // Grow again from the shrunken ledger.
    const grown = [...shrunk, 'grow-a', 'grow-b', 'grow-c', 'grow-d']
    paint(grown.join('\n'))
    expectScreen(grown)
  })

  it('survives interleaved cursor declarations', () => {
    const stream = createStream()
    const render = createRenderer(stream)
    const capture = createScreenCapture()
    const paintWithCursor = (frame: string, x: number, y: number): void => {
      render.setCursorPosition({ x, y })
      render(frame)
      for (const chunk of stream.writes) capture.feed(chunk)
      stream.writes.length = 0
    }

    const first = Array.from({ length: 10 }, (_, i) => `row ${i}`)
    paintWithCursor(first.join('\n'), 0, 9)
    const second = Array.from({ length: 10 }, (_, i) => `row ${i + 2}`)
    paintWithCursor(second.join('\n'), 4, 6)
    expect(plainOf(capture, 10)).toBe(second.join('\n'))
  })
})
