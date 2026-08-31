import { describe, expect, it } from 'vitest'
import { allocateField, fieldCharsIn, fieldSlotOf, imageChipLabel, isFieldChar, pinField, releaseField, releaseFields, releaseAllFields, releaseUnreferenced } from '../src/core/fields.ts'
import { colToCharIndex, lineBreaks, locToPoint, textWidth, wrapLines } from '../src/core/text.ts'
import { expandFieldChars } from '../src/core/field-view.ts'

describe('special fields registry', () => {
  it('allocates unique chars and expands them to labels', () => {
    releaseAllFields()
    const a = allocateField('image', imageChipLabel(8), 'composer')
    const b = allocateField('paste', '[4 lines]', 'composer')
    expect(a).not.toBeNull()
    expect(b).not.toBeNull()
    expect(a).not.toBe(b)
    expect(isFieldChar(a!)).toBe(true)
    expect(fieldSlotOf(a!)?.label).toBe('[8 images]')
    expect(expandFieldChars(`你看${a!}${b!}`)).toBe('你看[8 images][4 lines]')
    expect(expandFieldChars('plain')).toBe('plain')
    releaseAllFields()
  })

  it('reports field-aware widths', () => {
    releaseAllFields()
    const char = allocateField('image', '[8 images]', 'message')!
    expect(textWidth(`pre${char}post`)).toBe(3 + 10 + 4)
    expect(colToCharIndex(`pre${char}post`, 12)).toBe(4)
    expect(colToCharIndex(`pre${char}post`, 14)).toBe(5)
    releaseAllFields()
  })

  it('keeps a field whole when wrapping', () => {
    releaseAllFields()
    const chip = allocateField('image', '[8 images]', 'message')!
    const text = `abc ${chip} defgh`
    const lines = wrapLines(text, 10)
    const expanded = lines.map(expandFieldChars)
    expect(expanded.length).toBeGreaterThan(1)
    for (const line of expanded) {
      expect(line.includes('[8 images]')).toBe(line === expanded.find(entry => entry.includes('[8 images]')))
    }
    expect(expanded.join('\n')).toContain('[8 images]')
    const breaks = lineBreaks(text, 10)
    expect(breaks.every(row => row.end - row.start > 0 || row.start === row.end)).toBe(true)
    const point = locToPoint(text, 10, text.length)
    expect(point.row).toBe(lines.length - 1)
    releaseAllFields()
  })

  it('releases slots so chars can be reallocated', () => {
    releaseAllFields()
    const first = allocateField('image', '[1 images]', 'composer')!
    releaseAllFields()
    const second = allocateField('image', '[2 images]', 'composer')!
    expect(second).toBe(first)
    expect(fieldSlotOf(second)?.label).toBe('[2 images]')
    releaseAllFields()
  })

  it('collects field chars present in a text', () => {
    releaseAllFields()
    const char = allocateField('image', '[3 images]', 'message')!
    expect(fieldCharsIn(`x${char}y`)).toEqual([char])
    expect(fieldCharsIn('xyz')).toEqual([])
    releaseAllFields()
  })
})

describe('field pins', () => {
  it('pins keep slots alive across reclaim scans', () => {
    releaseAllFields()
    const char = allocateField('image', '[9 images]', 'composer')!
    const unpin = pinField(char)!
    releaseUnreferenced('composer', 'text without the chip')
    expect(fieldSlotOf(char)?.label).toBe('[9 images]')
    unpin()
    releaseUnreferenced('composer', 'text without the chip')
    expect(fieldSlotOf(char)).toBeUndefined()
    releaseAllFields()
  })

  it('releaseField respects pins', () => {
    releaseAllFields()
    const char = allocateField('paste', '[2 lines]', 'message')!
    const unpin = pinField(char)!
    releaseField(char)
    expect(fieldSlotOf(char)).toBeDefined()
    unpin()
    releaseField(char)
    expect(fieldSlotOf(char)).toBeUndefined()
  })
})
