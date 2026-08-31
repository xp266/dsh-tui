import { segmentGraphemes } from './text.ts'

export interface EditState {
  value: string
  cursor: number
}

function clamp(state: EditState, cursor: number): EditState {
  return { value: state.value, cursor: Math.max(0, Math.min(cursor, state.value.length)) }
}

interface Span {
  start: number
  end: number
}

function spanAtOrBefore(value: string, cursor: number): Span | undefined {
  for (const segment of segmentGraphemes(value)) {
    const end = segment.index + segment.segment.length
    if (end >= cursor) return { start: segment.index, end }
  }
  return undefined
}

function spanAtOrAfter(value: string, cursor: number): Span | undefined {
  for (const segment of segmentGraphemes(value)) {
    if (segment.index >= cursor) return { start: segment.index, end: segment.index + segment.segment.length }
  }
  return undefined
}

export function editInsert(state: EditState, text: string): EditState {
  if (text === '') return clamp(state, state.cursor)
  const cursor = Math.max(0, Math.min(state.cursor, state.value.length))
  return {
    value: state.value.slice(0, cursor) + text + state.value.slice(cursor),
    cursor: cursor + text.length,
  }
}

export function editBackspace(state: EditState): EditState | null {
  if (state.cursor <= 0) return null
  const span = spanAtOrBefore(state.value, state.cursor)
  if (span === undefined) return null
  return {
    value: state.value.slice(0, span.start) + state.value.slice(span.end),
    cursor: span.start,
  }
}

export function editDelete(state: EditState): EditState | null {
  if (state.cursor >= state.value.length) return null
  const span = spanAtOrAfter(state.value, state.cursor)
  if (span === undefined) return null
  return {
    value: state.value.slice(0, state.cursor) + state.value.slice(span.end),
    cursor: state.cursor,
  }
}

export function editCursorLeft(state: EditState): EditState {
  if (state.cursor <= 0) return state
  const span = spanAtOrBefore(state.value, state.cursor)
  return clamp(state, span === undefined ? state.cursor - 1 : span.start)
}

export function editCursorRight(state: EditState): EditState {
  if (state.cursor >= state.value.length) return state
  const span = spanAtOrAfter(state.value, state.cursor)
  return clamp(state, span === undefined ? state.cursor + 1 : span.end)
}
