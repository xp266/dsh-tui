import { describe, expect, it } from 'vitest'
import {
  formatDiffDiffs,
  formatReadLines,
  readBodyCol,
  relativize,
  summarizeOthers,
  summarizeParams,
  truncateSummary,
} from '../src/chat/tool-view.ts'

describe('tool-view', () => {
  it('relativizes paths under the workspace and leaves others absolute', () => {
    expect(relativize('/home/u/p/src/main.py', '/home/u/p')).toBe('src/main.py')
    expect(relativize('/home/u/p', '/home/u/p')).toBe('.')
    expect(relativize('/other/x', '/home/u/p')).toBe('/other/x')
  })

  it('truncates overlong summaries at 20 display chars plus ellipsis', () => {
    expect(truncateSummary('short')).toBe('short')
    const long = 'command=ls -la src, description=List files'
    expect(truncateSummary(long)).toBe('command=ls -la src, ...')
    expect(truncateSummary('中文'.repeat(20)).length).toBeLessThan(20)
  })

  it('summarizes params as name=value pairs joined by commas', () => {
    expect(summarizeParams({ command: 'ls -la' }, '/w')).toBe('command=ls -la')
    expect(summarizeParams({ file_path: '/w/src/a.py', offset: 1, limit: 50 }, '/w')).toBe('file_path=src/a.py, ...')
    expect(summarizeParams({ plugin: { kind: 'new' }, enabled: true }, '/w')).toBe('plugin={"kind":"new"...')
    expect(summarizeParams({ a: null, b: undefined, c: '' }, '/w')).toBe('')
    expect(summarizeParams('plain', '/w')).toBe('plain')
  })

  it('summarizes the remaining params after skipping keys', () => {
    expect(summarizeOthers({ file_path: '/w/src/main.py', offset: 1, limit: 50 }, ['file_path'], '/w')).toBe(', offset=1, limit=50')
    expect(summarizeOthers({ file_path: '/w/src/main.py' }, ['file_path'], '/w')).toBe('')
  })

  it('formats an edit call diff as removals before additions', () => {
    const text = formatDiffDiffs([
      { path: '/w/src/main.py', oldText: 'import aaa\nimport bbb', newText: 'import ccc' },
    ])
    expect(text).toBe('- import aaa\n- import bbb\n+ import ccc')
  })

  it('formats a new-file write as additions only', () => {
    const text = formatDiffDiffs([{ path: '/w/new.py', oldText: null, newText: 'a\nb' }])
    expect(text).toBe('+ a\n+ b')
  })

  it('aligns context lines plain around replaced lines', () => {
    const text = formatDiffDiffs([
      { path: '/w/a.py', oldText: 'ctx1\nremoved\nctx2', newText: 'ctx1\nadded\nctx2' },
    ])
    expect(text).toBe('  ctx1\n- removed\n+ added\n  ctx2')
  })

  it('keeps trailing context when lines were appended', () => {
    const text = formatDiffDiffs([
      { path: '/w/a.py', oldText: 'a\nb', newText: 'a\nb\nc' },
    ])
    expect(text).toBe('  a\n  b\n+ c')
  })

  it('formats read lines with right-aligned numbers', () => {
    const lines = [
      { number: 9, text: 'aaa' },
      { number: 10, text: 'bbb' },
      { number: 123, text: 'ccc' },
    ]
    expect(formatReadLines(lines)).toBe('  9 aaa\n 10 bbb\n123 ccc')
  })

  it('computes the read body column so the last digit lands under the symbol', () => {
    expect(readBodyCol([{ number: 1, text: 'a' }])).toBe(2)
    expect(readBodyCol([{ number: 9, text: 'a' }, { number: 10, text: 'b' }])).toBe(1)
    expect(readBodyCol([{ number: 100, text: 'a' }])).toBe(0)
    expect(readBodyCol([{ number: 1000, text: 'a' }])).toBe(0)
  })
})