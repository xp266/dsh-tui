import { describe, expect, it } from 'vitest'
import { createMouseParser, isMouseResidue } from '../src/terminal/mouse.ts'
import type { MouseEventData } from '../src/terminal/mouse.ts'

describe('mouse parser', () => {
  it('parses SGR down, drag, and up events', () => {
    const events: MouseEventData[] = []
    const parser = createMouseParser(e => events.push(e))
    parser.feed('\x1b[<0;5;5M')
    parser.feed('\x1b[<32;8;8M')
    parser.feed('\x1b[<0;8;8m')
    expect(events).toEqual([
      { type: 'down', button: 0, x: 4, y: 4, modifiers: { shift: false, alt: false, ctrl: false } },
      { type: 'drag', button: 0, x: 7, y: 7, modifiers: { shift: false, alt: false, ctrl: false } },
      { type: 'up', button: 0, x: 7, y: 7, modifiers: { shift: false, alt: false, ctrl: false } },
    ])
  })

  it('decodes modifiers and scroll direction', () => {
    const events: MouseEventData[] = []
    const parser = createMouseParser(e => events.push(e))
    parser.feed('\x1b[<4;1;1M')
    parser.feed('\x1b[<64;2;2M')
    parser.feed('\x1b[<65;2;3M')
    expect(events).toEqual([
      { type: 'down', button: 0, x: 0, y: 0, modifiers: { shift: true, alt: false, ctrl: false } },
      { type: 'scroll', button: 0, x: 1, y: 1, modifiers: { shift: false, alt: false, ctrl: false }, scrollDirection: 'up' },
      { type: 'scroll', button: 1, x: 1, y: 2, modifiers: { shift: false, alt: false, ctrl: false }, scrollDirection: 'down' },
    ])
  })

  it('handles sequences split across feeds and drops unrelated bytes', () => {
    const events: MouseEventData[] = []
    const parser = createMouseParser(e => events.push(e))
    parser.feed('garbage\x1b[<0;')
    parser.feed('12;34M')
    expect(events).toEqual([
      { type: 'down', button: 0, x: 11, y: 33, modifiers: { shift: false, alt: false, ctrl: false } },
    ])
  })

  it('treats motion without a pressed button as move', () => {
    const events: MouseEventData[] = []
    const parser = createMouseParser(e => events.push(e))
    parser.feed('\x1b[<35;3;3M')
    expect(events).toEqual([
      { type: 'move', button: 0, x: 2, y: 2, modifiers: { shift: false, alt: false, ctrl: false } },
    ])
  })
})

describe('mouse residue filter', () => {
  it('flags whole SGR sequences and escape leftovers', () => {
    expect(isMouseResidue('\x1b[<0;11;5M')).toBe(true)
    expect(isMouseResidue('\x1b')).toBe(true)
    expect(isMouseResidue('[<0;11;5M')).toBe(true)
    expect(isMouseResidue('[<64;2;3m')).toBe(true)
  })

  it('passes normal text and paste content through', () => {
    expect(isMouseResidue('hello')).toBe(false)
    expect(isMouseResidue('多行\n粘贴')).toBe(false)
    expect(isMouseResidue('a[<b')).toBe(false)
  })
})
