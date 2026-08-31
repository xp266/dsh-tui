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

describe('keyedRegistry layered dispatch', () => {
  it('get resolves to the lowest-order live layer, matching entries order', () => {
    const r = keyedRegistry<string>()
    r.register('k', 'base', { order: 50 })
    r.register('k', 'override', { order: 10 })
    expect(r.get('k')).toBe('override')
    expect(r.entries().map(entry => entry.value)).toEqual(['override'])
  })

  it('get picks by order even when the later registration has the higher order', () => {
    const r = keyedRegistry<string>()
    const offFirst = r.register('k', 'first', { order: 10 })
    r.register('k', 'second', { order: 20 })
    expect(r.get('k')).toBe('first')
    offFirst()
    expect(r.get('k')).toBe('second')
  })

  it('disposing an override hands the slot to the next-lowest order', () => {
    const r = keyedRegistry<string>()
    r.register('k', 'base', { order: 50 })
    const offHigh = r.register('k', 'override', { order: 10 })
    const offSecond = r.register('k', 'middle', { order: 30 })
    offHigh()
    expect(r.get('k')).toBe('middle')
    offSecond()
    expect(r.get('k')).toBe('base')
  })

  it('listener errors do not starve other listeners or corrupt state', () => {
    const r = keyedRegistry<string>()
    const bad = vi.fn(() => { throw new Error('listener broke') })
    const good = vi.fn()
    r.subscribe(bad)
    r.subscribe(good)
    expect(() => r.register('k', 'v')).not.toThrow()
    expect(good).toHaveBeenCalled()
    expect(r.get('k')).toBe('v')
  })

  it('tie-break sorting is locale independent', () => {
    const r = keyedRegistry<string>()
    r.register('Z', 'upper')
    r.register('a', 'lower')
    expect(r.values()).toEqual(['upper', 'lower'])
  })
})
