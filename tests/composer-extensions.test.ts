import { describe, expect, it } from 'vitest'
import { registerPasteHandler, claimPaste } from '../src/ui/input/composer-paste.ts'
import { registerComposerKeyBinding, handleComposerKeyBindings } from '../src/ui/input/composer-keys.ts'
import { specialFieldFactory, registerFieldKind, releaseAllFields } from '../src/core/fields.ts'
import { insertFieldSpec, expandComposerValue } from '../src/ui/input/composer-fields.ts'
import { expandFieldChars } from '../src/core/field-view.ts'
import type { TuiKey } from '../src/contract/index.ts'

const key: TuiKey = {
  upArrow: false, downArrow: false, leftArrow: false, rightArrow: false,
  pageDown: false, pageUp: false, return: false, escape: false,
  ctrl: false, shift: false, tab: false, backspace: false, delete: false, meta: false,
}

describe('paste handler registry', () => {
  it('lets a plugin claim a paste and falls through when none matches', () => {
    const off = registerPasteHandler({
      id: 'test-paste',
      handle: context => context.text.startsWith('CLAIM:') ? { insert: 'claimed' } : undefined,
    })
    expect(claimPaste('CLAIM:rest', 0)?.insert).toBe('claimed')
    expect(claimPaste('plain', 0)).toBeUndefined()
    off()
    expect(claimPaste('CLAIM:rest', 0)).toBeUndefined()
  })
})

describe('composer key registry', () => {
  it('consumes keys in order until a binding returns true', () => {
    const calls: string[] = []
    const offA = registerComposerKeyBinding({ id: 'a', order: 10, handle: () => { calls.push('a'); return false } })
    const offB = registerComposerKeyBinding({ id: 'b', order: 20, handle: () => { calls.push('b'); return true } })
    const offC = registerComposerKeyBinding({ id: 'c', order: 30, handle: () => { calls.push('c'); return true } })
    expect(handleComposerKeyBindings('x', key)).toBe(true)
    expect(calls).toEqual(['a', 'b'])
    offA()
    offB()
    offC()
  })
})

describe('special field factory', () => {
  it('creates, labels, and releases fields', () => {
    releaseAllFields()
    const factory = specialFieldFactory()
    const char = factory.create({ kind: 'ticket', label: '[T-1]', owner: 'composer' })
    expect(char).not.toBeNull()
    expect(factory.isFieldChar(char!)).toBe(true)
    expect(factory.labelOf(char!)).toBe('[T-1]')
    factory.release(char!)
    expect(factory.labelOf(char!)).toBeUndefined()
    releaseAllFields()
  })

  it('uses kind expand on send when provided', () => {
    releaseAllFields()
    registerFieldKind({
      kind: 'ticket',
      style: () => ({ color: '#000000', background: '#ffffff' }),
      expand: data => `[ticket ${String(data)}]`,
    })
    const fields = new Map()
    const char = insertFieldSpec({ kind: 'ticket', label: '[T-1]', data: 42 }, fields)
    const submission = expandComposerValue(`see ${char}`, fields)
    expect(submission.text).toBe('see [ticket 42]')
    expect(expandFieldChars(`see ${char}`)).toBe('see [T-1]')
    releaseAllFields()
  })
})
