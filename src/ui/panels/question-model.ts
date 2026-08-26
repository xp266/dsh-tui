import { inputLayout, moveCaretLine } from '../../core/composer-layout.ts'
import { INPUT_WIDTH_OFFSET } from '../../core/metrics.ts'
import { textWidth, wrapLines } from '../../core/text.ts'
import { editInsert, editBackspace } from '../../core/edit.ts'
import type { EditState } from '../../core/edit.ts'
import { mergeRuns } from '../../core/segments.ts'
import type { MarkStyle, Segment } from '../../core/segments.ts'
import { colors } from '../../theme.ts'
import type { AskQuestionItemLike, AskUserQuestionAnswerItemLike, AskUserQuestionRequestLike } from '../../chat/interactions.ts'

const questionStyle = (): MarkStyle => ({ color: colors.panelQuestionText, bold: true })
const focusedLabelStyle = (): MarkStyle => ({ color: colors.workspaceWriteText })
const descriptionStyle = (): MarkStyle => ({ color: colors.toolBodyText })
const checkStyle = (): MarkStyle => ({ color: colors.success })
const unansweredStyle = (): MarkStyle => ({ color: colors.errorText })

function seg(text: string, style?: MarkStyle): Segment {
  return { text, style: style ?? {} }
}

function lineOf(parts: Array<string | Segment>): Segment[] {
  return mergeRuns(parts.map(part => typeof part === 'string' ? seg(part) : part))
}

function pushWrapped(target: Segment[][], text: string, indent: number, width: number, style?: MarkStyle): void {
  const lines = wrapLines(text, Math.max(4, width - indent))
  target.push(lineOf([' '.repeat(indent), seg(lines[0]!, style)]))
  for (const line of lines.slice(1)) {
    target.push(lineOf([' '.repeat(indent), seg(line, style)]))
  }
}

export const CURSOR_COL = 0
export const NUMBER_COL = 2
export const SINGLE_LABEL_COL = 5
export const MULTI_LABEL_COL = 9
export const MAX_FIELD_ROWS = 3
export const MAX_BODY_ROWS = 14
export const MAX_DETAIL_ROWS = 7

export interface QuestionDraft {
  selected: string[]
  customText: string
  customChecked: boolean
}

export interface QuestionPageState {
  request: AskUserQuestionRequestLike
  drafts: QuestionDraft[]
  page: number
  cursors: number[]
  editing: boolean
  editor: EditState
  detailScroll: number[]
}

export function initialPageState(request: AskUserQuestionRequestLike): QuestionPageState {
  return {
    request,
    drafts: request.questions.map(() => ({ selected: [], customText: '', customChecked: false })),
    page: 0,
    cursors: request.questions.map(() => 0),
    editing: false,
    editor: { value: '', cursor: 0 },
    detailScroll: request.questions.map(() => 0),
  }
}

export function scrollDetail(state: QuestionPageState, delta: number): QuestionPageState {
  if (state.editing) return state
  const next = Math.max(0, state.detailScroll[state.page]! + delta)
  if (next === state.detailScroll[state.page]) return state
  return {
    ...state,
    detailScroll: state.detailScroll.map((value, index) => index === state.page ? next : value),
  }
}

export function interactiveRowCount(question: AskQuestionItemLike): number {
  return (question.options?.length ?? 0) + 1
}

function labelCol(question: AskQuestionItemLike): number {
  return question.multiSelect === true ? MULTI_LABEL_COL : SINGLE_LABEL_COL
}

function isCustomRow(question: AskQuestionItemLike, row: number): boolean {
  return row >= (question.options?.length ?? 0)
}

export function beginEdit(state: QuestionPageState): QuestionPageState {
  const draft = state.drafts[state.page]!
  return {
    ...state,
    editing: true,
    editor: { value: draft.customText, cursor: draft.customText.length },
  }
}

