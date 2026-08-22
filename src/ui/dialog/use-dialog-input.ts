import { useInput, usePaste } from 'ink'
import type { RefObject } from 'react'
import { isMouseResidue } from '../../terminal/mouse.ts'
import { adjustScroll } from './geometry.ts'
import { clampFocus, focusedItem, moveFocus } from './items.ts'
import type { DialogFocus, DialogItem, DialogRow } from './items.ts'

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
  onActivity?(): void
  requestSearch(value: string): void
  setFocus(focus: DialogFocus): void
  setScrollTop(scrollTop: number): void
  setCursor(cursor: number): void
}

export function useDialogInput(options: DialogInputOptions): void {
  const { live, search, closeGuarded, onClose, onCtrlD, onActivity, requestSearch, setFocus, setScrollTop, setCursor } = options
  const setters: NavigationSetters = { setFocus, setScrollTop }
  usePaste(text => {
    onActivity?.()
    const state = live.current
    const current = state.rows[state.focus.row]?.items[state.focus.col]
    if (current?.type !== 'input' && current?.type !== 'search') return
    const normalized = text.replace(/\r\n?/g, '\n')
    if (normalized === '') return
    const c = state.cursor
    const next = current.value.slice(0, c) + normalized + current.value.slice(c)
    current.onChange(next)
    state.value = next
    state.cursor = c + normalized.length
    setCursor(c + normalized.length)
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
    onActivity?.()
    if (key.escape || (key.ctrl && input === 'c')) {
      if (!(key.ctrl && closeGuarded)) onClose()
      return
    }
    if ((isLeft || isRight) && liveCurrent?.type === 'select' && liveCurrent.options.length > 1) {
      const index = Math.max(0, liveCurrent.options.indexOf(liveCurrent.value))
      const length = liveCurrent.options.length
      const chosen = isRight
        ? liveCurrent.options[(index + 1) % length]
        : liveCurrent.options[(index - 1 + length) % length]
      if (chosen !== undefined) liveCurrent.onChange(chosen)
      return
    }
    if ((isLeft || isRight) && liveCurrent?.type === 'input') {
      const c = state.cursor
      if (isLeft && c > 0) {
        state.cursor = c - 1
        setCursor(c - 1)
      }
      if (isRight && c < liveCurrent.value.length) {
        state.cursor = c + 1
        setCursor(c + 1)
      }
      return
    }
    if ((isLeft || isRight) && liveCurrent?.type === 'actions') {
      applyNavigation(state, isRight ? 'right' : 'left', search, setters)
      return
    }
    if (isUp || isDown) {
      applyNavigation(state, isUp ? 'up' : 'down', search, setters)
      return
    }
    if (key.return) {
      if (liveCurrent === undefined) return
      switch (liveCurrent.type) {
        case 'input':
          if (liveCurrent.onEnter) liveCurrent.onEnter()
          else applyNavigation(state, 'down', search, setters)
          break
        case 'search':
          applyNavigation(state, 'down', search, setters)
          break
        case 'select':
          if (liveCurrent.onEnter) liveCurrent.onEnter()
          else applyNavigation(state, 'down', search, setters)
          break
        case 'button':
          liveCurrent.onPress()
          break
        case 'checkbox':
          liveCurrent.onConfirm()
          break
        case 'actions':
          if (state.focus.col === 1) liveCurrent.onCancel()
          else liveCurrent.onConfirm()
          break
        case 'header':
          break
      }
      return
    }
    if (input === ' ' && liveCurrent?.type === 'checkbox') {
      liveCurrent.onToggle()
      return
    }
    if (search && liveCurrent?.type !== 'input') {
      const v = state.searchValue
      if ((key.backspace || key.delete) && v.length > 0) {
        requestSearch(v.slice(0, -1))
        return
      }
      if (input && !key.ctrl && !key.meta && !isMouseResidue(input)) {
        requestSearch(v + input)
        return
      }
    }
    if (liveCurrent?.type === 'input' || liveCurrent?.type === 'search') {
      const c = state.cursor
      const v = state.value
      if (key.backspace) {
        if (c > 0) {
          const next = v.slice(0, c - 1) + v.slice(c)
          state.value = next
          state.cursor = c - 1
          liveCurrent.onChange(next)
          setCursor(c - 1)
        }
      } else if (key.delete) {
        if (c < v.length) {
          const next = v.slice(0, c) + v.slice(c + 1)
          state.value = next
          liveCurrent.onChange(next)
        }
      } else if (input && !key.ctrl && !key.meta && !isMouseResidue(input)) {
        const next = v.slice(0, c) + input + v.slice(c)
        state.value = next
        state.cursor = c + input.length
        liveCurrent.onChange(next)
        setCursor(c + input.length)
      }
    }
  })
}
