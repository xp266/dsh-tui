import { useEffect, useMemo, useRef, useState } from 'react'
import type { RefObject } from 'react'
import type { ScreenCapture } from '../../terminal/screen.ts'
import { createMouseController } from '../../terminal/mouse.ts'
import { CHROME_FRAME_ROWS, HINT_INPUT_GAP_ROWS, MESSAGE_INPUT_GAP_ROWS } from '../../core/metrics.ts'
import { hintBlockTop } from '../../core/metrics.ts'
import { clampFocusRow, toScreenSelection } from '../../model/selection.ts'
import type { LineSelection } from '../../model/selection.ts'
import type { ScrollSnapshot } from './use-scroll.ts'
import { rowInfoAt, rowCount, scrollbarGeometry } from '../message/layout.ts'
import { SCROLLBAR_COL_FROM_EDGE } from '../../core/metrics.ts'
import type { InputBarHandle } from '../input/input-bar.tsx'
import type { PanelPointerHandle } from '../panels/approval-panel.tsx'
import type { CommandHintState } from '../input/commands.ts'
import type { Message } from '../../model/message.ts'

const WHEEL_SCROLL_LINES = 3
const DRAG_SCROLL_INTERVAL_MS = 15

export interface HintRegion {
  top: number
  bottom: number
}

export function hintRegion(rows: number, hint: CommandHintState | null, dialogOpen: boolean, inputHeight: number): HintRegion | null {
  if (hint === null || dialogOpen) return null
  const top = hintBlockTop(rows, inputHeight, hint.commands.length)
  const bottom = rows - inputHeight - MESSAGE_INPUT_GAP_ROWS - HINT_INPUT_GAP_ROWS
  return { top, bottom }
}

export interface MouseSelectionOptions {
  messages: Message[]
  columns: number
  rows: number
  scrollTop: number
  messageHeight: number
  inputHeight: number
  dialogOpen: boolean
  hint: CommandHintState | null
  screen?: ScreenCapture
  inputHandle?: RefObject<InputBarHandle | null>
  panelActive?: boolean
  panelHandle?: RefObject<PanelPointerHandle | null>
  getScroll(): ScrollSnapshot
  onHintPress?(x: number, y: number): void
  onHintDragStart?(x: number, y: number): void
  onHintDragMove?(x: number, y: number): void
  onHintRelease?(x: number, y: number, dragged: boolean): void
  onDialogWheel?(y: number, dir: -1 | 1): boolean
  onScroll(next: number): void
  onToggleMessage(id: string): void
  onDialogClick(y: number, x: number): void
}

export interface MouseSelectionState {
  selection: LineSelection | null
  messageAreaSelection: LineSelection | null
  chromeSelection: LineSelection | null
  setSelection(next: LineSelection | null | ((current: LineSelection | null) => LineSelection | null)): void
  clearSelection(): void
}