export function commitEdit(state: QuestionPageState): QuestionPageState {
  const question = state.request.questions[state.page]
  if (question === undefined || !state.editing) return state
  const text = state.editor.value.trim()
  return {
    ...state,
    editing: false,
    editor: { value: '', cursor: 0 },
    drafts: state.drafts.map((draft, index) => index === state.page
      ? {
          ...draft,
          customText: state.editor.value,
          customChecked: text !== '',
          ...(question.multiSelect !== true && text !== '' ? { selected: [] } : {}),
        }
      : draft),
  }
}

export function cancelEdit(state: QuestionPageState): QuestionPageState {
  return { ...state, editing: false, editor: { value: '', cursor: 0 } }
}

export function toggleCustomChecked(state: QuestionPageState): QuestionPageState {
  return {
    ...state,
    drafts: state.drafts.map((draft, index) => index === state.page
      ? { ...draft, customChecked: !draft.customChecked }
      : draft),
  }
}

export function toggleOption(state: QuestionPageState): QuestionPageState {
  const question = state.request.questions[state.page]
  if (question === undefined) return state
  const row = state.cursors[state.page]!
  if (isCustomRow(question, row)) return toggleCustomChecked(state)
  const option = question.options![row]!
  if (question.multiSelect === true) {
    return {
      ...state,
      drafts: state.drafts.map((draft, index) => index === state.page
        ? {
            ...draft,
            selected: draft.selected.includes(option.label)
              ? draft.selected.filter(label => label !== option.label)
              : [...draft.selected, option.label],
          }
        : draft),
    }
  }
  return {
    ...state,
    drafts: state.drafts.map((draft, index) => index === state.page
      ? { ...draft, selected: [option.label], customChecked: false }
      : draft),
  }
}

export function enterOnRow(state: QuestionPageState): QuestionPageState {
  const question = state.request.questions[state.page]
  if (question === undefined || state.editing) return commitEdit(state)
  const draft = state.drafts[state.page]!
  const row = state.cursors[state.page]!
  if (!isCustomRow(question, row)) return toggleOption(state)
  if (draft.customChecked) return toggleCustomChecked(state)
  return beginEdit(state)
}

export function moveCursor(state: QuestionPageState, delta: -1 | 1): QuestionPageState {
  const question = state.request.questions[state.page]
  if (question === undefined || state.editing) return state
  const count = interactiveRowCount(question)
  if (count === 0) return state
  const next = ((state.cursors[state.page]! + delta) % count + count) % count
  return {
    ...state,
    cursors: state.cursors.map((value, index) => index === state.page ? next : value),
  }
}

export function switchPage(state: QuestionPageState, delta: -1 | 1): QuestionPageState {
  if (state.editing) return state
  const total = state.request.questions.length + 1
  return { ...state, page: Math.max(0, Math.min(total - 1, state.page + delta)) }
}

export function editorInsert(state: QuestionPageState, text: string): QuestionPageState {
  if (!state.editing || text === '') return state
  return { ...state, editor: editInsert(state.editor, text) }
}

export function editorBackspace(state: QuestionPageState): QuestionPageState {
  if (!state.editing) return state
  const next = editBackspace(state.editor)
  return next === null ? state : { ...state, editor: next }
}

export function fieldWidthOf(question: AskQuestionItemLike, innerWidth: number): number {
  return Math.max(8, innerWidth - labelCol(question))
}

export function editorCaret(state: QuestionPageState, deltaCol: number, deltaLine: number, fieldWidth: number): QuestionPageState {
  if (!state.editing) return state
  const value = state.editor.value
  let cursor = state.editor.cursor
  if (deltaCol !== 0) cursor = Math.max(0, Math.min(value.length, cursor + deltaCol))
  if (deltaLine !== 0) cursor = moveCaretLine(value, cursor, fieldWidth, deltaLine === 1 ? 1 : -1)
  return { ...state, editor: { value, cursor } }
}

export function buildAnswers(state: QuestionPageState): AskUserQuestionAnswerItemLike[] {
  return state.request.questions.map((question, index) => {
    const draft = state.drafts[index]!
    const labels = (question.options ?? []).filter(option => draft.selected.includes(option.label)).map(option => option.label)
    const custom = draft.customText.trim()
    if (draft.customChecked && custom !== '') {
      if (question.multiSelect === true) {
        return { id: question.id, selected: labels, ...(custom === '' ? {} : { custom }) }
      }
      return { id: question.id, selected: [], custom }
    }
    return { id: question.id, selected: labels }
  })
}

