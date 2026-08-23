import { describe, expect, it } from 'vitest'
import {
  beginEdit,
  editorCaret,
  editorInsert,
  initialPageState,
  MULTI_LABEL_COL,
  questionPanelLayout,
  SINGLE_LABEL_COL,
} from '../src/ui/panels/question-model.ts'
import type { QuestionPageState } from '../src/ui/panels/question-model.ts'

// No-options question page body:
//   0 question, 1 blank, 2 custom option row, 3.. field lines, blank, legend
const FIELD_ROW = 3

function editingState(value: string, cursor = value.length): QuestionPageState {
  const base = initialPageState({ questions: [{ id: 'q', question: 'Q?' }] })
  const started = beginEdit(base)
  return { ...started, editor: { value, cursor } }
}

describe('question panel caret', () => {
  it('places the caret at the label column on an empty field', () => {
    const state = beginEdit(initialPageState({ questions: [{ id: 'q', question: 'Q?' }] }))
    const layout = questionPanelLayout(state, 72)
    expect(layout.caret).toEqual({ row: FIELD_ROW, col: SINGLE_LABEL_COL })
    expect(layout.lines[FIELD_ROW]).toBe(' '.repeat(SINGLE_LABEL_COL))
  })

  it('tracks plain text length', () => {
    const layout = questionPanelLayout(editingState('abc'), 72)
    expect(layout.lines[FIELD_ROW]).toBe(' '.repeat(SINGLE_LABEL_COL) + 'abc')
    expect(layout.caret).toEqual({ row: FIELD_ROW, col: SINGLE_LABEL_COL + 3 })
  })

  it('moves to the second field row after a hard newline', () => {
    const state = editorInsert(editorInsert(editingState('ab'), '\n'), 'cd')
    const layout = questionPanelLayout(state, 72)
    expect(layout.lines[FIELD_ROW]).toBe(' '.repeat(SINGLE_LABEL_COL) + 'ab')
    expect(layout.lines[FIELD_ROW + 1]).toBe(' '.repeat(SINGLE_LABEL_COL) + 'cd')
    expect(layout.caret).toEqual({ row: FIELD_ROW + 1, col: SINGLE_LABEL_COL + 2 })
  })

  it('wraps long lines inside the field and keeps the caret on the wrapped row', () => {
    const value = 'x'.repeat(80)
    const layout = questionPanelLayout(editingState(value), 72)
    const fieldWidth = 72 - SINGLE_LABEL_COL
    expect(layout.lines[FIELD_ROW]).toBe(' '.repeat(SINGLE_LABEL_COL) + 'x'.repeat(fieldWidth))
    expect(layout.lines[FIELD_ROW + 1]).toBe(' '.repeat(SINGLE_LABEL_COL) + 'x'.repeat(80 - fieldWidth))
    expect(layout.caret).toEqual({ row: FIELD_ROW + 1, col: SINGLE_LABEL_COL + (80 - fieldWidth) })
  })

  it('matches composer layout for a long run of d characters', () => {
    const value = 'd'.repeat(80)
    const layout = questionPanelLayout(editingState(value), 72)
    const fieldWidth = 72 - SINGLE_LABEL_COL
    expect(layout.lines[FIELD_ROW]).toBe(' '.repeat(SINGLE_LABEL_COL) + 'd'.repeat(fieldWidth))
    expect(layout.lines[FIELD_ROW + 1]).toBe(' '.repeat(SINGLE_LABEL_COL) + 'd'.repeat(value.length - fieldWidth))
    expect(layout.caret).toEqual({ row: FIELD_ROW + 1, col: SINGLE_LABEL_COL + (value.length - fieldWidth) })
    const mid = editingState(value.slice(0, 60))
    const midLayout = questionPanelLayout(mid, 72)
    expect(midLayout.caret).toEqual({ row: FIELD_ROW, col: SINGLE_LABEL_COL + 60 })
  })

  it('counts wide characters as two columns for the caret', () => {
    const layout = questionPanelLayout(editingState('你好a'), 72)
    expect(layout.lines[FIELD_ROW]).toBe(' '.repeat(SINGLE_LABEL_COL) + '你好a')
    expect(layout.caret).toEqual({ row: FIELD_ROW, col: SINGLE_LABEL_COL + 5 })
  })

  it('keeps arrow movement inside text bounds', () => {
    let state = editingState('ab\ncd')
    state = editorCaret(state, -1, -1, 67)
    expect(state.editor.cursor).toBe(1)
    state = editorCaret(state, 1, 1, 67)
    expect(state.editor.cursor).toBe(5)
  })

  it('moves between visual rows of a wrapped line preserving the column', () => {
    const value = 'd'.repeat(80)
    const start = editingState(value, 70)
    const up = editorCaret(start, 0, -1, 67)
    expect(up.editor.cursor).toBe(3)
    const down = editorCaret(up, 0, 1, 67)
    expect(down.editor.cursor).toBe(70)
    const pastEnd = editorCaret(down, 0, 1, 67)
    expect(pastEnd.editor.cursor).toBe(70)
  })

  it('preserves display columns across CJK lines', () => {
    const value = '你好世界\nabc'
    const start = editingState(value, value.length)
    const up = editorCaret(start, 0, -1, 67)
    expect(up.editor.cursor).toBe(2)
    const down = editorCaret(up, 0, 1, 67)
    expect(down.editor.cursor).toBe(8)
  })

  it('aligns multi-select fields at the checkbox label column', () => {
    const base = initialPageState({
      questions: [{ id: 'q', question: 'Q?', multiSelect: true }],
    })
    const layout = questionPanelLayout(beginEdit(base), 72)
    expect(layout.caret).toEqual({ row: FIELD_ROW, col: MULTI_LABEL_COL })
  })

  it('caps the field at three visible rows and follows the caret', () => {
    const finalValue = 'l0\nl1\nl2\nl3\nl4'
    const layout = questionPanelLayout(editingState(finalValue), 72)
    const fieldLines = layout.lines.slice(FIELD_ROW, FIELD_ROW + 3)
    expect(fieldLines.map(line => line.trim())).toEqual(['l2', 'l3', 'l4'])
    expect(layout.caret).toEqual({ row: FIELD_ROW + 2, col: SINGLE_LABEL_COL + 2 })
  })
})
