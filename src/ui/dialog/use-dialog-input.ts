import { useInput, usePaste } from 'ink'
import type { RefObject } from 'react'
import { isMouseResidue } from '../../terminal/mouse.ts'
import { editBackspace, editDelete, editInsert } from '../../core/edit.ts'
import { adjustScroll } from './geometry.ts'
import { asTextItem, clampFocus, focusedItem, moveFocus } from './items.ts'
import type { DialogFocus, DialogItem, DialogRow } from './items.ts'
import { widgetOf } from '../widgets/registry.ts'
import '../widgets/index.ts'
import type { WidgetKeyApi } from '../widgets/types.ts'

export interface DialogLiveState {
  rows: DialogRow[]
  contentRows: DialogRow[]
  focus: DialogFocus
  scrollTop: number
  cursor: number
  value: string
  searchValue: string
  viewportHeight: number
  focusMinRow: number
  focusMaxRow: number
  contentWidth: number
  top: number
  windowHeight: number
}

export interface NavigationSetters {
  setFocus(focus: DialogFocus): void
  setScrollTop(scrollTop: number): void
}

export function applyNavigation(live: DialogLiveState, direction: 'up' | 'down' | 'left' | 'right', search: boolean, setters: NavigationSetters): void {
  const next = moveFocus(live.rows, live.focus, direction)
  const clamped = clampFocus(live.rows, next, live.focusMinRow, live.focusMaxRow)
  setters.setFocus(clamped)
  const contentRow = Math.max(0, clamped.row - (search ? 1 : 0))
  setters.setScrollTop(adjustScroll(live.contentRows, { row: contentRow, col: clamped.col }, live.scrollTop, live.viewportHeight, live.contentWidth))
}

function arrowFromRaw(input: string): 'up' | 'down' | 'left' | 'right' | null {
  const match = /^(?:\[|O)(?:1;)?\d*(?::\d+)?([ABCD])$/.exec(input)
  if (match === null) return null
  const letter = match[1]!
  return letter === 'A' ? 'up' : letter === 'B' ? 'down' : letter === 'C' ? 'right' : 'left'
}

export interface DialogInputOptions {
  live: RefObject<DialogLiveState>
  search: boolean
  closeGuarded: boolean
  onClose(): void
  onCtrlD?(focused: DialogItem | undefined): boolean
  onCtrlE?(focused: DialogItem | undefined): boolean
  onActivity?(): void
  requestSearch(value: string): void
  setFocus(focus: DialogFocus): void
  setScrollTop(scrollTop: number): void
  setCursor(cursor: number): void
}

export function useDialogInput(options: DialogInputOptions): void {
  const { live, search, closeGuarded, onClose, onCtrlD, onCtrlE, onActivity, requestSearch, setFocus, setScrollTop, setCursor } = options
  const setters: NavigationSetters = { setFocus, setScrollTop }
  usePaste(text => {
    onActivity?.()
    const state = live.current
    const current = focusedItem(state.rows[state.focus.row], state.focus.col)
    const textItem = current === undefined ? null : asTextItem(current)
    if (textItem === null) return
    const normalized = text.replace(/\r\n?/g, '\n')
    if (normalized === '') return
    const next = editInsert({ value: textItem.value, cursor: state.cursor }, normalized)
    textItem.onChange(next.value)
    state.value = next.value
    state.cursor = next.cursor
    setCursor(next.cursor)
  })
  useInput((input, key) => {
    const state = live.current
    const liveCurrent = focusedItem(state.rows[state.focus.row], state.focus.col)
    const rawArrow = arrowFromRaw(input)
    const isUp = key.upArrow || rawArrow === 'up'
    const isDown = key.downArrow || rawArrow === 'down'
    const isLeft = key.leftArrow || rawArrow === 'left'
    const isRight = key.rightArrow || rawArrow === 'right'
    if (key.ctrl && input === 'd' && onCtrlD !== undefined && onCtrlD(liveCurrent)) return
    if (key.ctrl && input === 'e' && onCtrlE !== undefined && onCtrlE(liveCurrent)) return
    onActivity?.()
    if (key.escape || (key.ctrl && input === 'c')) {
      if (!(key.ctrl && closeGuarded)) onClose()
      return
    }
    const def = liveCurrent === undefined ? undefined : widgetOf(liveCurrent.type)
    const keyApi: WidgetKeyApi = {
      cursor: state.cursor,
      subCol: state.focus.col,
      setCursor(next) {
        state.cursor = next
        setCursor(next)
      },
      navigate(direction) {
        applyNavigation(state, direction, search, setters)
      },
    }
    if ((isLeft || isRight) && liveCurrent !== undefined && def !== undefined) {
      if (def.onLeftRight?.(liveCurrent, isRight ? 1 : -1, keyApi) === true) return
    }
    if (isUp || isDown) {
      applyNavigation(state, isUp ? 'up' : 'down', search, setters)
      return
    }
    if (key.return) {
      if (liveCurrent === undefined || def === undefined) return
      const handled = def.onEnter?.(liveCurrent, keyApi) ?? false
      if (!handled) applyNavigation(state, 'down', search, setters)
      return
    }
    if (input === ' ' && liveCurrent !== undefined && def?.onSpace !== undefined) {
      def.onSpace(liveCurrent)
      return
    }
    const editingFormInput = liveCurrent !== undefined && liveCurrent.type !== 'search' && widgetOf(liveCurrent.type).editable === true
    if (search && !editingFormInput) {
      const v = state.searchValue
      const onSearchRow = state.focus.row === 0
      const caret = onSearchRow ? Math.max(0, Math.min(state.cursor, v.length)) : v.length
      const applyEdit = (next: { value: string; cursor: number } | null): boolean => {
        if (next === null) return false
        requestSearch(next.value)
        state.cursor = next.cursor
        setCursor(next.cursor)
        return true
      }
      if (key.backspace) {
        applyEdit(editBackspace({ value: v, cursor: caret }))
        return
      }
      if (key.delete) {
        applyEdit(editDelete({ value: v, cursor: caret }))
        return
      }
      if (input && !key.ctrl && !key.meta && !isMouseResidue(input)) {
        applyEdit(editInsert({ value: v, cursor: caret }, input))
        return
      }
    }
    if (def?.editable === true && liveCurrent !== undefined) {
      const textItem = asTextItem(liveCurrent)
      if (textItem === null) return
      const apply = (next: { value: string; cursor: number } | null, trackCursor: boolean): boolean => {
        if (next === null) return false
        state.value = next.value
        textItem.onChange(next.value)
        if (trackCursor) {
          state.cursor = next.cursor
          setCursor(next.cursor)
        }
        return true
      }
      if (key.backspace) {
        apply(editBackspace({ value: state.value, cursor: state.cursor }), true)
      } else if (key.delete) {
        apply(editDelete({ value: state.value, cursor: state.cursor }), false)
      } else if (input && !key.ctrl && !key.meta && !isMouseResidue(input)) {
        apply(editInsert({ value: state.value, cursor: state.cursor }, input), true)
      }
    }
  })
}