export function useMouseSelection(options: MouseSelectionOptions): MouseSelectionState {
  const { messages, columns, rows, scrollTop, messageHeight, inputHeight, dialogOpen, hint, screen, inputHandle, panelActive = false, panelHandle, getScroll, onHintPress, onHintDragStart, onHintDragMove, onHintRelease, onDialogWheel, onScroll, onToggleMessage, onDialogClick } = options
  const [selection, setSelection] = useState<LineSelection | null>(null)
  const messagesRef = useRef(messages)
  const widthRef = useRef(columns)
  const rowsRef = useRef(rows)
  const scrollTopRef = useRef(scrollTop)
  const messageHeightRef = useRef(messageHeight)
  const inputHeightRef = useRef(inputHeight)
  const dialogOpenRef = useRef(dialogOpen)
  const hintStateRef = useRef<CommandHintState | null>(null)
  const screenRef = useRef<ScreenCapture | undefined>(screen)
  const inputHandleRef = useRef(inputHandle)
  const panelActiveRef = useRef(panelActive)
  const panelHandleRef = useRef(panelHandle)
  const getScrollRef = useRef(getScroll)
  const onHintPressRef = useRef(onHintPress)
  const onHintDragStartRef = useRef(onHintDragStart)
  const onHintDragMoveRef = useRef(onHintDragMove)
  const onHintReleaseRef = useRef(onHintRelease)
  const onDialogWheelRef = useRef(onDialogWheel)
  const clickCandidateRef = useRef<{ messageId: string; y: number; x: number; moved: boolean } | null>(null)
  const dialogClickCandidateRef = useRef<{ x: number; y: number } | null>(null)
  const panelClickCandidateRef = useRef<{ x: number; y: number } | null>(null)
  const inputClickCandidateRef = useRef<{ x: number; y: number } | null>(null)
  const onScrollRef = useRef(onScroll)
  const onToggleMessageRef = useRef(onToggleMessage)
  const onDialogClickRef = useRef(onDialogClick)
  const selectionRef = useRef<LineSelection | null>(null)
  const autoScrollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const autoScrollDirRef = useRef<-1 | 1>(1)
  const pointerSessionRef = useRef({ inMessageArea: false })
  const scrollbarSessionRef = useRef<{ grabOffset: number } | null>(null)
  messagesRef.current = messages
  widthRef.current = columns
  rowsRef.current = rows
  scrollTopRef.current = scrollTop
  messageHeightRef.current = messageHeight
  inputHeightRef.current = inputHeight
  dialogOpenRef.current = dialogOpen
  hintStateRef.current = hint
  screenRef.current = screen
  inputHandleRef.current = inputHandle
  panelActiveRef.current = panelActive
  panelHandleRef.current = panelHandle
  getScrollRef.current = getScroll
  onHintPressRef.current = onHintPress
  onHintDragStartRef.current = onHintDragStart
  onHintDragMoveRef.current = onHintDragMove
  onHintReleaseRef.current = onHintRelease
  onDialogWheelRef.current = onDialogWheel
  onScrollRef.current = onScroll
  onToggleMessageRef.current = onToggleMessage
  onDialogClickRef.current = onDialogClick
  selectionRef.current = selection
  useEffect(() => {
    const stopDragScroll = (): void => {
      if (autoScrollTimerRef.current !== null) {
        clearInterval(autoScrollTimerRef.current)
        autoScrollTimerRef.current = null
      }
    }
    const extendSelectionTo = (row: number): void => {
      setSelection(current => current === null || !current.inMessage
        ? current
        : { ...current, focusRow: Math.max(0, row) })
    }
    const startDragScroll = (dir: -1 | 1): void => {
      if (autoScrollTimerRef.current !== null && autoScrollDirRef.current === dir) return
      stopDragScroll()
      autoScrollDirRef.current = dir
      autoScrollTimerRef.current = setInterval(() => {
        const scrollTop = scrollTopRef.current
        const totalRows = rowCount(messagesRef.current, widthRef.current)
        const maxScroll = Math.max(0, totalRows - messageHeightRef.current)
        if ((dir === -1 && scrollTop <= 0) || (dir === 1 && scrollTop >= maxScroll)) {
          stopDragScroll()
          return
        }
        const next = scrollTop + dir
        onScrollRef.current(next)
        extendSelectionTo(dir === 1 ? next + messageHeightRef.current - 1 : next)
      }, DRAG_SCROLL_INTERVAL_MS)
    }
    const updateDragScroll = (eventY: number): void => {
      if (!pointerSessionRef.current.inMessageArea || dialogOpenRef.current) {
        stopDragScroll()
        return
      }
      let dir: -1 | 1 | 0 = 0
      if (eventY <= 0) dir = -1
      else if (eventY >= messageHeightRef.current - 1) dir = 1
      if (dir === 0) stopDragScroll()
      else startDragScroll(dir)
    }
    const inInputContent = (y: number): boolean => {
      const top = rowsRef.current - inputHeightRef.current
      return y >= top && y <= top + inputHeightRef.current - CHROME_FRAME_ROWS
    }
    const scrollbarInfo = (): { geom: { top: number; height: number }; maxScroll: number; travel: number } | null => {
      if (dialogOpenRef.current) return null
      const mh = messageHeightRef.current
      if (mh < 1) return null
      const totalRows = rowCount(messagesRef.current, widthRef.current)
      if (totalRows <= mh) return null
      const geom = scrollbarGeometry(totalRows, mh, scrollTopRef.current)
      if (geom === null) return null
      return { geom, maxScroll: totalRows - mh, travel: Math.max(1, mh - geom.height) }
    }
    const onScrollbarDown = (x: number, y: number): boolean => {
      if (x !== widthRef.current - SCROLLBAR_COL_FROM_EDGE || y >= messageHeightRef.current) return false
      const info = scrollbarInfo()
      if (info === null) return false
      stopDragScroll()
      setSelection(null)
      let grabOffset: number
      if (y >= info.geom.top && y < info.geom.top + info.geom.height) {
        grabOffset = y - info.geom.top
      } else {
        const centered = Math.max(0, Math.min(info.maxScroll,
          Math.round(((y - info.geom.height / 2) / info.travel) * info.maxScroll)))
        onScrollRef.current(centered)
        grabOffset = y - Math.round((info.travel * centered) / info.maxScroll)
      }
      scrollbarSessionRef.current = { grabOffset }
      pointerSessionRef.current = { inMessageArea: false }
      return true
    }
    const onScrollbarDrag = (y: number): void => {
      const session = scrollbarSessionRef.current
      if (session === null) return
      const info = scrollbarInfo()
      if (info === null) {
        scrollbarSessionRef.current = null
        return
      }
      const thumbTop = Math.max(0, Math.min(info.travel, y - session.grabOffset))
      const target = Math.max(0, Math.min(info.maxScroll, Math.round((thumbTop / info.travel) * info.maxScroll)))
      onScrollRef.current(target)
    }
    const inMessageArea = (screenRow: number): boolean => {
      if (screenRow >= messageHeightRef.current) return false
      if (dialogOpenRef.current) return false
      const region = hintRegion(rowsRef.current, hintStateRef.current, dialogOpenRef.current, inputHeightRef.current)
      if (region !== null && screenRow >= region.top) return false
      return true
    }
    const toContentRow = (screenRow: number) =>
      inMessageArea(screenRow) ? screenRow + scrollTopRef.current : screenRow
    const activeHintRegion = () => hintRegion(rowsRef.current, hintStateRef.current, dialogOpenRef.current, inputHeightRef.current)
    const focusRowFor = (current: LineSelection, eventY: number): number => {
      if (!current.inMessage) {
        const region = activeHintRegion()
        if (region !== null && current.anchorRow >= region.top && current.anchorRow <= region.bottom) {
          return Math.max(region.top, Math.min(eventY, region.bottom))
        }
      }
      return clampFocusRow(current.inMessage, eventY, scrollTopRef.current, messageHeightRef.current, rowsRef.current, dialogOpenRef.current)
    }
    interface MouseRegion {
      contains(y: number): boolean
      onClick?(y: number, x: number): void
      onWheel?(dir: -1 | 1, y: number): boolean
    }
    const hintGestureRef = { current: null as { x: number; y: number; dragged: boolean } | null }
    const clickRegions: MouseRegion[] = [
      {
        contains: y => !dialogOpenRef.current && !panelActiveRef.current && inInputContent(y),
        onClick: (y, x) => {
          inputClickCandidateRef.current = { x, y }
        },
      },
      {
        contains: y => panelActiveRef.current && !dialogOpenRef.current
          && y >= messageHeightRef.current && y <= rowsRef.current - 2,
        onClick: (y, x) => {
          panelClickCandidateRef.current = { x, y }
          if (screenRef.current?.rowHasText(y) ?? false) {
            setSelection({ anchorRow: y, anchorCol: x, focusRow: y, focusCol: x, inMessage: false })
          }
        },
      },
      {
        contains: () => dialogOpenRef.current,
        onClick: (y, x) => {
          const anchorable = screenRef.current?.rowHasText(y) ?? false
          dialogClickCandidateRef.current = { x, y }
          if (anchorable) {
            setSelection({ anchorRow: y, anchorCol: x, focusRow: y, focusCol: x, inMessage: false })
          }
        },
      },
      {
        contains: () => true,
        onClick: (y, x) => {
          const contentRow = toContentRow(y)
          const hit = rowInfoAt(messagesRef.current, widthRef.current, contentRow)
          const anchorable = screenRef.current?.rowHasText(y) ?? false
          if (hit?.clickable) {
            clickCandidateRef.current = { messageId: hit.messageId, y, x, moved: false }
            pointerSessionRef.current = { inMessageArea: inMessageArea(y) }
            return
          }
          if (anchorable) {
            const anchorInMessage = inMessageArea(y)
            pointerSessionRef.current = { inMessageArea: anchorInMessage }
            setSelection({ anchorRow: contentRow, anchorCol: x, focusRow: contentRow, focusCol: x, inMessage: anchorInMessage })
          }
        },
      },
    ]
    const wheelRegions: MouseRegion[] = [
      {
        contains: () => dialogOpenRef.current,
        onWheel: (dir, y) => onDialogWheelRef.current?.(y, dir) === true,
      },
      {
        contains: y => panelActiveRef.current && !dialogOpenRef.current
          && y >= messageHeightRef.current && y <= rowsRef.current - 2,
        onWheel: dir => panelHandleRef.current?.current?.wheel(dir) === true,
      },
      {
        contains: y => {
          if (dialogOpenRef.current) return false
          const region = activeHintRegion()
          return region !== null && y >= region.top && y <= region.bottom
        },
        onWheel: dir => {
          inputHandleRef.current?.current?.hintWheel(dir)
          return true
        },
      },
      {
        contains: y => !dialogOpenRef.current && !panelActiveRef.current && inInputContent(y),
        onWheel: dir => {
          inputHandleRef.current?.current?.wheel(dir)
          return true
        },
      },
      {
        contains: () => true,
        onWheel: dir => {
          const delta = dir === -1 ? -WHEEL_SCROLL_LINES : WHEEL_SCROLL_LINES
          const live = getScrollRef.current()
          const next = Math.max(0, Math.min(live.maxScroll, live.top + delta))
          if (next !== live.top) onScrollRef.current(next)
          return true
        },
      },
    ]
    const controller = createMouseController(event => {
      switch (event.type) {
        case 'down': {
          if (event.button !== 0) return
          if (onScrollbarDown(event.x, event.y)) return
          const hintRegionActive = (() => {
            if (dialogOpenRef.current || panelActiveRef.current) return false
            const region = activeHintRegion()
            return region !== null && event.y >= region.top && event.y <= region.bottom
          })()
          if (hintRegionActive) {
            hintGestureRef.current = { x: event.x, y: event.y, dragged: false }
            onHintPressRef.current?.(event.x, event.y)
            clickCandidateRef.current = null
            dialogClickCandidateRef.current = null
            panelClickCandidateRef.current = null
            inputClickCandidateRef.current = null
            stopDragScroll()
            pointerSessionRef.current = { inMessageArea: false }
            setSelection(null)
            return
          }
          clickCandidateRef.current = null
          dialogClickCandidateRef.current = null
          panelClickCandidateRef.current = null
          inputClickCandidateRef.current = null
          stopDragScroll()
          pointerSessionRef.current = { inMessageArea: false }
          setSelection(null)
          for (const region of clickRegions) {
            if (!region.contains(event.y)) continue
            region.onClick?.(event.y, event.x)
            return
          }
          return
        }
        case 'drag': {
          const gesture = hintGestureRef.current
          if (gesture !== null) {
            if (!gesture.dragged) {
              gesture.dragged = true
              onHintDragStartRef.current?.(event.x, event.y)
            } else {
              onHintDragMoveRef.current?.(event.x, event.y)
            }
            return
          }
          if (scrollbarSessionRef.current !== null) {
            onScrollbarDrag(event.y)
            return
          }
          const inputCandidate = inputClickCandidateRef.current
          if (inputCandidate !== null) {
            inputClickCandidateRef.current = null
            setSelection({
              anchorRow: inputCandidate.y,
              anchorCol: inputCandidate.x,
              focusRow: clampFocusRow(false, event.y, scrollTopRef.current, messageHeightRef.current, rowsRef.current, dialogOpenRef.current),
              focusCol: event.x,
              inMessage: false,
            })
            return
          }
          const panelCandidate = panelClickCandidateRef.current
          if (panelCandidate !== null) {
            panelClickCandidateRef.current = null
            setSelection({
              anchorRow: panelCandidate.y,
              anchorCol: panelCandidate.x,
              focusRow: clampFocusRow(false, event.y, scrollTopRef.current, messageHeightRef.current, rowsRef.current, dialogOpenRef.current),
              focusCol: event.x,
              inMessage: false,
            })
            return
          }
          const candidate = clickCandidateRef.current
          if (candidate !== null) {
            candidate.moved = true
            clickCandidateRef.current = null
            const anchorInMessage = inMessageArea(candidate.y)
            pointerSessionRef.current = { inMessageArea: anchorInMessage }
            setSelection({
              anchorRow: toContentRow(candidate.y),
              anchorCol: candidate.x,
              focusRow: clampFocusRow(anchorInMessage, event.y, scrollTopRef.current, messageHeightRef.current, rowsRef.current, dialogOpenRef.current),
              focusCol: event.x,
              inMessage: anchorInMessage,
            })
            return
          }
          const dialogCandidate = dialogClickCandidateRef.current
          if (dialogCandidate !== null) {
            dialogClickCandidateRef.current = null
            setSelection({
              anchorRow: dialogCandidate.y,
              anchorCol: dialogCandidate.x,
              focusRow: clampFocusRow(false, event.y, scrollTopRef.current, messageHeightRef.current, rowsRef.current, dialogOpenRef.current),
              focusCol: event.x,
              inMessage: false,
            })
            return
          }
          setSelection(current => (current === null ? current : {
            ...current,
            focusRow: focusRowFor(current, event.y),
            focusCol: event.x,
          }))
          updateDragScroll(event.y)
          return
        }
        case 'up': {
          const pendingGesture = hintGestureRef.current
          if (pendingGesture !== null) {
            hintGestureRef.current = null
            onHintReleaseRef.current?.(event.x, event.y, pendingGesture.dragged)
            return
          }
          stopDragScroll()
          scrollbarSessionRef.current = null
          pointerSessionRef.current = { inMessageArea: false }
          const inputCandidate = inputClickCandidateRef.current
          if (inputCandidate !== null) {
            inputClickCandidateRef.current = null
            inputHandleRef.current?.current?.clickAt(inputCandidate.y, inputCandidate.x)
            return
          }
          const panelCandidate = panelClickCandidateRef.current
          if (panelCandidate !== null) {
            panelClickCandidateRef.current = null
            panelHandleRef.current?.current?.clickAt(panelCandidate.y, panelCandidate.x)
            setSelection(null)
            return
          }
          const candidate = clickCandidateRef.current
          if (candidate !== null && !candidate.moved) {
            onToggleMessageRef.current(candidate.messageId)
          }
          clickCandidateRef.current = null
          const dialogCandidate = dialogClickCandidateRef.current
          if (dialogCandidate !== null) {
            dialogClickCandidateRef.current = null
            onDialogClickRef.current(dialogCandidate.y, dialogCandidate.x)
            setSelection(null)
          }
          return
        }
        case 'scroll': {
          const dir: -1 | 1 = event.scrollDirection === 'up' ? -1 : 1
          for (const region of wheelRegions) {
            if (!region.contains(event.y)) continue
            if (region.onWheel?.(dir, event.y) === true) return
          }
          return
        }
        default:
          return
      }
    })
    controller.enable()
    return () => {
      controller.disable()
      stopDragScroll()
    }
  }, [])
  const screenSelection = useMemo(
    () => toScreenSelection(selection, scrollTop, messageHeight),
    [selection, scrollTop, messageHeight],
  )
  const messageAreaSelection = useMemo(
    () => (selection !== null && selection.inMessage ? screenSelection : null),
    [selection, screenSelection],
  )
  const chromeSelection = useMemo(
    () => (selection !== null && !selection.inMessage ? screenSelection : null),
    [selection, screenSelection],
  )
  return {
    selection,
    messageAreaSelection,
    chromeSelection,
    setSelection,
    clearSelection() {
      setSelection(null)
    },
  }
}