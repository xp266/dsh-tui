import { render } from 'ink-testing-library'
import { describe, expect, it } from 'vitest'
import type { Message } from '../src/model/message.ts'
import { rowInfoAt } from '../src/ui/message/layout.ts'
import { wavePalette, waveSegments } from '../src/ui/message/wave.ts'
import { MessageList } from '../src/ui/message/message-list.tsx'

const BASE = '#00d0ff'

function channelSum(hex: string): number {
  const value = Number.parseInt(hex.slice(1), 16)
  return (value >> 16 & 0xff) + (value >> 8 & 0xff) + (value & 0xff)
}

describe('wave palette', () => {
  it('derives six colors all lighter than the base, growing lighter still', () => {
    const palette = wavePalette(BASE)
    expect(palette).toHaveLength(6)
    const baseSum = channelSum(BASE)
    const sums = palette.map(channelSum)
    for (const sum of sums) {
      expect(sum).toBeGreaterThan(baseSum)
    }
    for (let index = 1; index < sums.length; index++) {
      expect(sums[index]).toBeGreaterThan(sums[index - 1]!)
    }
  })

  it('is stable across repeated calls and theme colors', () => {
    expect(wavePalette(BASE)).toEqual(wavePalette(BASE))
    expect(wavePalette('#808080')).toHaveLength(6)
  })

  it('falls back to the raw color when the base is not hex', () => {
    expect(wavePalette('red')).toEqual(['red'])
  })
})

describe('comet wave segments', () => {
  const palette = wavePalette('#000000')
  const REST = '#000000'
  const colorsOf = (phase: number): Array<string | undefined> =>
    waveSegments('abcdefghij', phase, palette, REST).flatMap(segment => segment.text.split('').map(() => segment.style.color))

  it('leads with the lightest color and trails darker ones to the left', () => {
    expect(colorsOf(0)).toEqual([palette[5], ...Array(9).fill(REST)])
    expect(colorsOf(2)).toEqual([palette[3], palette[4], palette[5], ...Array(7).fill(REST)])
  })

  it('matches the reference frames across the travel', () => {
    expect(colorsOf(9)).toEqual([...Array(4).fill(REST), palette[0], palette[1], palette[2], palette[3], palette[4], palette[5]])
    expect(colorsOf(10)).toEqual([...Array(5).fill(REST), palette[0], palette[1], palette[2], palette[3], palette[4]])
    expect(colorsOf(14)).toEqual([...Array(9).fill(REST), palette[0]])
  })

  it('shows one all-rest frame after the band exits, then re-enters from the left', () => {
    expect(colorsOf(15)).toEqual(Array(10).fill(REST))
    expect(colorsOf(16)).toEqual(colorsOf(0))
    expect(colorsOf(22)).toEqual(colorsOf(6))
  })

  it('merges adjacent characters sharing a color into one segment', () => {
    const segments = waveSegments('abcdefghij', 15, palette, REST)
    expect(segments).toEqual([{ text: 'abcdefghij', style: { color: REST } }])
  })

  it('carries the base style onto every segment', () => {
    const segments = waveSegments('ab', 0, palette, REST, { bold: true })
    expect(segments.map(segment => segment.style.bold)).toEqual([true, true])
  })

  it('returns no segments for empty text', () => {
    expect(waveSegments('', 0, palette, REST)).toEqual([])
  })
})

describe('wave on pending tool bubbles', () => {
  it('marks the first line of a pending ask-user bubble only', () => {
    const ask: Message = { kind: 'bubble', id: 'a', role: 'assistant', content: 'ask_user_question\n\n1. q', variant: 'ask-user', pending: true }
    expect(rowInfoAt([ask], 80, 1)).toMatchObject({ kind: 'text', text: 'ask_user_question', wave: true })
    expect(rowInfoAt([ask], 80, 2)?.wave).toBeUndefined()
  })

  it('marks the first line of a streaming variant bubble and clears it once settled', () => {
    const streaming: Message = { kind: 'bubble', id: 'a', role: 'assistant', content: 'todo_write', variant: 'todo', streaming: true }
    expect(rowInfoAt([streaming], 80, 1)).toMatchObject({ kind: 'text', wave: true })
    const settled: Message = { kind: 'bubble', id: 'a', role: 'assistant', content: 'todo_write', variant: 'todo' }
    expect(rowInfoAt([settled], 80, 1)?.wave).toBeUndefined()
  })

  it('marks plain assistant bubbles never', () => {
    const text: Message = { kind: 'bubble', id: 'a', role: 'assistant', content: 'hello', streaming: true }
    expect(rowInfoAt([text], 80, 0)?.wave).toBeUndefined()
  })
})