export function reviewAnswerOf(question: AskQuestionItemLike, draft: QuestionDraft): string {
  const labels = (question.options ?? []).filter(option => draft.selected.includes(option.label)).map(option => option.label)
  const custom = draft.customText.trim()
  if (draft.customChecked && custom !== '') {
    return question.multiSelect === true && labels.length > 0
      ? [...labels, custom].join(', ')
      : custom
  }
  return labels.length === 0 ? '(Question not answered)' : labels.join(', ')
}

export interface PanelHitRow {
  line: number
  optionIndex: number
}

export interface PanelLayout {
  lines: Segment[][]
  focusLine: number
  caret: { row: number; col: number } | null
  height: number
  hitRows: PanelHitRow[]
}

export function questionPanelLayout(state: QuestionPageState, innerWidth: number, scrollWindow: number = MAX_BODY_ROWS): PanelLayout {
  const total = state.request.questions.length + 1
  const isReview = state.page >= state.request.questions.length
  const body: Segment[][] = []
  const hitRows: PanelHitRow[] = []
  let focusLine = 0
  let caret: { row: number; col: number } | null = null

  if (isReview) {
    body.push(lineOf([seg('Confirm Selection', questionStyle())]))
    body.push([])
    for (const [index, question] of state.request.questions.entries()) {
      pushWrapped(body, `${index + 1}. ${question.question}`, NUMBER_COL, innerWidth)
      const answer = reviewAnswerOf(question, state.drafts[index]!)
      const answerStyle = answer === '(Question not answered)' ? unansweredStyle() : descriptionStyle()
      pushWrapped(body, answer, SINGLE_LABEL_COL, innerWidth, answerStyle)
    }
    body.push([])
    body.push(legend(state.page, total))
  } else {
    const question = state.request.questions[state.page]!
    const multi = question.multiSelect === true
    const labX = labelCol(question)
    const fieldWidth = Math.max(8, innerWidth - labX)
    const above: Segment[][] = []
    if (question.header !== undefined) {
      pushWrapped(above, question.header, 0, innerWidth, questionStyle())
      above.push(lineOf([]))
    }
    pushWrapped(above, question.question, 0, innerWidth, questionStyle())
    above.push(lineOf([]))

    const below: Segment[][] = []
    let focusInBelow = -1
    let caretInBelow: { row: number; col: number } | null = null
    const hitsInBelow: PanelHitRow[] = []
    const rows = interactiveRowCount(question)
    const cursorRow = state.cursors[state.page]!
    const draft = state.drafts[state.page]!
    for (let i = 0; i < rows; i++) {
      const focused = cursorRow === i
      const marker = focused ? '❯' : ' '
      const num = `${i + 1}.`
      if (focused) focusInBelow = below.length
      hitsInBelow.push({ line: below.length, optionIndex: i })
      if (i === rows - 1) {
        const checked = draft.customChecked
        const box = multi ? (checked ? '[✓]' : '[ ]') : ''
        const tick = !multi && checked ? '  ✓' : ''
        below.push(lineOf([
          seg(marker, focused ? checkStyle() : undefined),
          ' ',
          seg(num, focused ? focusedLabelStyle() : undefined),
          ...(box === '' ? [] : [seg(' ' + box, focused ? focusedLabelStyle() : undefined)]),
          ' ',
          seg('Custom input content', focused ? focusedLabelStyle() : undefined),
          ...(tick === '' ? [] : [seg(tick, checkStyle())]),
        ]))
        const editing = state.editing
        const value = editing ? state.editor.value : draft.customText
        const cursor = editing ? state.editor.cursor : value.length
        const field = inputLayout(value, cursor, fieldWidth + INPUT_WIDTH_OFFSET)
        const firstVisible = Math.min(
          Math.max(0, field.cursorRow - (MAX_FIELD_ROWS - 1)),
          Math.max(0, field.lines.length - MAX_FIELD_ROWS),
        )
        const visible = field.lines.slice(firstVisible, firstVisible + MAX_FIELD_ROWS)
        const fieldStart = below.length
        for (const line of visible) {
          below.push(lineOf([' '.repeat(labX), seg(line, descriptionStyle())]))
        }
        if (editing) {
          caretInBelow = {
            row: fieldStart + field.cursorRow - firstVisible,
            col: labX + field.cursorCol,
          }
        }
      } else {
        const option = question.options![i]!
        const chosen = draft.selected.includes(option.label)
        const box = multi ? (chosen ? '[✓]' : '[ ]') : ''
        const tick = !multi && chosen ? '  ✓' : ''
        below.push(lineOf([
          seg(marker, focused ? checkStyle() : undefined),
          ' ',
          seg(num, focused ? focusedLabelStyle() : undefined),
          ...(box === '' ? [] : [seg(' ' + box, focused ? focusedLabelStyle() : undefined)]),
          ' ',
          seg(option.label, focused ? focusedLabelStyle() : undefined),
          ...(tick === '' ? [] : [seg(tick, checkStyle())]),
        ]))
        if (option.description !== undefined && option.description !== '') {
          pushWrapped(below, option.description, labX, innerWidth, descriptionStyle())
        }
      }
    }
    below.push(lineOf([]))
    below.push(legend(state.page, total))

    body.push(...above)
    const detail = question.detail !== undefined && question.detail !== ''
      ? wrapLines(question.detail, Math.max(8, innerWidth - SINGLE_LABEL_COL))
      : []
    if (detail.length > 0) {
      const budget = Math.max(3, scrollWindow - body.length - below.length)
      if (detail.length <= budget) {
        for (const line of detail) {
          body.push(lineOf(['  ', seg(line, descriptionStyle())]))
        }
      } else {
        const contentRows = Math.max(1, budget - 2)
        const maxStart = detail.length - contentRows
        const start = Math.max(0, Math.min(state.detailScroll[state.page]!, maxStart))
        if (start > 0) {
          body.push(lineOf([seg(`… ${start} lines above`, descriptionStyle())]))
        }
        for (const line of detail.slice(start, start + contentRows)) {
          body.push(lineOf(['  ', seg(line, descriptionStyle())]))
        }
        if (start + contentRows < detail.length) {
          body.push(lineOf([seg(`… ${detail.length - start - contentRows} more lines`, descriptionStyle())]))
        }
      }
    }
    const base = body.length
    body.push(...below)
    if (focusInBelow >= 0) focusLine = base + focusInBelow
    if (caretInBelow !== null) caret = { row: base + caretInBelow.row, col: caretInBelow.col }
    for (const hit of hitsInBelow) {
      hitRows.push({ line: base + hit.line, optionIndex: hit.optionIndex })
    }
  }

  const window = Math.max(3, Math.min(scrollWindow, body.length))
  if (body.length <= window) {
    return { lines: body, focusLine, caret: finalizeCaret(caret, body), height: body.length, hitRows }
  }
  let start = Math.max(0, Math.min(focusLine - Math.floor(window / 2), body.length - window))
  const lines = body.slice(start, start + window)
  const shifted = hitRows
    .map(hit => ({ line: hit.line - start, optionIndex: hit.optionIndex }))
    .filter(hit => hit.line >= 0 && hit.line < lines.length)
  return { lines, focusLine: focusLine - start, caret: finalizeCaret(caret, body, start), height: window, hitRows: shifted }
}

function finalizeCaret(
  caret: { row: number; col: number } | null,
  body: Segment[][],
  start = 0,
): { row: number; col: number } | null {
  if (caret === null) return null
  const row = Math.max(0, Math.min(body.length - 1, caret.row)) - start
  return { row, col: caret.col }
}

function legend(page: number, total: number): Segment[] {
  const prefix = `${page + 1}/${total}`
  const text = page + 1 === total
    ? `${prefix}  ⇆ page  enter submit  esc close`
    : `${prefix}  ⇆ page  ⇅ wrap  enter select  esc close`
  return lineOf([seg(text, descriptionStyle())])
}
