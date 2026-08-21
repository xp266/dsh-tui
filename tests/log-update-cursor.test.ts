import { describe, expect, it } from 'vitest'
import logUpdate from '../node_modules/ink/build/log-update.js'

interface FakeStream {
  writes: string[]
  write(chunk: string): boolean
}

function createStream(): FakeStream {
  return { writes: [], write(chunk: string) { this.writes.push(chunk); return true } }
}

function fullscreenFrame(seed: string): string {
  return Array.from({ length: 10 }, (_, i) => `${seed}${i}`).join('\n')
}

function trailingFrame(seed: string): string {
  return fullscreenFrame(seed) + '\n'
}

describe('patched ink log-update cursor placement', () => {
  it('repositions the cursor on frames rendered without a fresh setCursorPosition', () => {
    const stream = createStream()
    const render = logUpdate.create(stream as unknown as NodeJS.WriteStream)
    render.setCursorPosition({ x: 4, y: 7 })
    render(trailingFrame('a'))
    expect(stream.writes[0]).toContain('\x1b[3A\x1b[5G')
    stream.writes.length = 0
    render(trailingFrame('b'))
    expect(stream.writes).toHaveLength(1)
    expect(stream.writes[0]).toContain('\x1b[3A\x1b[5G')
    stream.writes.length = 0
    expect(render(trailingFrame('b'))).toBe(false)
    expect(stream.writes).toHaveLength(0)
  })

  it('lands the suffix on the requested row for frames without trailing newline', () => {
    const stream = createStream()
    const render = logUpdate.create(stream as unknown as NodeJS.WriteStream)
    render.setCursorPosition({ x: 2, y: 8 })
    render(fullscreenFrame('a'))
    expect(stream.writes[0].endsWith('\x1b[1A\x1b[3G')).toBe(true)
  })

  it('keeps sync() consistent with the no-trailing-newline base row', () => {
    const stream = createStream()
    const render = logUpdate.create(stream as unknown as NodeJS.WriteStream)
    render.setCursorPosition({ x: 2, y: 8 })
    render.sync(fullscreenFrame('a'))
    expect(stream.writes[0]).toBe('\x1b[1A\x1b[3G')
  })

  it('emits an absolute move for cursor-only updates', () => {
    const stream = createStream()
    const render = logUpdate.create(stream as unknown as NodeJS.WriteStream)
    render.setCursorPosition({ x: 2, y: 8 })
    render(fullscreenFrame('a'))
    stream.writes.length = 0
    render.setCursorPosition({ x: 5, y: 3 })
    render(fullscreenFrame('a'))
    expect(stream.writes).toEqual(['\x1b[4;6H'])
  })
})
