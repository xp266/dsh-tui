import type { LineSelection, PointerEventFrame } from '../../contract/index.ts'
import { panelContains } from '../layout-service.ts'
import { POINTER_BUILTIN_ORDER } from './registry.ts'

const WHEEL_LINES = 3

export interface PointerBuiltinDeps {
  inInputContent(y: number): boolean
  inMessageArea(screenRow: number): boolean
  toContentRow(screenRow: number): number
  activeHintRegion(): { top: number; bottom: number } | null
  focusRowFor(current: LineSelection, eventY: number): number
  clampMessageFocus(anchorInMessage: boolean, eventY: number): number
  setPointerArea(inMessageArea: boolean): void
  onScrollbarDown(x: number, y: number): boolean
  onScrollbarDrag(y: number): void
  stopDragScroll(): void
  updateDragScroll(eventY: number): void
  setSelection(next: LineSelection | null | ((current: LineSelection | null) => LineSelection | null)): void
  getSelection(): LineSelection | null
  rowHasText(y: number): boolean
  rowInfoAt(y: number): { messageId: string; clickable: boolean; selectable: boolean } | null | undefined
  inputClickAt(y: number, x: number): void
  panelClickAt(y: number, x: number): void
  dialogWheel(y: number, dir: -1 | 1): boolean
  panelWheel(dir: -1 | 1): boolean
  hintWheel(dir: -1 | 1): void
  inputWheel(dir: -1 | 1): void
  hintPress(x: number, y: number): void
  hintDragStart(x: number, y: number): void
  hintDragMove(x: number, y: number): void
  hintRelease(x: number, y: number, dragged: boolean): void
  onScroll(next: number): void
  toggleMessage(id: string): void
  dialogClick(y: number, x: number): void
}

/**
 * The six builtin gesture handlers (scrollbar, hint, dialog, panel, input,
 * message area) collapsed into one contribution. Each owns its candidate
 * state; the dispatcher guarantees beginDown() runs on every press so stale
 * candidates never survive into the next gesture.
 */
