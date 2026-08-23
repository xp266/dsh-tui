import { describe, expect, it } from 'vitest'
import {
  formatAskUserBubble,
  formatAskUserError,
  parseAskAnswers,
  parseAskQuestions,
} from '../src/chat/question-view.ts'

const questions = [
  { id: 'q1', question: '第一个问题', options: [{ label: 'A' }, { label: 'B' }] },
  { id: 'q2', question: '第二个问题', multi_select: true },
]

describe('parseAskQuestions', () => {
  it('reads questions from raw call arguments and normalizes multi_select', () => {
    const parsed = parseAskQuestions({ questions })
    expect(parsed).toHaveLength(2)
    expect(parsed[0]).toMatchObject({ id: 'q1', question: '第一个问题' })
    expect(parsed[1]?.multiSelect).toBe(true)
  })

  it('returns an empty list for malformed arguments', () => {
    expect(parseAskQuestions(undefined)).toEqual([])
    expect(parseAskQuestions({})).toEqual([])
    expect(parseAskQuestions({ questions: ['x'] })).toEqual([])
  })
})

describe('parseAskAnswers', () => {
  it('reads answers from the result JSON text', () => {
    const text = JSON.stringify({ answers: [{ id: 'q1', selected: ['A'] }, { id: 'q2', selected: [], custom: '自由输入' }] })
    const parsed = parseAskAnswers(text)
    expect(parsed).toEqual([
      { id: 'q1', selected: ['A'] },
      { id: 'q2', selected: [], custom: '自由输入' },
    ])
  })

  it('returns an empty list for malformed result text', () => {
    expect(parseAskAnswers('not json')).toEqual([])
    expect(parseAskAnswers('{"answers": 3}')).toEqual([])
  })
})

describe('formatAskUserBubble', () => {
  it('formats each question with its answer below', () => {
    const answers = [{ id: 'q1', selected: ['B'] }, { id: 'q2', selected: [], custom: '自由输入' }]
    expect(formatAskUserBubble(parseAskQuestions({ questions }), answers)).toBe(
      [
        'ask_user_question',
        '',
        '1. 第一个问题',
        '   B',
        '2. 第二个问题',
        '   自由输入',
      ].join('\n'),
    )
  })

  it('joins multi-select labels and marks missing answers', () => {
    const parsed = parseAskQuestions({ questions })
    const answers = [{ id: 'q2', selected: ['X', 'Y'] }]
    expect(formatAskUserBubble(parsed, answers)).toBe(
      [
        'ask_user_question',
        '',
        '1. 第一个问题',
        '   (Question not answered)',
        '2. 第二个问题',
        '   X, Y',
      ].join('\n'),
    )
  })
})

describe('formatAskUserError', () => {
  it('replaces the answer area with the error line', () => {
    expect(formatAskUserError('Error: no selection')).toBe('ask_user_question\n\nError: no selection')
  })
})
