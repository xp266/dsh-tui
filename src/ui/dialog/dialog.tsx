import { Box, Text, useCursor, useInput, useStdout } from 'ink'
import type { ReactNode, Ref } from 'react'
import { useEffect, useImperativeHandle, useRef, useState } from 'react'
import { colors } from '../../theme.ts'
import { isMouseResidue } from '../../terminal/mouse.ts'
import { textWidth, truncate, wrapLines } from '../../utils/text.ts'
import { SelectableText } from '../selection.tsx'
import { renderRow, selectBlock, CAROUSEL_BUTTON_WIDTH } from './dialog-item.tsx'

export interface DialogRow {
  items: DialogItem[]
}

export type DialogItem =
  | { type: 'input'; label: string; value: string; onChange: (value: string) => void; onEnter?: () => void }
  | { type: 'select'; label: string; value: string; options: string[]; onChange: (value: string) => void; onEnter?: () => void; spaced?: boolean }
  | { type: 'search'; value: string; onChange: (value: string) => void }
  | { type: 'button'; label: string; right?: string; onPress: () => void }
  | { type: 'checkbox'; label: string; checked: boolean; onToggle: () => void; onConfirm: () => void }

export interface DialogFocus {
  row: number
  col: number
}

export function moveFocus(rows: DialogRow[], focus: DialogFocus, key: 'up' | 'down' | 'left' | 'right'): DialogFocus {
  switch (key) {
    case 'up':
      return { row: Math.max(0, focus.row - 1), col: 0 }
    case 'down':
      return { row: Math.max(0, Math.min(rows.length - 1, focus.row + 1)), col: 0 }
    case 'left':
      return { row: focus.row, col: Math.max(0, focus.col - 1) }
    case 'right': {
      const rowSpec = rows[focus.row]
      const max = rowSpec === undefined ? 0 : rowSpec.items.length - 1
      return { row: focus.row, col: Math.max(0, Math.min(max, focus.col + 1)) }
    }
  }
}

export function rowHeight(row: DialogRow): number {
  if (row.items.some(item => item.type === 'input')) return 3
  if (row.items.some(item => item.type === 'select' && item.spaced)) return 2
  if (row.items.some(item => item.type === 'search')) return 2
  return 1
}

export function rowTopOffset(rows: DialogRow[], rowIndex: number): number {
  let offset = 0
  for (let i = 0; i < rowIndex; i++) offset += rowHeight(rows[i])
  return offset
}

export function adjustScroll(rows: DialogRow[], focus: DialogFocus, scrollTop: number, contentHeight: number): number {
  const top = rowTopOffset(rows, focus.row)
  const bottom = top + rowHeight(rows[focus.row] ?? { items: [] }) - 1
  if (top < scrollTop) return top
  if (bottom >= scrollTop + contentHeight) return Math.max(0, bottom - contentHeight + 1)
  return scrollTop
}

export interface DialogFooterLine {
  text: string
  color?: string
}

interface FooterRenderLine {
  text: string
  color?: string
}

function wrapFooter(footer: DialogFooterLine[] | undefined, width: number): FooterRenderLine[] {
  if (footer === undefined) return []
  const rows: FooterRenderLine[] = []
  for (const line of footer) {
    if (line.text === '') continue
    const wrapped = wrapLines(line.text, width)
    const capped = wrapped.slice(0, 2)
    if (wrapped.length > 2) {
      capped[1] = truncate(capped[1] ?? '', Math.max(1, width - 1)) + '…'
    }
    for (const text of capped) rows.push({ text, color: line.color })
  }
  return rows
}

export interface DialogProps {
  width: number
  maxHeight: number
  title?: string
  rows: DialogRow[]
  footer?: DialogFooterLine[]
  onClose: () => void
  onConfirmLast?: () => void
  search?: boolean
  searchRight?: boolean
  ref?: Ref<DialogHandle>
}

export interface DialogHandle {
  clickAt(y: number, x: number): void
}

export function hitRowIndex(y: number, top: number, titleLines: number, rows: DialogRow[], scrollTop = 0): number | null {
  const localY = y - top - 1 - titleLines + scrollTop
  let offset = 0
  for (let i = 0; i < rows.length; i++) {
    const height = rowHeight(rows[i])
    if (localY >= offset && localY < offset + height) return i
    offset += height
  }
  return null
}

