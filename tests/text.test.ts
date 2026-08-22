import { describe, it, expect } from 'vitest'
import { lineBreaks, locToPoint, wrapLines } from '../src/core/text'

describe('lineBreaks', () => {
  it('tracks char offsets across wraps', () => {
    expect(lineBreaks('中'.repeat(46) + '好啊', 92)).toEqual([
      { start: 0, end: 46 },
      { start: 46, end: 48 },
    ])
  })

  it('tracks explicit newlines', () => {
    expect(lineBreaks('abc\ndef', 92)).toEqual([
      { start: 0, end: 3 },
      { start: 4, end: 7 },
    ])
  })

  it('handles empty text', () => {
    expect(lineBreaks('', 92)).toEqual([{ start: 0, end: 0 }])
  })
})

describe('locToPoint', () => {
  const value = '中'.repeat(46) + '好啊'

  it('places cursor at wrap boundary', () => {
    expect(locToPoint(value, 92, 46)).toEqual({ row: 0, col: 92 })
  })

  it('places cursor after the first wrapped char', () => {
    expect(locToPoint(value, 92, 47)).toEqual({ row: 1, col: 2 })
  })

  it('places cursor at the very end', () => {
    expect(locToPoint(value, 92, 48)).toEqual({ row: 1, col: 4 })
  })

  it('places cursor at the start', () => {
    expect(locToPoint(value, 92, 0)).toEqual({ row: 0, col: 0 })
  })

  it('handles explicit newlines', () => {
    expect(locToPoint('abc\ndef', 92, 4)).toEqual({ row: 1, col: 0 })
    expect(locToPoint('abc\ndef', 92, 3)).toEqual({ row: 0, col: 3 })
  })

  it('agrees with wrapLines line count', () => {
    expect(locToPoint(value, 92, 48).row).toBe(wrapLines(value, 92).length - 1)
  })
})