import { describe, expect, it } from 'vitest'
import {
  formatTodoBubble,
  isTodoActive,
  normalizeTodos,
  parseTodoArgs,
  parseTodoResult,
  todoProgress,
  todoSymbol,
} from '../src/chat/todo-view.ts'

const items = [
  { content: '首先完成代码', status: 'completed' as const },
  { content: '对代码进行测试', status: 'in_progress' as const },
  { content: '构建项目', status: 'pending' as const },
]

describe('todo symbols', () => {
  it('maps the three lifecycle statuses to fixed brackets', () => {
    expect(todoSymbol('completed')).toBe('[√]')
    expect(todoSymbol('in_progress')).toBe('[●]')
    expect(todoSymbol('pending')).toBe('[ ]')
    expect(todoSymbol(undefined)).toBe('[ ]')
  })
})

describe('normalizeTodos', () => {
  it('keeps known statuses and coerces unknown ones to pending', () => {
    expect(normalizeTodos([
      { content: ' a ', status: 'in_progress' },
      { content: 'b', status: 'weird' },
      { content: '' },
      'x',
    ])).toEqual([
      { content: 'a', status: 'in_progress' },
      { content: 'b', status: 'pending' },
    ])
  })
})

describe('parseTodoArgs / parseTodoResult', () => {
  it('reads the todos array from call arguments', () => {
    expect(parseTodoArgs({ todos: items })).toHaveLength(3)
    expect(parseTodoArgs(undefined)).toEqual([])
    expect(parseTodoArgs({})).toEqual([])
  })

  it('reads the todos array from result JSON text', () => {
    expect(parseTodoResult(JSON.stringify({ todos: items }))).toEqual(items)
    expect(parseTodoResult('not json')).toEqual([])
  })
})

describe('formatTodoBubble', () => {
  it('renders the title, a blank line, the checklist, and a trailing blank line', () => {
    expect(formatTodoBubble(items)).toBe([
      'todo_write',
      '',
      '[√] 首先完成代码',
      '[●] 对代码进行测试',
      '[ ] 构建项目',
    ].join('\n'))
  })
})

describe('isTodoActive / todoProgress', () => {
  it('reports active only when unfinished tasks exist', () => {
    expect(isTodoActive(items)).toBe(true)
    expect(isTodoActive([])).toBe(false)
    expect(isTodoActive([{ content: 'done', status: 'completed' }])).toBe(false)
  })

  it('tracks the in-progress task index against the total', () => {
    expect(todoProgress(items)).toEqual({ current: 2, total: 3 })
  })

  it('falls back to the first pending task without an active marker', () => {
    expect(todoProgress([{ content: 'a', status: 'pending' }, { content: 'b', status: 'pending' }]))
      .toEqual({ current: 1, total: 2 })
  })

  it('disappears once everything is completed', () => {
    expect(todoProgress([{ content: 'a', status: 'completed' }])).toBeUndefined()
  })
})