function arrowFromRaw(input: string): 'up' | 'down' | 'left' | 'right' | null {
  const match = /^(?:\[|O)(?:1;)?\d*(?::\d+)?([ABCD])$/.exec(input)
  if (match === null) return null
  const letter = match[1]!
  return letter === 'A' ? 'up' : letter === 'B' ? 'down' : letter === 'C' ? 'right' : 'left'
}

export function Dialog({
  width,
  maxHeight,
  title,
  rows,
  footer,
  onClose,
  onConfirmLast,
  search = false,
  searchRight = false,
  ref,
}: DialogProps) {
  const { stdout } = useStdout()
  const { setCursorPosition } = useCursor()
  const columns = stdout?.columns ?? 80
  const totalRows = stdout?.rows ?? 24
  const [focus, setFocus] = useState<DialogFocus>({ row: search ? 1 : 0, col: 0 })
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
  const query = searchValue.trim().toLowerCase()
  const filteredRows =
    search && query !== ''
      ? rows.filter(row =>
          row.items.some(
            item =>
              (item.type === 'button' || item.type === 'checkbox' || item.type === 'select') &&
              (item.label.toLowerCase().includes(query) ||
                (searchRight && item.type === 'button' && item.right !== undefined && item.right.toLowerCase().includes(query))),
          ),
        )
      : rows
  const displayRows = search ? [searchRow, ...filteredRows] : rows
  const contentRows = search ? filteredRows : rows
  const fixedHeight = search ? rowHeight(searchRow) : 0
  const focusMinRow = search ? 1 : 0
  const focusMaxRow = Math.max(focusMinRow, displayRows.length - 1)
  useEffect(() => {
    setFocus(current =>
      current.row < focusMinRow ? { row: focusMinRow, col: 0 }
        : current.row > focusMaxRow ? { row: focusMaxRow, col: 0 }
          : current,
    )
  }, [displayRows, focusMinRow, focusMaxRow])
  const titleLines = title === undefined ? 0 : 2
  const windowWidth = Math.min(width + 2, columns)
  const contentWidth = Math.max(1, windowWidth - 2)
  const footerRows = wrapFooter(footer, contentWidth)
  const extraHeight = footerRows.length > 0 ? 1 + footerRows.length : 0
  const desired = displayRows.reduce((sum, row) => sum + rowHeight(row), 0) + titleLines + extraHeight + 2
  const windowHeight = Math.min(desired, maxHeight, totalRows)
  const contentHeight = Math.max(1, windowHeight - 2 - titleLines - extraHeight)
  const viewportHeight = Math.max(1, contentHeight - fixedHeight)
  const top = Math.max(0, Math.floor((totalRows - windowHeight) / 2))
  const left = Math.max(0, Math.floor((columns - windowWidth) / 2))
  const live = useRef({
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
  const safeFocus: DialogFocus = {
    row: Math.min(Math.max(focus.row, focusMinRow), focusMaxRow),
    col: Math.min(focus.col, Math.max(0, (displayRows[focus.row]?.items.length ?? 1) - 1)),
  }
  const current = displayRows[safeFocus.row]?.items[safeFocus.col]
  live.current.value = current?.type === 'input' || current?.type === 'search' ? current.value : ''
  useEffect(() => {
    const item = displayRows[safeFocus.row]?.items[safeFocus.col]
    setCursor(item?.type === 'input' || item?.type === 'search' ? item.value.length : 0)
  }, [current?.type, safeFocus.row, safeFocus.col, displayRows.length])
  if (search) {
    const x = left + 1 + textWidth(searchValue)
    const y = top + 2 + titleLines
    setCursorPosition({ x, y })
  } else if (current?.type === 'input' || current?.type === 'select' || current?.type === 'search') {
    const contentIndex = Math.max(0, safeFocus.row - (search ? 1 : 0))
    const rowOffset = rowTopOffset(contentRows, contentIndex)
    const valueLine = current.type === 'select' || current.type === 'search' ? rowOffset : rowOffset + 1
    const y = top + 2 + titleLines + fixedHeight + valueLine - scrollTop
    const block = current.type === 'select' ? selectBlock(contentWidth, current.value) : undefined
    const prefix = current.type === 'select' ? undefined : current.value.slice(0, cursor)
    const x = block !== undefined
      ? left + 1 + block.blockStart + block.cursorX
      : left + 1 + textWidth(prefix ?? '')
    setCursorPosition({ x, y })
  } else {
    setCursorPosition(undefined)
  }
  useEffect(() => {
    const isInput = current?.type === 'input' || current?.type === 'select' || current?.type === 'search'
    process.stdout.write(isInput ? '\x1b[1 q' : '\x1b[2 q')
  }, [current?.type, safeFocus.row, safeFocus.col])
  useEffect(() => {
    return () => {
      process.stdout.write('\x1b[0 q')
      clearTimeout(carouselPressTimer.current)
    }
  }, [])
  useInput((input, key) => {
    const liveRows = live.current.rows
    const liveFocus = live.current.focus
    const liveScroll = live.current.scrollTop
    const liveContentHeight = live.current.viewportHeight
    const liveNavigate = (direction: 'up' | 'down' | 'left' | 'right') => {
      const next = moveFocus(liveRows, liveFocus, direction)
      const clamped = { ...next, row: Math.min(Math.max(next.row, live.current.focusMinRow), live.current.focusMaxRow) }
      setFocus(clamped)
      const contentRow = Math.max(0, clamped.row - (search ? 1 : 0))
      setScrollTop(adjustScroll(live.current.contentRows, { row: contentRow, col: clamped.col }, liveScroll, liveContentHeight))
    }
    const liveCurrent = liveRows[liveFocus.row]?.items[liveFocus.col]
    const rawArrow = arrowFromRaw(input)
    const isUp = key.upArrow || rawArrow === 'up'
    const isDown = key.downArrow || rawArrow === 'down'
    const isLeft = key.leftArrow || rawArrow === 'left'
    const isRight = key.rightArrow || rawArrow === 'right'
    if (key.escape || (key.ctrl && input === 'c')) {
      onClose()
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
      const c = live.current.cursor
      if (isLeft && c > 0) {
        live.current.cursor = c - 1
        setCursor(c - 1)
      }
      if (isRight && c < liveCurrent.value.length) {
        live.current.cursor = c + 1
        setCursor(c + 1)
      }
      return
    }
    if (isUp || isDown) {
      liveNavigate(isUp ? 'up' : 'down')
      return
    }
    if (key.return) {
      if (liveCurrent === undefined) return
      const onLastRow = liveFocus.row === liveRows.length - 1
      switch (liveCurrent.type) {
        case 'input':
          if (liveCurrent.onEnter) liveCurrent.onEnter()
          else if (onLastRow && onConfirmLast !== undefined) onConfirmLast()
          else liveNavigate('down')
          break
        case 'search':
          liveNavigate('down')
          break
        case 'select':
          if (liveCurrent.onEnter) liveCurrent.onEnter()
          else if (onLastRow && onConfirmLast !== undefined) onConfirmLast()
          else liveNavigate('down')
          break
        case 'button':
          liveCurrent.onPress()
          break
        case 'checkbox':
          liveCurrent.onConfirm()
          break
      }
      return
    }
    if (input === ' ' && liveCurrent?.type === 'checkbox') {
      liveCurrent.onToggle()
      return
    }
    if (search && liveCurrent?.type !== 'input') {
      const v = live.current.searchValue
      if ((key.backspace || key.delete) && v.length > 0) {
        handleSearch(v.slice(0, -1))
        return
      }
      if (input && !key.ctrl && !key.meta && !isMouseResidue(input)) {
        handleSearch(v + input)
        return
      }
    }
    if (liveCurrent?.type === 'input' || liveCurrent?.type === 'search') {
      const c = live.current.cursor
      const v = live.current.value
      if (key.backspace) {
        if (c > 0) {
          const next = v.slice(0, c - 1) + v.slice(c)
          live.current.value = next
          live.current.cursor = c - 1
          liveCurrent.onChange(next)
          setCursor(c - 1)
        }
      } else if (key.delete) {
        if (c < v.length) {
          const next = v.slice(0, c) + v.slice(c + 1)
          live.current.value = next
          liveCurrent.onChange(next)
        }
      } else if (input && !key.ctrl && !key.meta && !isMouseResidue(input)) {
        const next = v.slice(0, c) + input + v.slice(c)
        live.current.value = next
        live.current.cursor = c + input.length
        liveCurrent.onChange(next)
        setCursor(c + input.length)
      }
    }
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
    clickAt(y: number, x: number) {
      if (y < top || y >= top + windowHeight || x < left || x >= left + windowWidth) return
      const rowIndex = hitRowIndex(y, top + fixedHeight, titleLines, contentRows, scrollTop)
      if (rowIndex === null) return
      const rowSpec = contentRows[rowIndex]
      const selectItem = rowSpec?.items.find(item => item.type === 'select')
      if (selectItem?.type === 'select' && selectItem.options.length > 1) {
        const block = selectBlock(contentWidth, selectItem.value)
        const blockStartX = left + 1 + block.blockStart
        const rowOffset = rowTopOffset(contentRows, rowIndex)
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
      const next = { row: Math.min(Math.max(rowIndex + (search ? 1 : 0), focusMinRow), focusMaxRow), col: 0 }
      setFocus(next)
      const contentRow = Math.max(0, Math.min(rowIndex, contentRows.length - 1))
      setScrollTop(adjustScroll(contentRows, { row: contentRow, col: 0 }, scrollTop, viewportHeight))
    },
  }))
  const visibleRows: ReactNode[] = []
  let offset = 0
  for (let i = 0; i < contentRows.length; i++) {
    const height = rowHeight(contentRows[i])
    if (offset + height <= scrollTop) {
      offset += height
      continue
    }
    if (offset >= scrollTop + viewportHeight) break
    const baseY = top + 1 + titleLines + fixedHeight + offset - scrollTop
    visibleRows.push(
      <Box key={`row-${i}`} flexDirection="column">
        {renderRow(contentRows[i], safeFocus.row === i + (search ? 1 : 0), contentWidth, baseY, left, carouselPress)}
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