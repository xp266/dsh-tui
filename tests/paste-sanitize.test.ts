import { describe, expect, it } from 'vitest'
import { sanitizePastedText } from '../src/core/paste.ts'
import { allocateField, releaseAllFields } from '../src/core/fields.ts'
import { expandFieldChars, fieldRowSegments } from '../src/core/field-view.ts'

describe('paste sanitizer', () => {
  it('drops C0 controls and DEL but keeps newlines and tabs', () => {
    expect(sanitizePastedText('a\u0001b\u0007c\u001bd\u007fe')).toBe('abcde')
    expect(sanitizePastedText('keep\nnew\ttabs')).toBe('keep\nnew\ttabs')
  })

  it('drops the C1 range and bom leftovers', () => {
    expect(sanitizePastedText('a\u0085b\u009fc')).toBe('abc')
    expect(sanitizePastedText('\ufeffread\ufeffgrep')).toBe('readgrep')
  })

  it('drops slotless private-use chars but keeps live field chips', () => {
    const chip = allocateField('paste', '[2 lines]', 'composer')!
    const text = `x\ue100y${chip}z\ue200`
    expect(sanitizePastedText(text)).toBe(`xy${chip}z`)
    releaseAllFields()
    const orphan = sanitizePastedText('a\ue000b')
    expect(orphan).toBe('ab')
  })

  it('keeps astral characters and cjk text intact', () => {
    const text = '你好世界 👍🏽 done'
    expect(sanitizePastedText(text)).toBe(text)
  })

  it('returns the original string when nothing changed', () => {
    const text = 'plain text\nsecond line'
    expect(sanitizePastedText(text)).toBe(text)
  })
})

describe('slotless field char rendering', () => {
  it('expandFieldChars expands live chips and drops reclaimed sentinels', () => {
    const chip = allocateField('paste', '[3 lines]', 'composer')!
    expect(expandFieldChars(`pre ${chip} post`)).toBe('pre [3 lines] post')
    releaseAllFields()
    expect(expandFieldChars(`pre ${chip} post`)).toBe('pre  post')
  })

  it('fieldRowSegments skips reclaimed sentinels', () => {
    const chip = allocateField('paste', '[2 lines]', 'composer')!
    const styled = fieldRowSegments(`x${chip}y`, {})
    expect(styled).toHaveLength(3)
    expect(styled[1]!.text).toBe('[2 lines]')
    releaseAllFields()
    expect(fieldRowSegments(`x${chip}y`, {})).toEqual([{ text: 'xy', style: {} }])
  })
})
