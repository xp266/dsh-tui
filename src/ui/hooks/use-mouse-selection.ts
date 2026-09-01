import { useEffect, useMemo, useRef, useState } from 'react'
import { pointerHandlerEntries, type PointerSession } from '../pointer/registry.ts'
import type { PointerHandlerContribution } from '../../contract/index.ts'
import { createBuiltinPointerHandler, type BuiltinPointerHandler } from '../pointer/builtins.ts'
import type { RefObject } from 'react'
import type { ScreenCapture } from '../../terminal/screen.ts'
import { createMouseController } from '../../terminal/mouse.ts'
import { inputContentContains, hintSpan, scrollbarColumn } from '../layout-service.ts'
import { clampFocusRow, toScreenSelection } from '../../model/selection.ts'
import type { LineSelection } from '../../model/selection.ts'
import type { ScrollSnapshot } from './use-scroll.ts'
import { rowInfoAt, rowCount, scrollbarGeometry } from '../message/layout.ts'
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
  return hintSpan(rows, inputHeight, hint?.commands.length ?? 0, dialogOpen)
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
    const inInputContent = (y: number): boolean =>
      inputContentContains(y, rowsRef.current, inputHeightRef.current)
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
      if (x !== scrollbarColumn(widthRef.current) || y >= messageHeightRef.current) return false
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
    const uiContext = () => ({
      dialogOpen: dialogOpenRef.current,
      panelActive: panelActiveRef.current,
      hintRegion: activeHintRegion(),
      rows: rowsRef.current,
      columns: widthRef.current,
      messageHeight: messageHeightRef.current,
      inputHeight: inputHeightRef.current,
      scrollTop: scrollTopRef.current,
      getScroll: getScrollRef.current,
    })
    const session: PointerSession = {
      getSelection: () => selectionRef.current,
      setSelection: next => setSelection(next),
      scroll: next => onScrollRef.current(next),
      autoScroll: direction => {
        if (direction === 0) stopDragScroll()
        else startDragScroll(direction)
      },
    }
    const builtinDeps = {
      inInputContent,
      inMessageArea,
      toContentRow,
      activeHintRegion,
      focusRowFor,
      clampMessageFocus: (anchorInMessage: boolean, eventY: number) =>
        anchorInMessage
          ? eventY + scrollTopRef.current
          : clampFocusRow(false, eventY, scrollTopRef.current, messageHeightRef.current, rowsRef.current, dialogOpenRef.current),
      setPointerArea: (value: boolean) => {
        pointerSessionRef.current = { inMessageArea: value }
      },
      onScrollbarDown,
      onScrollbarDrag,
      stopDragScroll,
      updateDragScroll,
      setSelection,
      getSelection: () => selectionRef.current,
      rowHasText: (y: number) => screenRef.current?.rowHasText(y) ?? false,
      rowInfoAt: (y: number) => {
        const contentRow = toContentRow(y)
        return rowInfoAt(messagesRef.current, widthRef.current, contentRow)
      },
      inputClickAt: (y: number, x: number) => inputHandleRef.current?.current?.clickAt(y, x),
      panelClickAt: (y: number, x: number) => panelHandleRef.current?.current?.clickAt(y, x),
      dialogWheel: (y: number, dir: -1 | 1) => onDialogWheelRef.current?.(y, dir) === true,
      panelWheel: (dir: -1 | 1) => panelHandleRef.current?.current?.wheel(dir) === true,
      hintWheel: (dir: -1 | 1) => inputHandleRef.current?.current?.hintWheel(dir),
      inputWheel: (dir: -1 | 1) => inputHandleRef.current?.current?.wheel(dir),
      hintPress: (x: number, y: number) => onHintPressRef.current?.(x, y),
      hintDragStart: (x: number, y: number) => onHintDragStartRef.current?.(x, y),
      hintDragMove: (x: number, y: number) => onHintDragMoveRef.current?.(x, y),
      hintRelease: (x: number, y: number, dragged: boolean) => onHintReleaseRef.current?.(x, y, dragged),
      onScroll: (next: number) => onScrollRef.current(next),
      toggleMessage: (id: string) => onToggleMessageRef.current(id),
      dialogClick: (y: number, x: number) => onDialogClickRef.current(y, x),
    }
    const builtinHandler: BuiltinPointerHandler = createBuiltinPointerHandler(builtinDeps)
    let ownerId: string | null = null
    const controller = createMouseController(rawEvent => {
      const frame = { event: rawEvent, session, ui: uiContext() }
      // The builtin composite participates in the same dispatch chain as
      // plugin handlers, sorted by order (builtin at 100, plugin default 300).
      const entries = [
        { key: builtinHandler.id, order: 100, value: builtinHandler as PointerHandlerContribution },
        ...pointerHandlerEntries(),
      ].sort((a, b) => a.order - b.order)
      const entryFor = (id: string | null) => entries.find(entry => entry.key === id)
      switch (rawEvent.type) {
        case 'down': {
          if (rawEvent.button !== 0) return
          builtinHandler.beginDown()
          ownerId = null
          for (const entry of entries) {
            if (entry.value.onDown(frame) === true) {
              ownerId = entry.key
              return
            }
          }
          // Dead click on unclaimed space (blank rows, padding): drop any
          // lingering selection, matching native text-editor behavior.
          setSelection(null)
          return
        }
        case 'drag': {
          console.error('EVDRAG owner=%s y=%d x=%d', ownerId, rawEvent.y, rawEvent.x)
          entryFor(ownerId)?.value.onDrag?.(frame)
          return
        }
        case 'up': {
          stopDragScroll()
          pointerSessionRef.current = { inMessageArea: false }
          entryFor(ownerId)?.value.onUp?.(frame)
          ownerId = null
          return
        }
        case 'scroll': {
          for (const entry of entries) {
            if (entry.value.onWheel?.(frame) === true) return
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