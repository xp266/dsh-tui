import { Box, Text, useStdout } from 'ink'
import { createContext, useContext } from 'react'
import { useCaret } from '../hooks/use-caret.ts'
import type { ReactNode, Ref } from 'react'
import { useEffect, useImperativeHandle, useRef, useState } from 'react'
import { COLORS } from '../../theme.ts'
import { writeCursorShape } from '../../terminal/cursor-shape.ts'
import { textWidth, colToCharIndex, caretScrollStart, truncate } from '../../core/text.ts'
import { SelectableText } from '../selection.tsx'
import { Region } from '../region.tsx'
import { STRIP_ROW_BASE } from '../../model/selection.ts'
import { sliceByColumns } from '../selection-registry.ts'
import { renderRow } from './dialog-item.tsx'
import { adjustScroll, hitRowIndex, rowHeight, rowTopOffset, wrapFooter, wrapStatusLines } from './geometry.ts'
import type { DialogFooterLine } from './geometry.ts'
import { ERROR_MAX_ROWS } from './sizes.ts'
import { asTextItem, clampFocus, filterRowsWithHeaders, focusedItem, isSelectableRow, selectableSpan, snapRow } from './items.ts'
import type { DialogFocus, DialogItem, DialogRow } from './items.ts'
import { applyNavigation, useDialogInput } from './use-dialog-input.ts'
import type { DialogLiveState } from './use-dialog-input.ts'
import { widgetOf } from '../widgets/registry.ts'
import type { ClickActions, ClickHit } from '../widgets/types.ts'
import type { WindowHandle } from '../../contract/index.ts'

export * from './items.ts'
export * from './geometry.ts'

export interface DialogProps {
  width: number
  maxHeight: number
  title?: string
  rows: DialogRow[]
  footer?: DialogFooterLine[]
  errors?: DialogFooterLine[]
  onClose: () => void
  search?: boolean
  searchRight?: boolean
  centerScroll?: boolean
  onCtrlA?(focused: DialogItem | undefined): boolean
  onCtrlD?(focused: DialogItem | undefined): boolean
  onCtrlE?(focused: DialogItem | undefined): boolean
  onActivity?(): void
  ref?: Ref<DialogHandle>
}

export type DialogHandle = WindowHandle

export const CloseGuardContext = createContext(false)

