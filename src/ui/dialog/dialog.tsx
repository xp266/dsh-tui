import { Box, Text, useStdout } from 'ink'
import { createContext, useContext } from 'react'
import { useCaret } from '../hooks/use-caret.ts'
import type { ReactNode, Ref } from 'react'
import { useEffect, useImperativeHandle, useRef, useState } from 'react'
import { colors } from '../../theme.ts'
import { writeCursorShape } from '../../terminal/cursor-shape.ts'
import { textWidth, colToCharIndex } from '../../core/text.ts'
import { SelectableText } from '../selection.tsx'
import { Region } from '../region.tsx'
import { renderRow } from './dialog-item.tsx'
import { adjustScroll, hitRowIndex, rowHeight, rowTopOffset, wrapFooter } from './geometry.ts'
import type { DialogFooterLine } from './geometry.ts'
import { asTextItem, clampFocus, filterRowsWithHeaders, focusedItem, isSelectableRow, selectableSpan, snapRow } from './items.ts'
import type { DialogFocus, DialogItem, DialogRow } from './items.ts'
import { applyNavigation, useDialogInput } from './use-dialog-input.ts'
import type { DialogLiveState } from './use-dialog-input.ts'
import { widgetOf } from '../widgets/registry.ts'
import type { ClickActions, ClickHit } from '../widgets/types.ts'

export * from './items.ts'
export * from './geometry.ts'

export interface DialogProps {
  width: number
  maxHeight: number
  title?: string
  rows: DialogRow[]
  footer?: DialogFooterLine[]
  onClose: () => void
  search?: boolean
  searchRight?: boolean
  onCtrlA?(focused: DialogItem | undefined): boolean
  onCtrlD?(focused: DialogItem | undefined): boolean
  onCtrlE?(focused: DialogItem | undefined): boolean
  onActivity?(): void
  ref?: Ref<DialogHandle>
}

export interface DialogHandle {
  clickAt(y: number, x: number): void
  wheelAt(y: number, dir: -1 | 1): boolean
}

export const CloseGuardContext = createContext(false)

