import { describe, expect, it } from 'vitest'
import {
  dedupeTitle,
  formatDiffDiffs,
  formatReadLines,
  genericCallBody,
  genericCallHeader,
  pathFromTitle,
  pickPrimaryParam,
  readBodyCol,
  recoveryLines,
  relativize,
  remainingArgsJson,
  terminalCallBody,
  truncateSummary,
} from '../src/chat/tool-view.ts'

describe('tool-view', () => {
  it('relativizes paths under the workspace and leaves others absolute', () => {
    expect(relativize('/home/u/p/src/main.py', '/home/u/p')).toBe('src/main.py')
    expect(relativize('/home/u/p', '/home/u/p')).toBe('.')
    expect(relativize('/other/x', '/home/u/p')).toBe('/other/x')
  })

  it('truncates overlong summaries at the safety cap plus ellipsis', () => {
    expect(truncateSummary('short')).toBe('short')
    expect(truncateSummary('command=ls -la src, description=List files', 20)).toBe('command=ls -la src, ...')
    expect(truncateSummary('中文'.repeat(200)).length).toBeLessThan(200)
    const huge = `value=${'x'.repeat(1000)}`
    const capped = truncateSummary(huge)
    expect(capped.length).toBeLessThan(310)
    expect(capped.endsWith('...')).toBe(true)
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

describe('generic param pickers', () => {
  it('prefers the shortest single-line value', () => {
    expect(pickPrimaryParam({ rev: 1, id: 'goal-32d852a3-1fbf-47e6-a8c9-838dbf9e8114', name: 'hello' }))
      .toEqual({ key: 'rev', value: '1' })
    expect(pickPrimaryParam({ command: 'ls -la src', timeout: 30 })).toEqual({ key: 'timeout', value: '30' })
    expect(pickPrimaryParam({ file_path: '/w/src/a.py', limit: 50 })).toEqual({ key: 'limit', value: '50' })
  })

  it('falls back to the first single-line value in argument order', () => {
    expect(pickPrimaryParam({ a: 'bb', b: 'aaa' })).toEqual({ key: 'a', value: 'bb' })
    expect(pickPrimaryParam({ todos: [{ content: 'x' }], flag: true })).toEqual({ key: 'flag', value: 'true' })
  })

  it('ignores multi-line strings, arrays, and objects', () => {
    expect(pickPrimaryParam({ cmd: 'ls\n-rla', todos: [{ content: 'x' }], nested: { deep: 1 } })).toBeUndefined()
  })

  it('returns nothing for non-object args', () => {
    expect(pickPrimaryParam('plain')).toBeUndefined()
    expect(pickPrimaryParam(undefined)).toBeUndefined()
  })

  it('drops the primary key from the remaining args JSON', () => {
    expect(remainingArgsJson({ a: 1, b: 2 }, 'a')).toBe('{\n  "b": 2\n}')
    expect(remainingArgsJson({ a: 1 }, 'a')).toBe('')
    expect(remainingArgsJson({ a: 1 }, undefined)).toBe('{\n  "a": 1\n}')
  })

  it('extracts the path after the leading verb of a diff title', () => {
    expect(pathFromTitle('Write foo.txt', '')).toBe('foo.txt')
    expect(pathFromTitle('Edit src/a.ts', 'x')).toBe('src/a.ts')
    expect(pathFromTitle(undefined, 'fallback.ts')).toBe('fallback.ts')
  })

  it('dedupes the tool name out of titles generically', () => {
    expect(dedupeTitle('ralph', 'ralph')).toBe('')
    expect(dedupeTitle('workflow', 'workflow: toolcheck-probe')).toBe('toolcheck-probe')
    expect(dedupeTitle('create_goal', 'Create goal')).toBe('goal')
    expect(dedupeTitle('grep', 'Grep EDITED|marker in /home/xp266/test/_toolcheck'))
      .toBe('EDITED|marker in /home/xp266/test/_toolcheck')
    expect(dedupeTitle('glob', 'Glob *.ts in src')).toBe('*.ts in src')
    expect(dedupeTitle('todo_write', 'Update todo list')).toBe('Update todo list')
    expect(dedupeTitle('web_search', 'DeepSeek AI latest model release news')).toBe('DeepSeek AI latest model release news')
    expect(dedupeTitle('bash', 'sleep 15; echo hello')).toBe('sleep 15; echo hello')
    expect(dedupeTitle('update_goal', 'Complete goal')).toBe('Complete goal')
    expect(dedupeTitle('skill', 'Load skill bash')).toBe('Load skill bash')
    expect(dedupeTitle('get_goal', 'Read current goal')).toBe('Read current goal')
    expect(dedupeTitle('bash', '')).toBe('')
  })
})

describe('generic call bodies', () => {
  it('renders the terminal prompt prefix only for an explicit workdir', () => {
    expect(terminalCallBody('ls -la', undefined, '/w')).toBe('ls -la')
    expect(terminalCallBody('ls -la', '/w', '/w')).toBe('ls -la')
    expect(terminalCallBody('ls -la', 'src', '/w')).toBe('src $ ls -la')
    expect(terminalCallBody('ls -la', '/w/../w/src', '/w')).toBe('src $ ls -la')
    expect(terminalCallBody(undefined, 'src', '/w')).toBe('src $ ')
  })

  it('renders rawInput verbatim or as pretty JSON, then the content text', () => {
    expect(genericCallBody('job-1', '', '')).toBe('job-1')
    expect(genericCallBody({ job_id: 'job-1' }, '', '')).toBe('{\n  "job_id": "job-1"\n}')
    expect(genericCallBody(undefined, 'list the files', '')).toBe('list the files')
    expect(genericCallBody('sleep 100', 'wait', '')).toBe('sleep 100\n\nwait')
    expect(genericCallBody(undefined, '', '')).toBe('')
  })

  it('drops body parts the header already carries', () => {
    expect(genericCallBody('echo "bg job start"', 'Run a background job to test job tools', 'Run a background job to test job tools'))
      .toBe('echo "bg job start"')
    expect(genericCallBody('echo "bg job start"', 'Run a background job to test job tools', 'echo "bg job start"'))
      .toBe('Run a background job to test job tools')
    expect(genericCallBody('bash-1', '', 'Read output from background job bash-1')).toBe('')
  })

  it('prefers the shorter of title and content for the generic header', () => {
    expect(genericCallHeader('bash', { title: 'echo "bg job start"', description: 'Run a background job' }, ''))
      .toBe('Run a background job')
    expect(genericCallHeader('job_output', { title: 'Read output from background job bash-1' }, 'bash-1'))
      .toBe('bash-1')
    expect(genericCallHeader('skill', { title: 'Load skill bash' }, 'multi\nline')).toBe('Load skill bash')
    expect(genericCallHeader('tool', {}, '')).toBe('')
  })

  it('extracts the spill recovery footer from truncated result text', () => {
    expect(recoveryLines('a\nb\nFull grep result stored at: /tmp/spill-1. Read it with the read tool.'))
      .toEqual(['Full grep result stored at: /tmp/spill-1. Read it with the read tool.'])
    expect(recoveryLines('plain output\nno footer here')).toEqual([])
  })
})