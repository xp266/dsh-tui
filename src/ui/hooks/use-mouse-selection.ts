import { useEffect, useMemo, useRef, useState } from 'react'
import type { RefObject } from 'react'
import type { ScreenCapture } from '../../terminal/screen.ts'
import { createMouseController } from '../../terminal/mouse.ts'
import { CHROME_FRAME_ROWS, HINT_INPUT_GAP_ROWS, MESSAGE_INPUT_GAP_ROWS } from '../../core/metrics.ts'
import { hintBlockTop } from '../../core/metrics.ts'
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
    interface MouseRegion {
      contains(y: number): boolean
      onClick?(y: number, x: number): void
      onWheel?(dir: -1 | 1, y: number): boolean
    }
    const clickRegions: MouseRegion[] = [
      {
        contains: y => {
          if (dialogOpenRef.current) return false
          const region = activeHintRegion()
          return region !== null && y >= region.top && y <= region.bottom
        },
        onClick: y => onHintClickRef.current?.(y),
      },
      {
        contains: y => !dialogOpenRef.current && inInputContent(y),
        onClick: (y, x) => inputHandleRef.current?.current?.clickAt(y, x),
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
            return
          }
          if (anchorable) {
            const anchorInMessage = inMessageArea(y)
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
        contains: y => !dialogOpenRef.current && inInputContent(y),
        onWheel: dir => {
          inputHandleRef.current?.current?.wheel(dir)
          return true
        },
      },
      {
        contains: () => true,
        onWheel: dir => {
          const delta = dir === -1 ? -WHEEL_SCROLL_LINES : WHEEL_SCROLL_LINES
          onScrollRef.current(scrollTopRef.current + delta)
          return true
        },
      },
    ]
    const controller = createMouseController(event => {
      switch (event.type) {
        case 'down': {
          if (event.button !== 0) return
          clickCandidateRef.current = null
          dialogClickCandidateRef.current = null
          setSelection(null)
          for (const region of clickRegions) {
            if (!region.contains(event.y)) continue
            region.onClick?.(event.y, event.x)
            return
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