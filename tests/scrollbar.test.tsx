import { describe, expect, it } from 'vitest'
import { render } from 'ink-testing-library'
import { Box } from 'ink'
import { MessageList } from '../src/ui/message/message-list.tsx'
import { scrollbarGeometry } from '../src/ui/message/layout.ts'
import type { Message } from '../src/model/message.ts'

const W = 40
const H = 8

function transcript(n: number): Message[] {
  return Array.from({ length: n }, (_, i): Message => ({
    kind: 'bubble',
    id: `u${i}`,
    role: 'user',
    content: `line-${i}`,
  }))
}

const ANSI = /\x1b\[[0-9;]*m/g

function visibleColOfColor(rawLine: string, code: string): number {
  const idx = rawLine.lastIndexOf(`\x1b[48;5;${code}m`)
  if (idx < 0) return -1
  return rawLine.slice(0, idx).replace(ANSI, '').length
}

function framesAt(messages: Message[], scrollTop: number): { raw: string[]; plain: string[] } {
  const instance = render(
    <Box width={W} height={H}>
      <MessageList messages={messages} height={H} width={W} scrollTop={scrollTop} onScroll={() => {}} interactive={false} />
    </Box>,
  )
  const raw = (instance.lastFrame() ?? '').split('\n')
  instance.unmount()
  return { raw, plain: raw.map(line => line.replace(ANSI, '')) }
}

describe('scrollbar rendering', () => {
  it('places track at third column from right edge, two columns clear', () => {
    const messages = transcript(30)
    const { raw, plain } = framesAt(messages, 0)
    console.log(plain.join('\n'))
    for (const line of plain) {
      expect(line.length).toBeLessThanOrEqual(W)
      const padded = line.padEnd(W, ' ')
      expect(padded[W - 1]).toBe(' ')
      expect(padded[W - 2]).toBe(' ')
      expect(padded[W - 3]).not.toBe('')
    }
    expect(raw[0]).toContain('\x1b[48;5;246m')
    expect(raw[1]).toContain('\x1b[48;5;237m')
    expect(visibleColOfColor(raw[0], '246')).toBe(W - 3)
  })

  it('thumb moves to bottom at max scroll', () => {
    const messages = transcript(30)
    const total = messages.length * 4
    const maxScroll = total - H
    const { raw } = framesAt(messages, maxScroll)
    expect(raw[H - 1]).toContain('\x1b[48;5;246m')
    expect(raw[0]).not.toContain('\x1b[48;5;246m')
    void scrollbarGeometry
  })

  it('geometry math', () => {
    expect(scrollbarGeometry(10, 10, 0)).toBeNull()
    expect(scrollbarGeometry(100, 10, 0)).toEqual({ top: 0, height: 1 })
    const mid = scrollbarGeometry(110, 10, 50)!
    expect(mid.height).toBeGreaterThan(0)
    expect(mid.top).toBeGreaterThanOrEqual(0)
    expect(mid.top + mid.height).toBeLessThanOrEqual(10)
    const bottom = scrollbarGeometry(110, 10, 100)!
    expect(bottom.top + bottom.height).toBe(10)
  })
})
