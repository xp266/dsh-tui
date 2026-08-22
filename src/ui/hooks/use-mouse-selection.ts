import { useEffect, useMemo, useRef, useState } from 'react'
import type { RefObject } from 'react'
import type { ScreenCapture } from '../../terminal/screen.ts'
import { createMouseController } from '../../terminal/mouse.ts'
import { CHROME_FRAME_ROWS, HINT_INPUT_GAP_ROWS, MESSAGE_INPUT_GAP_ROWS } from '../layout-metrics.ts'
import { clampFocusRow, toScreenSelection } from '../../model/selection.ts'
import type { LineSelection } from '../../model/selection.ts'
import { rowInfoAt } from '../message/layout.ts'
import type { InputBarHandle } from '../input/input-bar.tsx'
import type { CommandHintState } from '../input/commands.ts'
import type { Message } from '../../model/message.ts'

const WHEEL_SCROLL_LINES = 3

export interface HintRegion {
  top: number
  bottom: number
}

export function hintRegion(rows: number, hint: CommandHintState | null, dialogOpen: boolean, inputHeight: number): HintRegion | null {
  if (hint === null || dialogOpen) return null
  const bottom = rows - inputHeight - MESSAGE_INPUT_GAP_ROWS - HINT_INPUT_GAP_ROWS
  const top = Math.max(0, bottom - hint.commands.length + 1)
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
  onHintClick?(y: number): void
  onDialogWheel?(y: number, dir: -1 | 1): boolean
  onScroll(next: number): void
  onToggleMessage(id: string): void
  onDialogClick(y: number, x: number): void
}

export interface MouseSelectionState {
  selection: LineSelection | null
  messageAreaSelection: LineSelection | null
  chromeSelection: LineSelection | null
  clearSelection(): void
}

export function useMouseSelection(options: MouseSelectionOptions): MouseSelectionState {
  const { messages, columns, rows, scrollTop, messageHeight, inputHeight, dialogOpen, hint, screen, inputHandle, onHintClick, onDialogWheel, onScroll, onToggleMessage, onDialogClick } = options
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
  const onHintClickRef = useRef(onHintClick)
  const onDialogWheelRef = useRef(onDialogWheel)
  const clickCandidateRef = useRef<{ messageId: string; y: number; x: number; moved: boolean } | null>(null)
  const dialogClickCandidateRef = useRef<{ x: number; y: number } | null>(null)
  const onScrollRef = useRef(onScroll)
  const onToggleMessageRef = useRef(onToggleMessage)
  const onDialogClickRef = useRef(onDialogClick)
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
  onHintClickRef.current = onHintClick
  onDialogWheelRef.current = onDialogWheel
  onScrollRef.current = onScroll
  onToggleMessageRef.current = onToggleMessage
  onDialogClickRef.current = onDialogClick
  useEffect(() => {
    const inInputContent = (y: number): boolean => {
      const top = rowsRef.current - inputHeightRef.current
      return y >= top && y <= top + inputHeightRef.current - CHROME_FRAME_ROWS
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
    const controller = createMouseController(event => {
      switch (event.type) {
        case 'down': {
          if (event.button !== 0) return
          clickCandidateRef.current = null
          dialogClickCandidateRef.current = null
          setSelection(null)
          const region = activeHintRegion()
          if (!dialogOpenRef.current && region !== null && event.y >= region.top && event.y <= region.bottom) {
            onHintClickRef.current?.(event.y)
            return
          }
          if (!dialogOpenRef.current && inInputContent(event.y)) {
            inputHandleRef.current?.current?.clickAt(event.y, event.x)
            return
          }
          const contentRow = toContentRow(event.y)
          const hit = rowInfoAt(messagesRef.current, widthRef.current, contentRow)
          const anchorable = screenRef.current?.rowHasText(event.y) ?? false
          if (dialogOpenRef.current) {
            dialogClickCandidateRef.current = { x: event.x, y: event.y }
            if (anchorable) {
              setSelection({ anchorRow: event.y, anchorCol: event.x, focusRow: event.y, focusCol: event.x, inMessage: false })
            }
            return
          }
          if (hit?.clickable) {
            clickCandidateRef.current = { messageId: hit.messageId, y: event.y, x: event.x, moved: false }
            return
          }
          if (anchorable) {
            const anchorInMessage = inMessageArea(event.y)
            setSelection({ anchorRow: contentRow, anchorCol: event.x, focusRow: contentRow, focusCol: event.x, inMessage: anchorInMessage })
          }
          return
        }
        case 'drag': {
          const candidate = clickCandidateRef.current
          if (candidate !== null) {
            candidate.moved = true
            clickCandidateRef.current = null
            const anchorInMessage = inMessageArea(candidate.y)
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
          return
        }
        case 'up': {
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
          if (dialogOpenRef.current && onDialogWheelRef.current?.(event.y, dir) === true) return
          const region = activeHintRegion()
          if (!dialogOpenRef.current && region !== null && event.y >= region.top && event.y <= region.bottom) {
            inputHandleRef.current?.current?.hintWheel(dir)
            return
          }
          if (!dialogOpenRef.current && inInputContent(event.y)) {
            inputHandleRef.current?.current?.wheel(dir)
            return
          }
          const delta = event.scrollDirection === 'up' ? -WHEEL_SCROLL_LINES : WHEEL_SCROLL_LINES
          onScrollRef.current(scrollTopRef.current + delta)
          return
        }
        default:
          return
      }
    })
    controller.enable()
    return () => controller.disable()
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
    clearSelection() {
      setSelection(null)
    },
  }
}