import { useEffect, useMemo, useRef, useState } from 'react'
import type { ScreenCapture } from '../../terminal/screen.ts'
import { createMouseController } from '../../terminal/mouse.ts'
import { clampFocusRow, toScreenSelection } from '../../model/selection.ts'
import type { LineSelection } from '../../model/selection.ts'
import { rowInfoAt } from '../message/layout.ts'
import { INPUT_BAR_HEIGHT } from '../input/input-bar.tsx'
import type { CommandHintState } from '../input/commands.ts'
import type { Message } from '../../model/message.ts'

const WHEEL_SCROLL_LINES = 3

export interface HintRegion {
  top: number
  bottom: number
}

export function hintRegion(rows: number, hint: CommandHintState | null, dialogOpen: boolean): HintRegion | null {
  if (hint === null || dialogOpen) return null
  const bottom = rows - INPUT_BAR_HEIGHT - 2
  const top = Math.max(0, bottom - hint.commands.length + 1)
  return { top, bottom }
}

export interface MouseSelectionOptions {
  messages: Message[]
  columns: number
  rows: number
  scrollTop: number
  messageHeight: number
  dialogOpen: boolean
  hint: CommandHintState | null
  screen?: ScreenCapture
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
  const { messages, columns, rows, scrollTop, messageHeight, dialogOpen, hint, screen, onScroll, onToggleMessage, onDialogClick } = options
  const [selection, setSelection] = useState<LineSelection | null>(null)
  const messagesRef = useRef(messages)
  const widthRef = useRef(columns)
  const rowsRef = useRef(rows)
  const scrollTopRef = useRef(scrollTop)
  const messageHeightRef = useRef(messageHeight)
  const dialogOpenRef = useRef(dialogOpen)
  const hintStateRef = useRef<CommandHintState | null>(null)
  const screenRef = useRef<ScreenCapture | undefined>(screen)
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
  dialogOpenRef.current = dialogOpen
  hintStateRef.current = hint
  screenRef.current = screen
  onScrollRef.current = onScroll
  onToggleMessageRef.current = onToggleMessage
  onDialogClickRef.current = onDialogClick
  useEffect(() => {
    const inMessageArea = (screenRow: number): boolean => {
      if (screenRow >= messageHeightRef.current) return false
      if (dialogOpenRef.current) return false
      const hint = hintStateRef.current
      if (hint !== null) {
        const hintTop = rowsRef.current - INPUT_BAR_HEIGHT - 1 - hint.commands.length
        if (screenRow >= hintTop) return false
      }
      return true
    }
    const toContentRow = (screenRow: number) =>
      inMessageArea(screenRow) ? screenRow + scrollTopRef.current : screenRow
    const activeHintRegion = () => hintRegion(rowsRef.current, hintStateRef.current, dialogOpenRef.current)
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
          const contentRow = toContentRow(event.y)
          const hit = rowInfoAt(messagesRef.current, widthRef.current, contentRow)
          const anchorable = screenRef.current?.rowHasText(event.y) ?? false
          const region = activeHintRegion()
          if (region !== null && event.y >= region.top && event.y <= region.bottom) {
            if (anchorable) {
              setSelection({ anchorRow: event.y, anchorCol: event.x, focusRow: event.y, focusCol: event.x, inMessage: false })
            }
            return
          }
          const anchorInMessage = inMessageArea(event.y)
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