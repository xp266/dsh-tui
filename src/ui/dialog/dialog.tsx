import { Box, Text, useCursor, useStdout } from 'ink'
import { createContext, useContext } from 'react'
import type { ReactNode, Ref } from 'react'
import { useEffect, useImperativeHandle, useRef, useState } from 'react'
import { colors } from '../../theme.ts'
import { writeCursorShape } from '../../terminal/cursor-shape.ts'
import { locToPoint, textWidth } from '../../utils/text.ts'
import { SelectableText } from '../selection.tsx'
import { renderRow } from './dialog-item.tsx'
import { actionPositions, adjustScroll, CAROUSEL_BUTTON_WIDTH, hitRowIndex, rowHeight, rowTopOffset, selectBlock, wrapFooter } from './geometry.ts'
import type { DialogFooterLine } from './geometry.ts'
import { clampFocus, filterRowsWithHeaders, focusedItem, isSelectableRow, selectableSpan, snapRow } from './items.ts'
import type { DialogFocus, DialogItem, DialogRow } from './items.ts'
import { applyNavigation, useDialogInput } from './use-dialog-input.ts'
import type { DialogLiveState } from './use-dialog-input.ts'

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
  onCtrlD?(focused: DialogItem | undefined): boolean
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
  onCtrlD,
  onActivity,
  ref,
}: DialogProps) {
  const { stdout } = useStdout()
  const { setCursorPosition } = useCursor()
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
  live.current.value = current?.type === 'input' || current?.type === 'search' ? current.value : ''
  useEffect(() => {
    const item = displayRows[safeFocus.row]?.items[safeFocus.col]
    setCursor(item?.type === 'input' || item?.type === 'search' ? item.value.length : 0)
  }, [current?.type, safeFocus.row, safeFocus.col, displayRows.length])
  if (search) {
    const x = left + 1 + textWidth(searchValue)
    const y = top + 1 + titleLines
    setCursorPosition({ x, y })
  } else if (current?.type === 'input' || current?.type === 'select' || current?.type === 'search') {
    const contentIndex = Math.max(0, safeFocus.row - (search ? 1 : 0))
    const rowOffset = rowTopOffset(contentRows, contentIndex, contentWidth)
    const point = current.type === 'input' ? locToPoint(current.value, contentWidth, cursor) : undefined
    const valueLine = current.type === 'select' || current.type === 'search'
      ? rowOffset
      : rowOffset + 1 + (point?.row ?? 0)
    const y = top + 1 + titleLines + fixedHeight + valueLine - scrollTop
    const block = current.type === 'select' ? selectBlock(contentWidth, current.value) : undefined
    const x = block !== undefined
      ? left + 1 + block.blockStart + block.cursorX
      : point !== undefined
        ? left + 1 + point.col
        : left + 1 + textWidth(current.value.slice(0, cursor))
    setCursorPosition({ x, y })
  } else {
    setCursorPosition(undefined)
  }
  useEffect(() => {
    const isInput = current?.type === 'input' || current?.type === 'select' || current?.type === 'search'
    writeCursorShape(isInput ? 'beam' : 'block')
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
    onCtrlD,
    onActivity,
    requestSearch: handleSearch,
    setFocus,
    setScrollTop,
    setCursor,
  })
  const cycleSelect = (item: Extract<DialogItem, { type: 'select' }>, dir: 1 | -1) => {
    const index = Math.max(0, item.options.indexOf(item.value))
    const length = item.options.length
    const next = item.options[(index + dir + length) % length]
    if (next !== undefined) item.onChange(next)
  }
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
      const rowIndex = hitRowIndex(y, top + fixedHeight, titleLines, contentRows, scrollTop, contentWidth)
      if (rowIndex === null) return
      const rowSpec = contentRows[rowIndex]
      if (!isSelectableRow(rowSpec)) return
      const selectItem = rowSpec?.items.find(item => item.type === 'select')
      if (selectItem?.type === 'select' && selectItem.options.length > 1) {
        const block = selectBlock(contentWidth, selectItem.value)
        const blockStartX = left + 1 + block.blockStart
        const rowOffset = rowTopOffset(contentRows, rowIndex, contentWidth)
        const rowY = top + 1 + titleLines + fixedHeight + rowOffset - scrollTop
        if (y === rowY) {
          if (x >= blockStartX && x < blockStartX + CAROUSEL_BUTTON_WIDTH) {
            cycleSelect(selectItem, -1)
            flashCarousel('left')
            return
          }
          if (x >= blockStartX + block.blockWidth - CAROUSEL_BUTTON_WIDTH && x < blockStartX + block.blockWidth) {
            cycleSelect(selectItem, 1)
            flashCarousel('right')
            return
          }
        }
      }
      const displayRow = Math.min(Math.max(rowIndex + (search ? 1 : 0), focusMinRow), focusMaxRow)
      const actionsItem = rowSpec?.items.find(item => item.type === 'actions')
      if (actionsItem?.type === 'actions') {
        const rowOffset = rowTopOffset(contentRows, rowIndex, contentWidth)
        const rowY = top + 1 + titleLines + fixedHeight + rowOffset - scrollTop
        setFocus({ row: displayRow, col: 0 })
        if (y !== rowY) return
        const positions = actionPositions(contentWidth, actionsItem.confirmLabel, actionsItem.cancelLabel)
        const confirmStart = left + 1 + positions.confirmX
        const cancelStart = left + 1 + positions.cancelX
        if (x >= confirmStart && x < confirmStart + textWidth(actionsItem.confirmLabel)) {
          actionsItem.onConfirm()
          return
        }
        if (x >= cancelStart && x < cancelStart + textWidth(actionsItem.cancelLabel)) {
          setFocus({ row: displayRow, col: 1 })
          actionsItem.onCancel()
          return
        }
        return
      }
      if (safeFocus.row === displayRow && rowSpec !== undefined) {
        const item = rowSpec.items[0]
        if (item?.type === 'button') {
          item.onPress()
          return
        }
        if (item?.type === 'checkbox') {
          item.onConfirm()
          return
        }
      }
      const next = { row: displayRow, col: 0 }
      setFocus(next)
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
    const baseY = top + 1 + titleLines + fixedHeight + Math.max(0, offset - scrollTop)
    const focused = safeFocus.row === i + (search ? 1 : 0)
    visibleRows.push(
      <Box key={`row-${i}`} flexDirection="column">
        {renderRow(contentRows[i], focused, contentWidth, baseY, left, carouselPress, focused ? safeFocus.col : 0, clip)}
      </Box>,
    )
    offset += height
  }
  return (
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
            <SelectableText y={top + 1} col={left + 1 + Math.max(0, Math.floor((contentWidth - textWidth(title)) / 2))} text={title} />
          </Box>
          <Box height={1}>
            <Text> </Text>
          </Box>
        </>
      )}
      <Box flexDirection="column">
        {search && (
          <Box flexDirection="column">
            {renderRow(searchRow, safeFocus.row === 0, contentWidth, top + 1 + titleLines, left, carouselPress)}
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
              y={top + windowHeight - footerRows.length + index - 1}
              col={left + 1}
              text={line.text}
              color={line.color}
            />
          ))}
        </>
      )}
    </Box>
  )
}
