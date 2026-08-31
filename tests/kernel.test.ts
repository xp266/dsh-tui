import { describe, expect, it, vi } from 'vitest'
import { keyedRegistry } from '../src/kernel/registry.ts'

describe('keyedRegistry', () => {
  it('returns values ordered by order then key', () => {
    const r = keyedRegistry<string>()
    r.register('b', 'bee')
    r.register('a', 'aye', { order: 1 })
    r.register('c', 'cee', { order: 1 })
    expect(r.values()).toEqual(['aye', 'cee', 'bee'])
  })

  it('replaces an existing key', () => {
    const r = keyedRegistry<string>()
    r.register('k', 'first')
    r.register('k', 'second')
    expect(r.get('k')).toBe('second')
    expect(r.values()).toEqual(['second'])
  })

  it('restores the previous layer when an override is disposed', () => {
    const r = keyedRegistry<string>()
    r.register('k', 'first')
    const offOverride = r.register('k', 'second')
    expect(r.get('k')).toBe('second')
    offOverride()
    expect(r.get('k')).toBe('first')
  })

  it('skips dead layers when restoring', () => {
    const r = keyedRegistry<string>()
    const offA = r.register('k', 'a')
    r.register('k', 'b')
    offA()
    expect(r.get('k')).toBe('b')
  })

  it('disposer removes its entry and notifies', () => {
    const r = keyedRegistry<string>()
    const off = r.register('a', 'first')
    const listener = vi.fn()
    r.subscribe(listener)
    off()
    expect(r.get('a')).toBeUndefined()
    expect(listener).toHaveBeenCalled()
    expect(r.values()).toEqual([])
  })

  it('disposer is idempotent', () => {
    const r = keyedRegistry<string>()
    const off = r.register('k', 'v')
    off()
    expect(() => off()).not.toThrow()
    expect(r.has('k')).toBe(false)
  })

  it('supports has and keyed access', () => {
    const r = keyedRegistry<number>()
    r.register('k', 42)
    expect(r.has('k')).toBe(true)
    expect(r.get('missing')).toBeUndefined()
  })
})
