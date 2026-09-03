import { describe, expect, it } from 'vitest'
import { editCursorWordLeft, editCursorWordRight, editDeleteWordLeft, editDeleteWordRight } from '../src/core/edit.ts'

function typed(value: string, cursor = value.length) {
  return { value, cursor }
}

describe('word editing', () => {
  it('moves left to the start of the current word', () => {
    expect(editCursorWordLeft(typed('foo bar')).cursor).toBe(4)
    expect(editCursorWordLeft(typed('foobar')).cursor).toBe(0)
    expect(editCursorWordLeft(typed('word')).cursor).toBe(0)
    expect(editCursorWordLeft(typed('  word')).cursor).toBe(2)
  })

  it('moves right to the end of the next word', () => {
    expect(editCursorWordRight(typed('foo bar', 4)).cursor).toBe(7)
    expect(editCursorWordRight(typed('foobar', 3)).cursor).toBe(6)
    expect(editCursorWordRight(typed('foo', 3)).cursor).toBe(3)
    expect(editCursorWordRight(typed('foo   bar', 3)).cursor).toBe(9)
  })

  it('moves right across punctuation before a word', () => {
    expect(editCursorWordRight(typed('foo! bar', 6)).cursor).toBe(8)
  })

  it('deletes the word left of the cursor', () => {
    const cut = editDeleteWordLeft(typed('foo bar'))
    expect(cut?.value).toBe('foo ')
    expect(cut?.cursor).toBe(4)
    const cutPunctuation = editDeleteWordLeft(typed('foo, bar'))
    expect(cutPunctuation?.value).toBe('foo, ')
    expect(editDeleteWordLeft(typed('foo', 0))).toBeNull()
  })

  it('deletes the word right of the cursor', () => {
    const cut = editDeleteWordRight(typed('foo bar', 4))
    expect(cut?.value).toBe('foo ')
    expect(editDeleteWordRight(typed('foo', 3))).toBeNull()
  })

  it('treats cjk text as one word', () => {
    expect(editCursorWordLeft(typed('你好世界')).cursor).toBe(0)
    expect(editCursorWordLeft(typed('hello 你好世界')).cursor).toBe(6)
    expect(editDeleteWordLeft(typed('hello 你好世界'))?.value).toBe('hello ')
    expect(editCursorWordRight(typed('你好世界', 0)).cursor).toBe(4)
  })

  it('treats fullwidth punctuation as separators', () => {
    const value = '你好！世界'
    expect(editCursorWordLeft(typed(value)).cursor).toBe(3)
    expect(editDeleteWordLeft(typed(value))?.value).toBe('你好！')
  })

  it('stays on the line when crossing a line break', () => {
    const value = 'abc\nabc'
    expect(editCursorWordLeft(typed(value, value.length)).cursor).toBe(4)
    const cut = editDeleteWordLeft(typed(value))
    expect(cut?.value).toBe('abc\n')
    expect(cut?.cursor).toBe(4)
    expect(editCursorWordLeft(typed('foo bar', 7)).cursor).toBe(4)
  })

  it('never splits a surrogate pair', () => {
    const value = 'a🙂b'
    expect(editCursorWordLeft(typed(value)).cursor).toBe(0)
    expect(editCursorWordRight(typed(value, 0)).cursor).toBe(4)
  })
})
