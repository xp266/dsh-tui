import { describe, expect, it } from 'vitest'
import { editBackspace, editCursorLeft, editCursorRight, editDelete, editInsert } from '../src/core/edit.ts'

const FAMILY = '👨‍👩‍👧‍👦'

describe('grapheme-safe editing', () => {
  it('backspace removes a whole grapheme cluster, not a code unit', () => {
    const state = editInsert({ value: '', cursor: 0 }, `hi${FAMILY}`)
    const cut = editBackspace(state)
    expect(cut?.value).toBe('hi')
    expect(cut?.cursor).toBe(2)
  })

  it('delete removes a whole grapheme cluster after the cursor', () => {
    const cut = editDelete({ value: `${FAMILY}!`, cursor: 0 })
    expect(cut?.value).toBe('!')
    expect(cut?.cursor).toBe(0)
  })

  it('cursor stepping moves one cluster at a time', () => {
    const state = editInsert({ value: '', cursor: 0 }, `a${FAMILY}b`)
    const mid = editCursorRight(editCursorRight(state))
    expect(mid.cursor).toBe(2 + FAMILY.length)
    const back = editCursorLeft(mid)
    expect(back.cursor).toBe(1 + FAMILY.length)
  })

  it('keeps plain ascii editing identical', () => {
    let state = editInsert({ value: '', cursor: 0 }, 'abc')
    state = editBackspace(state)!
    expect(state.value).toBe('ab')
    state = editInsert(state, 'z')
    expect(state.value).toBe('abz')
    expect(editBackspace({ value: 'x', cursor: 0 })).toBeNull()
    expect(editDelete({ value: 'x', cursor: 1 })).toBeNull()
  })
})