export function Dialog({
  width,
  maxHeight,
  title,
  rows,
  footer,
  onClose,
  search = false,
  searchRight = false,
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
  const [searchValue, setSearchValue] = useState('')
  const [carouselPress, setCarouselPress] = useState<'left' | 'right' | null>(null)
  const carouselPressTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const handleSearch = (value: string) => {
    setSearchValue(value)
    setScrollTop(0)
  }
  const searchRow: DialogRow = { items: [{ type: 'search', value: searchValue, onChange: handleSearch }] }
  const filteredRows = search ? filterRowsWithHeaders(rows, searchValue, searchRight) : rows
  const displayRows = search ? [searchRow, ...filteredRows] : rows
  const contentRows = search ? filteredRows : rows
  const [focus, setFocus] = useState<DialogFocus>(() => ({ row: snapRow(search ? [searchRow, ...rows] : rows, search ? 1 : 0), col: 0 }))
  const windowWidth = Math.min(width + 2, columns)
  const contentWidth = Math.max(1, windowWidth - 2)
  const fixedHeight = search ? rowHeight(searchRow, contentWidth) : 0
  const focusMinRow = search ? 1 : 0
  const focusMaxRow = Math.max(focusMinRow, displayRows.length - 1)
  useEffect(() => {
    setFocus(current => {
      const next = clampFocus(displayRows, current, focusMinRow, focusMaxRow)
      return next.row === current.row && next.col === current.col ? current : next
    })
  }, [displayRows, focusMinRow, focusMaxRow])
  const titleLines = title === undefined ? 0 : 2
  const footerRows = wrapFooter(footer, contentWidth)
  const extraHeight = footerRows.length > 0 ? 1 + footerRows.length : 0
  const desired = displayRows.reduce((sum, row) => sum + rowHeight(row, contentWidth), 0) + titleLines + extraHeight + 2
  const windowHeight = Math.min(desired, maxHeight, totalRows)
  const contentHeight = Math.max(1, windowHeight - 2 - titleLines - extraHeight)
  const viewportHeight = Math.max(1, contentHeight - fixedHeight)
  const top = Math.max(0, Math.floor((totalRows - windowHeight) / 2))
  const left = Math.max(0, Math.floor((columns - windowWidth) / 2))
  const frameLeft = 1
  const headerBottom = 1 + titleLines
  const contentTop = headerBottom + fixedHeight
  const live = useRef<DialogLiveState>({
    rows: displayRows,
    contentRows,
    focus,
    scrollTop,
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
  live.current.scrollTop = scrollTop
  live.current.cursor = cursor
  live.current.searchValue = searchValue
  live.current.viewportHeight = viewportHeight
  live.current.focusMinRow = focusMinRow
  live.current.focusMaxRow = focusMaxRow
  live.current.contentWidth = contentWidth
  live.current.top = top
  live.current.windowHeight = windowHeight
  const safeFocus: DialogFocus = {
    row: Math.min(Math.max(focus.row, focusMinRow), focusMaxRow),
    col: Math.min(Math.max(focus.col, 0), selectableSpan(displayRows[focus.row])),
  }
  const current = focusedItem(displayRows[safeFocus.row], safeFocus.col)
  const currentText = current === undefined ? null : asTextItem(current)
  live.current.value = currentText?.value ?? ''
  useEffect(() => {
    if (currentText !== null && currentText.type !== 'search') {
      setCursor(currentText.value.length)
    }
  }, [current?.type, safeFocus.row, safeFocus.col, displayRows.length])
  const editingFormInput = current !== undefined && current.type !== 'search' && asTextItem(current) !== null
  if (search && !editingFormInput) {
    const onSearchRow = safeFocus.row === 0
    const caret = onSearchRow ? Math.min(cursor, searchValue.length) : searchValue.length
    setCursorPosition({
      x: left + frameLeft + textWidth(searchValue.slice(0, Math.max(0, caret))),
      y: top + headerBottom,
    })
  } else {
    const caretOffset = current === undefined ? undefined : widgetOf(current.type).caret?.(current, cursor, contentWidth)
    if (caretOffset === undefined) {
      setCursorPosition(undefined)
    } else {
      const contentIndex = Math.max(0, safeFocus.row - (search ? 1 : 0))
      const rowOffset = rowTopOffset(contentRows, contentIndex, contentWidth)
      setCursorPosition({
        x: left + frameLeft + caretOffset.dx,
        y: top + contentTop + rowOffset + caretOffset.dy - scrollTop,
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
  const flashCarousel = (side: 'left' | 'right') => {
    setCarouselPress(side)
    clearTimeout(carouselPressTimer.current)
    carouselPressTimer.current = setTimeout(() => setCarouselPress(null), 120)
  }
  useImperativeHandle(ref, () => ({
    wheelAt(y, dir) {
      onActivity?.()
      if (y < live.current.top || y >= live.current.top + live.current.windowHeight) return false
      applyNavigation(live.current, dir === -1 ? 'up' : 'down', search, { setFocus, setScrollTop })
      return true
    },
    clickAt(y, x) {
      onActivity?.()
      if (y < top || y >= top + windowHeight || x < left || x >= left + windowWidth) return
      if (search) {
        const searchTop = top + headerBottom
        if (y >= searchTop && y < searchTop + fixedHeight) {
          const col = Math.max(0, Math.min(x - (left + frameLeft), textWidth(searchValue)))
          setFocus({ row: 0, col: 0 })
          setCursor(colToCharIndex(searchValue, col))
          return
        }
      }
      const rowIndex = hitRowIndex(y, top + fixedHeight, titleLines, contentRows, scrollTop, contentWidth)
      if (rowIndex === null) return
      const rowSpec = contentRows[rowIndex]
      if (!isSelectableRow(rowSpec)) return
      const displayRow = Math.min(Math.max(rowIndex + (search ? 1 : 0), focusMinRow), focusMaxRow)
      const rowOffset = rowTopOffset(contentRows, rowIndex, contentWidth)
      const hit: ClickHit = {
        localX: x - (left + frameLeft),
        localY: y - (top + contentTop + rowOffset - scrollTop),
        width: contentWidth,
      }
      const clickActions: ClickActions = {
        focus: col => setFocus({ row: displayRow, col }),
        flash: flashCarousel,
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
      setScrollTop(adjustScroll(contentRows, { row: contentRow, col: 0 }, scrollTop, viewportHeight, contentWidth))
    },
  }))
  const visibleRows: ReactNode[] = []
  let offset = 0
  for (let i = 0; i < contentRows.length; i++) {
    const height = rowHeight(contentRows[i]!, contentWidth)
    if (offset + height <= scrollTop) {
      offset += height
      continue
    }
    if (offset >= scrollTop + viewportHeight) break
    const clip = Math.max(0, scrollTop - offset)
    const rel = Math.max(0, offset - scrollTop)
    const baseY = contentTop + rel
    const focused = safeFocus.row === i + (search ? 1 : 0)
    visibleRows.push(
      <Box key={`row-${i}`} position="absolute" top={rel} left={0} width={contentWidth}>
        {renderRow(contentRows[i], focused, contentWidth, baseY, 0, carouselPress, focused ? safeFocus.col : 0, clip, focused ? cursor : undefined)}
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
        backgroundColor={colors.dialogBackground}
        padding={1}
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
              {renderRow(searchRow, safeFocus.row === 0, contentWidth, headerBottom, 0, carouselPress, 0, 0, safeFocus.row === 0 ? cursor : undefined)}
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
    </Region>
  )
}