export function createBuiltinPointerHandler(deps: PointerBuiltinDeps) {
  const scrollbarSession: { current: { grabOffset: number } | null } = { current: null }
  const hintGesture: { current: { x: number; y: number; dragged: boolean } | null } = { current: null }
  const clickCandidate: { current: { messageId: string; y: number; x: number; moved: boolean } | null } = { current: null }
  const dialogCandidate: { current: { x: number; y: number } | null } = { current: null }
  const panelCandidate: { current: { x: number; y: number } | null } = { current: null }
  const inputCandidate: { current: { x: number; y: number } | null } = { current: null }
  // Which sub-handler owns the active gesture; '' means none.
  let owner = ''

  function clearCandidates(): void {
    clickCandidate.current = null
    dialogCandidate.current = null
    panelCandidate.current = null
    inputCandidate.current = null
  }

  function extendOrDrag(candidate: { current: { x: number; y: number } | null }, event: PointerEventFrame): void {
    const anchor = candidate.current
    if (anchor !== null) {
      candidate.current = null
      deps.setSelection({
        anchorRow: anchor.y,
        anchorCol: anchor.x,
        focusRow: event.event.y,
        focusCol: event.event.x,
        inMessage: false,
      })
      return
    }
    deps.setSelection(current => current === null || current.inMessage ? current : {
      ...current,
      focusRow: event.event.y,
      focusCol: event.event.x,
    })
  }

  return {
    order: POINTER_BUILTIN_ORDER,
    id: 'builtin.pointer',
    beginDown(): void {
      clearCandidates()
      scrollbarSession.current = null
      hintGesture.current = null
      owner = ''
    },
    onDown(event: PointerEventFrame): boolean {
      const { x, y } = event.event
      if (deps.onScrollbarDown(x, y)) {
        owner = 'scrollbar'
        return true
      }
      const hintRegionActive = (() => {
        if (event.ui.dialogOpen || event.ui.panelActive) return false
        const region = deps.activeHintRegion()
        return region !== null && y >= region.top && y <= region.bottom
      })()
      if (hintRegionActive) {
        hintGesture.current = { x, y, dragged: false }
        deps.hintPress(x, y)
        clearCandidates()
        deps.stopDragScroll()
        deps.setPointerArea(false)
        deps.setSelection(null)
        owner = 'hint'
        return true
      }
      if (event.ui.dialogOpen) {
        const anchorable = deps.rowHasText(y)
        dialogCandidate.current = { x, y }
        if (anchorable) deps.setSelection({ anchorRow: y, anchorCol: x, focusRow: y, focusCol: x, inMessage: false })
        owner = 'dialog'
        return true
      }
      if (event.ui.panelActive && panelContains(y, { columns: event.ui.columns, rows: event.ui.rows, inputHeight: event.ui.inputHeight, messageHeight: event.ui.messageHeight, panelHeight: null })) {
        panelCandidate.current = { x, y }
        if (deps.rowHasText(y)) {
          deps.setSelection({ anchorRow: y, anchorCol: x, focusRow: y, focusCol: x, inMessage: false })
        }
        owner = 'panel'
        return true
      }
      if (!event.ui.dialogOpen && !event.ui.panelActive && deps.inInputContent(y)) {
        inputCandidate.current = { x, y }
        deps.setSelection(null)
        owner = 'input'
        return true
      }
      const contentRow = deps.toContentRow(y)
      const hit = deps.rowInfoAt(y)
      if (hit?.clickable) {
        clickCandidate.current = { messageId: hit.messageId, y, x, moved: false }
        owner = 'message'
        return true
      }
      // Message rows anchor on the row model: artwork made of block glyphs
      // never passes the screen-level text check. Chrome rows keep it.
      const anchorInMessage = deps.inMessageArea(y)
      if (anchorInMessage ? hit?.selectable === true : deps.rowHasText(y)) {
        deps.setPointerArea(anchorInMessage)
        deps.setSelection({ anchorRow: contentRow, anchorCol: x, focusRow: contentRow, focusCol: x, inMessage: anchorInMessage })
        owner = 'message'
        return true
      }
      // Nothing claimed; the dispatcher keeps default drag behavior alive.
      return false
    },
    onDrag(event: PointerEventFrame): void {
      const { x, y } = event.event
      switch (owner) {
        case 'scrollbar':
          deps.onScrollbarDrag(y)
          return
        case 'hint': {
          const gesture = hintGesture.current
          if (gesture === null) return
          if (!gesture.dragged) {
            gesture.dragged = true
            deps.hintDragStart(x, y)
          } else {
            deps.hintDragMove(x, y)
          }
          return
        }
        case 'input':
          extendOrDrag(inputCandidate, event)
          return
        case 'panel':
          extendOrDrag(panelCandidate, event)
          return
        case 'dialog':
          extendOrDrag(dialogCandidate, event)
          return
        case 'message': {
          const candidate = clickCandidate.current
          if (candidate !== null) {
            candidate.moved = true
            clickCandidate.current = null
            const anchorInMessage = deps.inMessageArea(candidate.y)
            deps.setPointerArea(anchorInMessage)
            deps.setSelection({
              anchorRow: deps.toContentRow(candidate.y),
              anchorCol: candidate.x,
              focusRow: deps.clampMessageFocus(anchorInMessage, y),
              focusCol: x,
              inMessage: anchorInMessage,
            })
            return
          }
          deps.setSelection(current => current === null ? current : {
            ...current,
            focusRow: deps.focusRowFor(current, y),
            focusCol: x,
          })
          deps.updateDragScroll(y)
          return
        }
        default:
          deps.setSelection(current => current === null ? current : {
            ...current,
            focusRow: deps.focusRowFor(current, y),
            focusCol: x,
          })
          deps.updateDragScroll(y)
      }
    },
    onUp(event: PointerEventFrame): void {
      const { x, y } = event.event
      switch (owner) {
        case 'scrollbar':
          scrollbarSession.current = null
          return
        case 'hint': {
          const gesture = hintGesture.current
          hintGesture.current = null
          if (gesture !== null) deps.hintRelease(x, y, gesture.dragged)
          return
        }
        case 'input': {
          const candidate = inputCandidate.current
          inputCandidate.current = null
          if (candidate !== null) deps.inputClickAt(candidate.y, candidate.x)
          return
        }
        case 'panel': {
          const candidate = panelCandidate.current
          panelCandidate.current = null
          if (candidate !== null) {
            deps.panelClickAt(candidate.y, candidate.x)
            deps.setSelection(null)
          }
          return
        }
        case 'dialog': {
          const candidate = dialogCandidate.current
          dialogCandidate.current = null
          if (candidate !== null) {
            deps.dialogClick(candidate.y, candidate.x)
            deps.setSelection(null)
          }
          return
        }
        case 'message': {
          const candidate = clickCandidate.current
          clickCandidate.current = null
          if (candidate !== null && !candidate.moved) deps.toggleMessage(candidate.messageId)
          return
        }
        default:
          return
      }
    },
    onWheel(event: PointerEventFrame): boolean {
      const { y } = event.event
      const dir: -1 | 1 = event.event.scrollDirection === 'up' ? -1 : 1
      if (event.ui.dialogOpen) return deps.dialogWheel(y, dir)
      if (event.ui.panelActive && panelContains(y, { columns: event.ui.columns, rows: event.ui.rows, inputHeight: event.ui.inputHeight, messageHeight: event.ui.messageHeight, panelHeight: null })) return deps.panelWheel(dir)
      if (!event.ui.dialogOpen && !event.ui.panelActive) {
        const region = deps.activeHintRegion()
        if (region !== null && y >= region.top && y <= region.bottom) {
          deps.hintWheel(dir)
          return true
        }
      }
      if (!event.ui.dialogOpen && !event.ui.panelActive && deps.inInputContent(y)) {
        deps.inputWheel(dir)
        return true
      }
      const delta = dir === -1 ? -WHEEL_LINES : WHEEL_LINES
      const live = event.ui.getScroll()
      const next = Math.max(0, Math.min(live.maxScroll, live.top + delta))
      if (next !== live.top) deps.onScroll(next)
      return true
    },
  }
}

export type BuiltinPointerHandler = ReturnType<typeof createBuiltinPointerHandler>
