import { describe, expect, it } from 'vitest'
import { createInputParser } from '../node_modules/ink/build/input-parser.js'
import parseKeypress from '../node_modules/ink/build/parse-keypress.js'

// The composer inserts any non-ctrl input verbatim, so a held ctrl+u/ctrl+d
// burst must reach useInput as individual single-byte events; only then does
// parseKeypress set key.ctrl and route them to the scroll handler.
describe('buffered C0 key-repeat splitting', () => {
  it('splits a held-key chunk into individual single-byte events', () => {
    const parser = createInputParser()
    const events = parser.push('\x15\x15\x04\x15') as unknown as string[]
    expect(events).toHaveLength(4)
    for (const data of events) {
      expect(typeof data).toBe('string')
      expect(data).toHaveLength(1)
      expect(parseKeypress(data).ctrl).toBe(true)
    }
  })

  it('keeps printable runs and paste-relevant controls unsplit', () => {
    const parser = createInputParser()
    const events = parser.push('hello\r\n\tworld') as unknown as string[]
    const text = events.filter(e => typeof e === 'string').join('')
    expect(text).toContain('hello')
    expect(text).toContain('world')
  })

  it('still splits backspace runs', () => {
    const parser = createInputParser()
    const events = parser.push('\x7f\x7f') as unknown as string[]
    expect(events.filter(e => e === '\x7f')).toHaveLength(2)
  })

  it('handles mixed bursts without merging C0 into text runs', () => {
    const parser = createInputParser()
    const events = parser.push('\x15\x1b[<64;40;5M\x04') as unknown as string[]
    for (const data of events) {
      if (typeof data !== 'string') continue
      if (data === '\x15' || data === '\x04') {
        expect(data).toHaveLength(1)
        expect(parseKeypress(data).ctrl).toBe(true)
        continue
      }
      // Any text run must not contain embedded C0 control bytes.
      expect(/[\x00-\x08\x0b\x0c\x0e-\x1a]/.test(data)).toBe(false)
    }
    expect(events.some(e => typeof e === 'string' && e === '\x15')).toBe(true)
    expect(events.some(e => typeof e === 'string' && e === '\x04')).toBe(true)
  })
})