export function Dialog({
  width,
  maxHeight,
  title,
  rows,
  footer,
  errors,
  onClose,
  search = false,
  searchRight = false,
  centerScroll = false,
  onCtrlA,
  onCtrlD,
  onCtrlE,
  onActivity,
  ref,
}: DialogProps) {
  const { stdout } = useStdout()
  const { setCursorPosition } = useCaret()
  const closeGuarded = useContext(CloseGuardContext)
  const columns = stdout?.columns ?? 80
  const totalRows = stdout?.rows ?? 24
  const [scrollTop, setScrollTop] = useState(0)
  const [cursor, setCursor] = useState(0)
  const cursorSyncRef = useRef<{ row: number; col: number; type: string | undefined }>({ row: -1, col: -1, type: undefined })
  const [searchValue, setSearchValue] = useState('')
  const [carouselPress, setCarouselPress] = useState<{ row: number; side: 'left' | 'right' } | null>(null)
  const carouselPressTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const [errorScrollTop, setErrorScrollTop] = useState(0)
  const handleSearch = (value: string) => {
    setSearchValue(value)
    setScrollTop(0)
  }
  const searchRow: DialogRow = { items: [{ type: 'search', value: searchValue, onChange: handleSearch }] }
  const filteredRows = search ? filterRowsWithHeaders(rows, searchValue, searchRight) : rows
  const displayRows = search ? [searchRow, ...filteredRows] : rows
  const contentRows = search ? filteredRows : rows
  const [focus, setFocus] = useState<DialogFocus>(() => ({ row: snapRow(search ? [searchRow, ...rows] : rows, search ? 1 : 0), col: 0 }))
  const widthCells = width <= 1 ? Math.floor(columns * width) : width
  const windowWidth = Math.min(Math.max(1, widthCells), columns)
  const contentWidth = Math.max(1, windowWidth - 4)
  const fixedHeight = search ? rowHeight(searchRow, contentWidth) : 0
  const focusMinRow = search ? 1 : 0
  const focusMaxRow = Math.max(0, displayRows.length - 1)
  useEffect(() => {
    setFocus(current => {
      const next = clampFocus(displayRows, current, focusMinRow, focusMaxRow)
      return next.row === current.row && next.col === current.col ? current : next
    })
  }, [displayRows, focusMinRow, focusMaxRow])
  const errorKey = (errors ?? []).map(line => line.text).join('\n')
  useEffect(() => {
    setErrorScrollTop(0)
  }, [errorKey])
  const titleLines = title === undefined ? 0 : 2
  const footerRows = wrapFooter(footer, contentWidth)
  const extraHeight = footerRows.length > 0 ? 1 + footerRows.length : 0
  const desired = displayRows.reduce((sum, row) => sum + rowHeight(row, contentWidth), 0) + titleLines + extraHeight + 2
  const maxRows = Math.max(1, maxHeight <= 1 ? Math.floor(totalRows * maxHeight) : maxHeight)
  const windowHeight = Math.min(desired, maxRows, totalRows)
  const contentHeight = Math.max(1, windowHeight - 2 - titleLines - extraHeight)
  const viewportHeight = Math.max(1, contentHeight - fixedHeight)
  const top = Math.max(0, Math.floor((totalRows - windowHeight) / 2))
  const left = Math.max(0, Math.floor((columns - windowWidth) / 2))
  const frameLeft = 2
  const errorRows = wrapStatusLines(errors, contentWidth)
  const availableBelow = Math.max(0, totalRows - (top + windowHeight))
  const errorVisible = Math.max(0, Math.min(ERROR_MAX_ROWS, errorRows.length, availableBelow - 1))
  const maxErrorScroll = Math.max(0, errorRows.length - errorVisible)
  const errorScroll = Math.min(errorScrollTop, maxErrorScroll)
  const headerBottom = 1 + titleLines
  const contentTop = headerBottom + fixedHeight
  const safeFocus: DialogFocus = {
    row: Math.min(Math.max(focus.row, 0), focusMaxRow),
    col: Math.min(Math.max(focus.col, 0), selectableSpan(displayRows[focus.row])),
  }
  const contentRowsHeight = contentRows.reduce((sum, row) => sum + rowHeight(row, contentWidth), 0)
  const maxScroll = Math.max(0, contentRowsHeight - viewportHeight)
  const scroll = adjustScroll(contentRows, { row: Math.max(0, safeFocus.row - (search ? 1 : 0)), col: 0 }, Math.min(scrollTop, maxScroll), viewportHeight, contentWidth)
  const live = useRef<DialogLiveState>({
    rows: displayRows,
    contentRows,
    focus,
    scrollTop: scroll,
    cursor,
    value: '',
    searchValue,
    viewportHeight,
    focusMinRow,
    focusMaxRow,
    contentWidth,
    top,
    windowHeight,
  })
  live.current.rows = displayRows
  live.current.contentRows = contentRows
  live.current.focus = focus
  live.current.scrollTop = scroll
  live.current.searchValue = searchValue
  live.current.viewportHeight = viewportHeight
  live.current.focusMinRow = focusMinRow
  live.current.focusMaxRow = focusMaxRow
  live.current.contentWidth = contentWidth
  live.current.top = top
  live.current.windowHeight = windowHeight
  const errorLive = useRef({ top: 0, height: 0, maxScroll: 0 })
  errorLive.current = { top: top + windowHeight, height: errorVisible + 1, maxScroll: maxErrorScroll }
  const current = focusedItem(displayRows[safeFocus.row], safeFocus.col)
  const currentText = current === undefined ? null : asTextItem(current)
  live.current.value = currentText?.value ?? ''
  const cursorSynced = cursorSyncRef.current.row === safeFocus.row
    && cursorSyncRef.current.col === safeFocus.col
    && cursorSyncRef.current.type === current?.type
  const effectiveCursor = cursorSynced || currentText === null || currentText.type === 'search'
    ? cursor
    : currentText.value.length
  live.current.cursor = effectiveCursor
  useEffect(() => {
    cursorSyncRef.current = { row: safeFocus.row, col: safeFocus.col, type: current?.type }
    if (currentText !== null && currentText.type !== 'search') {
      setCursor(currentText.value.length)
    }
  }, [current?.type, safeFocus.row, safeFocus.col, displayRows.length])
  const editingFormInput = current !== undefined && current.type !== 'search' && asTextItem(current) !== null
  if (search && !editingFormInput) {
    const caret = Math.min(Math.max(0, cursor), searchValue.length)
    const start = caretScrollStart(searchValue, caret, contentWidth)
    setCursorPosition({
      x: left + frameLeft + textWidth(searchValue.slice(start, caret)),
      y: top + headerBottom,
    })
  } else {
    const caretOffset = current === undefined ? undefined : widgetOf(current.type).caret?.(current, effectiveCursor, contentWidth)
    if (caretOffset === undefined) {
      setCursorPosition(undefined)
    } else {
      const contentIndex = Math.max(0, safeFocus.row - (search ? 1 : 0))
      const rowOffset = rowTopOffset(contentRows, contentIndex, contentWidth)
      setCursorPosition({
        x: left + frameLeft + caretOffset.dx,
        y: top + contentTop + rowOffset + caretOffset.dy - scroll,
      })
    }
  }
  useEffect(() => {
    if (search && !editingFormInput) {
      writeCursorShape('beam')
      return
    }
    const beam = current !== undefined && widgetOf(current.type).caret !== undefined
    writeCursorShape(beam ? 'beam' : 'block')
  }, [current?.type, safeFocus.row, safeFocus.col])
  useEffect(() => {
    return () => {
      writeCursorShape('reset')
      clearTimeout(carouselPressTimer.current)
    }
  }, [])
  useDialogInput({
    live,
    search,
    closeGuarded,
    centerScroll,
    onClose,
    onCtrlA,
    onCtrlD,
    onCtrlE,
    onActivity,
    requestSearch: handleSearch,
    setFocus,
    setScrollTop,
    setCursor,
  })
  const flashCarousel = (row: number, side: 'left' | 'right') => {
    setCarouselPress({ row, side })
    clearTimeout(carouselPressTimer.current)
    carouselPressTimer.current = setTimeout(() => setCarouselPress(null), 120)
  }
  useImperativeHandle(ref, () => ({
    wheelAt(y, dir) {
      onActivity?.()
      if (y < live.current.top || y >= live.current.top + live.current.windowHeight) {
        const error = errorLive.current
        if (error.height > 1 && y >= error.top && y < error.top + error.height) {
          setErrorScrollTop(current => Math.max(0, Math.min(current + dir, error.maxScroll)))
          return true
        }
        return false
      }
      applyNavigation(live.current, dir === -1 ? 'up' : 'down', search, { setFocus, setScrollTop }, centerScroll)
      return true
    },
    stripRow(y) {
      if (errorRows.length === 0 || errorVisible === 0) return null
      const bandTop = top + windowHeight
      if (y < bandTop || y >= bandTop + errorVisible) return null
      return Math.min(errorScroll + (y - bandTop), errorRows.length - 1)
    },
    stripScroll(dir) {
      const next = Math.max(0, Math.min(errorScroll + dir, maxErrorScroll))
      if (next === errorScroll) return null
      setErrorScrollTop(next)
      const edge = dir === -1 ? next : Math.min(next + errorVisible - 1, errorRows.length - 1)
      return STRIP_ROW_BASE + edge
    },
    copySelection(sel) {
      if (sel.anchorRow < STRIP_ROW_BASE && sel.focusRow < STRIP_ROW_BASE) return null
      const first = Math.min(sel.anchorRow, sel.focusRow) - STRIP_ROW_BASE
      const last = Math.max(sel.anchorRow, sel.focusRow) - STRIP_ROW_BASE
      const env = {
        start: Math.min(sel.anchorCol, sel.focusCol),
        end: Math.max(sel.anchorCol, sel.focusCol),
      }
      const lines: string[] = []
      for (let row = first; row <= last; row++) {
        const text = errorRows[row]
        if (text === undefined) continue
        const width = textWidth(text.text)
        const start = Math.max(env.start, 0)
        const end = Math.min(env.end, width)
        lines.push(start < end ? sliceByColumns(text.text, start, end) : '')
      }
      return lines.join('\n').replace(/[ \t]+$/gm, '').replace(/\n+$/, '')
    },
    clickAt(y, x) {
      onActivity?.()
      if (y < top || y >= top + windowHeight || x < left || x >= left + windowWidth) return
      if (search) {
        const searchTop = top + headerBottom
        if (y >= searchTop && y < searchTop + fixedHeight) {
          const clickCaret = safeFocus.row === 0 ? Math.min(cursor, searchValue.length) : searchValue.length
          const start = caretScrollStart(searchValue, clickCaret, contentWidth)
          const visible = truncate(searchValue.slice(start), contentWidth)
          const col = Math.max(0, Math.min(x - (left + frameLeft), textWidth(visible)))
          setFocus({ row: 0, col: 0 })
          setCursor(Math.min(searchValue.length, start + colToCharIndex(visible, col)))
          return
        }
      }
      const rowIndex = hitRowIndex(y, top + fixedHeight, titleLines, contentRows, scroll, contentWidth)
      if (rowIndex === null) return
      const rowSpec = contentRows[rowIndex]
      if (!isSelectableRow(rowSpec)) return
      const displayRow = Math.min(Math.max(rowIndex + (search ? 1 : 0), focusMinRow), focusMaxRow)
      const rowOffset = rowTopOffset(contentRows, rowIndex, contentWidth)
      const hit: ClickHit = {
        localX: x - (left + frameLeft),
        localY: y - (top + contentTop + rowOffset - scroll),
        width: contentWidth,
      }
      const clickActions: ClickActions = {
        focus: col => setFocus({ row: displayRow, col }),
        flash: side => flashCarousel(rowIndex, side),
      }
      for (const item of rowSpec?.items ?? []) {
        if (widgetOf(item.type).onClick?.(item, hit, clickActions) === true) return
      }
      if (safeFocus.row === displayRow && rowSpec !== undefined) {
        const first = rowSpec.items[0]
        if (first !== undefined) {
          const activate = widgetOf(first.type).activate
          if (activate !== undefined) {
            activate(first)
            return
          }
        }
      }
      setFocus({ row: displayRow, col: 0 })
      const contentRow = Math.max(0, Math.min(rowIndex, contentRows.length - 1))
      setScrollTop(adjustScroll(contentRows, { row: contentRow, col: 0 }, scroll, viewportHeight, contentWidth))
    },
  }))
  const visibleRows: ReactNode[] = []
  let offset = 0
  for (let i = 0; i < contentRows.length; i++) {
    const height = rowHeight(contentRows[i]!, contentWidth)
    if (offset + height <= scroll) {
      offset += height
      continue
    }
    if (offset >= scroll + viewportHeight) break
    const clip = Math.max(0, scroll - offset)
    const rel = Math.max(0, offset - scroll)
    const baseY = contentTop + rel
    const focused = safeFocus.row === i + (search ? 1 : 0)
    visibleRows.push(
      <Box key={`row-${i}`} position="absolute" top={rel} left={0} width={contentWidth}>
        {renderRow(contentRows[i], focused, contentWidth, baseY, frameLeft, carouselPress?.row === i ? carouselPress.side : null, focused ? safeFocus.col : 0, clip, focused ? effectiveCursor : undefined)}
      </Box>,
    )
    offset += height
  }
  return (
    <Region x={left} y={top}>
      <Box
        position="absolute"
        top={top}
        left={left}
        width={windowWidth}
        height={windowHeight}
        flexDirection="column"
        backgroundColor={COLORS.dialogBackground}
        paddingLeft={2}
        paddingRight={2}
        paddingTop={1}
        paddingBottom={1}
      >
        {title !== undefined && (
          <>
            <Box justifyContent="center">
              <SelectableText y={1} col={frameLeft + Math.max(0, Math.floor((contentWidth - textWidth(title)) / 2))} text={title} />
            </Box>
            <Box height={1}>
              <Text> </Text>
            </Box>
          </>
        )}
        <Box flexDirection="column">
          {search && (
            <Box flexDirection="column">
              {renderRow(searchRow, safeFocus.row === 0, contentWidth, headerBottom, frameLeft, null, 0, 0, cursor)}
            </Box>
          )}
          <Box flexDirection="column" height={viewportHeight} overflow="hidden">
            {visibleRows}
          </Box>
        </Box>
        {footerRows.length > 0 && (
          <>
            <Box height={1}>
              <Text> </Text>
            </Box>
            {footerRows.map((line, index) => (
              <SelectableText
                key={index}
                y={windowHeight - footerRows.length + index - 1}
                col={frameLeft}
                text={line.text}
                color={line.color}
              />
            ))}
          </>
        )}
      </Box>
      {errorVisible > 0 && (
        <Box
          position="absolute"
          top={top + windowHeight}
          left={left}
          width={windowWidth}
          height={errorVisible + 1}
          flexDirection="column"
          backgroundColor={COLORS.dialogBackground}
          paddingLeft={2}
          paddingRight={2}
          paddingBottom={1}
        >
          {errorRows.slice(errorScroll, errorScroll + errorVisible).map((line, index) => (
            <SelectableText
              key={errorScroll + index}
              y={windowHeight + index}
              col={frameLeft}
              text={line.text}
              color={line.color}
              stripRow={STRIP_ROW_BASE + errorScroll + index}
            />
          ))}
        </Box>
      )}
    </Region>
  )
}
