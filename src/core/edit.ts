export interface EditState {
  value: string
  cursor: number
}

function clamp(state: EditState, cursor: number): EditState {
  return { value: state.value, cursor: Math.max(0, Math.min(cursor, state.value.length)) }
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
  return {
    value: state.value.slice(0, state.cursor - 1) + state.value.slice(state.cursor),
    cursor: state.cursor - 1,
  }
}

export function editDelete(state: EditState): EditState | null {
  if (state.cursor >= state.value.length) return null
  return {
    value: state.value.slice(0, state.cursor) + state.value.slice(state.cursor + 1),
    cursor: state.cursor,
  }
}
