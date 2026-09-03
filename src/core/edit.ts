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

const SEPARATOR_RANGES: ReadonlyArray<readonly [number, number]> = [
  [0x2010, 0x2027],
  [0x3000, 0x303f],
  [0xff01, 0xff0f],
  [0xff1a, 0xff20],
  [0xff3b, 0xff40],
  [0xff5b, 0xff65],
  [0xffe0, 0xffe4],
]

function isAsciiWordChar(code: number): boolean {
  return (code >= 97 && code <= 122) || (code >= 65 && code <= 90) || (code >= 48 && code <= 57) || code === 95
}

function isLineBreakAt(value: string, index: number): boolean {
  const code = value.charCodeAt(index)
  return code === 10 || code === 13
}

function isSeparatorAt(value: string, index: number): boolean {
  const code = value.charCodeAt(index)
  if (code === 10 || code === 13) return true
  if (isAsciiWordChar(code)) return false
  if (code >= 0x80) {
    for (const [start, end] of SEPARATOR_RANGES) {
      if (code >= start && code <= end) return true
    }
    return false
  }
  if (code === 0x20) return true
  return code >= 0x21 && code <= 0x7e
}

function wordLeftBoundary(value: string, cursor: number): number {
  let i = cursor - 1
  while (i >= 0 && !isLineBreakAt(value, i) && isSeparatorAt(value, i)) i--
  while (i >= 0 && !isSeparatorAt(value, i)) i--
  return i + 1
}

function wordRightBoundary(value: string, cursor: number): number {
  if (cursor >= value.length) return cursor
  if (!isSeparatorAt(value, cursor)) {
    let i = cursor
    while (i < value.length && !isSeparatorAt(value, i)) i++
    return i
  }
  let i = cursor
  while (i < value.length && !isLineBreakAt(value, i) && isSeparatorAt(value, i)) i++
  while (i < value.length && !isSeparatorAt(value, i)) i++
  return i
}

export function editCursorWordLeft(state: EditState): EditState {
  const boundary = wordLeftBoundary(state.value, state.cursor)
  return boundary >= state.cursor ? state : { value: state.value, cursor: boundary }
}

export function editCursorWordRight(state: EditState): EditState {
  const boundary = wordRightBoundary(state.value, state.cursor)
  return boundary <= state.cursor ? state : { value: state.value, cursor: boundary }
}

export function editDeleteWordLeft(state: EditState): EditState | null {
  const boundary = wordLeftBoundary(state.value, state.cursor)
  if (boundary >= state.cursor) return null
  return {
    value: state.value.slice(0, boundary) + state.value.slice(state.cursor),
    cursor: boundary,
  }
}

export function editDeleteWordRight(state: EditState): EditState | null {
  const boundary = wordRightBoundary(state.value, state.cursor)
  if (boundary <= state.cursor) return null
  return {
    value: state.value.slice(0, state.cursor) + state.value.slice(boundary),
    cursor: state.cursor,
  }
}