describe('wave on tool-diff, compaction, and plan headers', () => {
  it('marks the write bubble header while streaming or running', () => {
    const streaming: Message = { kind: 'tool-diff', id: 'w', tool: 'write', path: 'a.ts', hunks: [], streaming: true }
    expect(rowInfoAt([streaming], 80, 1)).toMatchObject({ kind: 'text', wave: true })
    const running: Message = { kind: 'tool-diff', id: 'w', tool: 'write', path: 'a.ts', hunks: [[{ kind: 'add', text: 'x' }]], running: true }
    expect(rowInfoAt([running], 80, 1)).toMatchObject({ kind: 'text', wave: true })
    const done: Message = { kind: 'tool-diff', id: 'w', tool: 'write', path: 'a.ts', hunks: [[{ kind: 'add', text: 'x' }]], running: false }
    expect(rowInfoAt([done], 80, 1)?.wave).toBeUndefined()
  })

  it('marks the Compact header while running and clears it at the end', () => {
    const running: Message = { kind: 'compaction', id: 'c', compactionId: 'c1', running: true, summary: '' }
    expect(rowInfoAt([running], 80, 1)).toMatchObject({ kind: 'text', text: 'Compact', wave: true })
    const done: Message = { kind: 'compaction', id: 'c', compactionId: 'c1', running: false, summary: 'done' }
    expect(rowInfoAt([done], 80, 1)?.wave).toBeUndefined()
  })

  it('marks the plan header while streaming or running', () => {
    const streaming: Message = { kind: 'plan', id: 'p', body: '', streaming: true }
    expect(rowInfoAt([streaming], 80, 1)).toMatchObject({ kind: 'text', wave: true })
    const running: Message = { kind: 'plan', id: 'p', body: 'steps', running: true }
    expect(rowInfoAt([running], 80, 1)).toMatchObject({ kind: 'text', wave: true })
    const done: Message = { kind: 'plan', id: 'p', body: 'steps', running: false }
    expect(rowInfoAt([done], 80, 1)?.wave).toBeUndefined()
  })

  it('leaves collapsible tool headers without the wave', () => {
    const tool: Message = { kind: 'collapsible', id: 't', label: 'bash', body: '', running: true, collapsed: true }
    expect(rowInfoAt([tool], 80, 0)).toMatchObject({ kind: 'header', spinner: true })
    expect(rowInfoAt([tool], 80, 0)?.wave).toBeUndefined()
  })
})

describe('wave rendering', () => {
  it('keeps the bubble text while the wave animates', () => {
    const ask: Message = { kind: 'bubble', id: 'a', role: 'assistant', content: 'ask_user_question', variant: 'ask-user', pending: true }
    const { lastFrame } = render(
      <MessageList messages={[ask]} height={10} width={80} scrollTop={0} onScroll={() => {}} spinnerTick={3} />,
    )
    expect((lastFrame() ?? '').replace(/\x1b\[[0-9;]*[A-Za-z]/g, '')).toContain('ask_user_question')
  })

  it('renders more than one foreground color while a bubble wave is active', () => {
    const ask: Message = { kind: 'bubble', id: 'a', role: 'assistant', content: 'ask_user_question', variant: 'ask-user', pending: true }
    const { lastFrame } = render(
      <MessageList messages={[ask]} height={10} width={80} scrollTop={0} onScroll={() => {}} spinnerTick={2} />,
    )
    const colors = new Set((lastFrame() ?? '').match(/\x1b\[38;(?:2;\d+;\d+;\d+|5;\d+)m/g))
    expect(colors.size).toBeGreaterThan(1)
  })

  it('renders a single foreground color once the bubble settles', () => {
    const ask: Message = { kind: 'bubble', id: 'a', role: 'assistant', content: 'ask_user_question', variant: 'ask-user' }
    const { lastFrame } = render(
      <MessageList messages={[ask]} height={10} width={80} scrollTop={0} onScroll={() => {}} spinnerTick={2} />,
    )
    const colors = new Set((lastFrame() ?? '').match(/\x1b\[38;(?:2;\d+;\d+;\d+|5;\d+)m/g))
    expect(colors.size).toBeLessThanOrEqual(1)
  })
})
