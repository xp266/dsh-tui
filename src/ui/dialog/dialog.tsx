import { Box, Text, useCursor, useInput, useStdout } from 'ink'
import type { ReactNode } from 'react'
import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react'
import { colors } from '../../theme.ts'
import { isMouseResidue } from '../../terminal/mouse.ts'
import { textWidth } from '../../utils/text.ts'
import { HighlightedText } from '../selection.tsx'
import { renderRow } from './dialog-item.tsx'

export interface DialogRow {
  items: DialogItem[]
}

export type DialogItem =
  | { type: 'input'; label: string; value: string; onChange: (value: string) => void; onEnter?: () => void }
  | { type: 'select'; label: string; value: string; options: string[]; onChange: (value: string) => void; onEnter?: () => void }
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
  if (row.items.some(item => item.type === 'input' || item.type === 'select')) return 3
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

export interface DialogProps {
  width: number
  maxHeight: number
  title?: string
  rows: DialogRow[]
  footer?: ReactNode
  onClose: () => void
  search?: boolean
  searchRight?: boolean
}

export interface DialogHandle {
  clickAt(y: number, x: number): void
}

export function hitRowIndex(y: number, top: number, titleLines: number, rows: DialogRow[]): number | null {
  const localY = y - top - 1 - titleLines
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

export const Dialog = forwardRef<DialogHandle, DialogProps>(function Dialog(
  { width, maxHeight, title, rows, footer, onClose, search = false, searchRight = false },
  ref,
) {
  const { stdout } = useStdout()
  const { setCursorPosition } = useCursor()
  const columns = stdout?.columns ?? 80
  const totalRows = stdout?.rows ?? 24
  const [focus, setFocus] = useState<DialogFocus>({ row: search ? 1 : 0, col: 0 })
  const [scrollTop, setScrollTop] = useState(0)
  const [cursor, setCursor] = useState(0)
  const [searchValue, setSearchValue] = useState('')
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
              (item.type === 'button' || item.type === 'checkbox') &&
              (item.label.toLowerCase().includes(query) ||
                (searchRight && item.type === 'button' && item.right !== undefined && item.right.toLowerCase().includes(query))),
          ),
        )
      : rows
  const displayRows = search ? [searchRow, ...filteredRows] : rows
  const focusMinRow = search ? 1 : 0
  const focusMaxRow = Math.max(focusMinRow, displayRows.length - 1)
  const focusMinRowRef = useRef(focusMinRow)
  const focusMaxRowRef = useRef(focusMaxRow)
  useEffect(() => {
    setFocus(current =>
      current.row < focusMinRow ? { row: focusMinRow, col: 0 }
        : current.row > focusMaxRow ? { row: focusMaxRow, col: 0 }
          : current,
    )
  }, [displayRows, focusMinRow, focusMaxRow])
  const titleLines = title === undefined ? 0 : 2
  const footerLines = footer === undefined ? 0 : 1
  const windowWidth = Math.min(width + 2, columns)
  const contentWidth = Math.max(1, windowWidth - 2)
  const desired = displayRows.reduce((sum, row) => sum + rowHeight(row), 0) + titleLines + footerLines + 2
  const windowHeight = Math.min(desired, maxHeight, totalRows)
  const contentHeight = Math.max(1, windowHeight - 2 - titleLines - footerLines)
  const top = Math.max(0, Math.floor((totalRows - windowHeight) / 2))
  const left = Math.max(0, Math.floor((columns - windowWidth) / 2))
  const rowsRef = useRef(displayRows)
  const focusRef = useRef(focus)
  const scrollTopRef = useRef(scrollTop)
  const cursorRef = useRef(cursor)
  const valueRef = useRef('')
  const searchValueRef = useRef(searchValue)
  const contentHeightRef = useRef(contentHeight)
  rowsRef.current = displayRows
  focusRef.current = focus
  scrollTopRef.current = scrollTop
  cursorRef.current = cursor
  searchValueRef.current = searchValue
  contentHeightRef.current = contentHeight
  focusMinRowRef.current = focusMinRow
  focusMaxRowRef.current = focusMaxRow
  const safeFocus: DialogFocus = {
    row: Math.min(Math.max(focus.row, focusMinRow), focusMaxRow),
    col: Math.min(focus.col, Math.max(0, (displayRows[focus.row]?.items.length ?? 1) - 1)),
  }
  const current = displayRows[safeFocus.row]?.items[safeFocus.col]
  valueRef.current = current?.type === 'input' || current?.type === 'search' ? current.value : ''
  useEffect(() => {
    const item = displayRows[safeFocus.row]?.items[safeFocus.col]
    setCursor(item?.type === 'input' || item?.type === 'search' ? item.value.length : 0)
  }, [current?.type, safeFocus.row, safeFocus.col, displayRows.length])
  if (search) {
    const x = left + 1 + textWidth(searchValue)
    const y = top + 2 + titleLines
    setCursorPosition({ x, y })
  } else if (current?.type === 'input' || current?.type === 'select' || current?.type === 'search') {
    const rowOffset = rowTopOffset(displayRows, safeFocus.row)
    const valueLine = current.type === 'search' ? rowOffset : rowOffset + 1
    const y = top + 2 + titleLines + valueLine - scrollTop
    const prefix = current.type === 'select' ? current.value : current.value.slice(0, cursor)
    const x = left + 1 + textWidth(prefix)
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
    }
  }, [])
  useInput((input, key) => {
    const liveRows = rowsRef.current
    const liveFocus = focusRef.current
    const liveScroll = scrollTopRef.current
    const liveContentHeight = contentHeightRef.current
    const liveNavigate = (direction: 'up' | 'down' | 'left' | 'right') => {
      const next = moveFocus(liveRows, liveFocus, direction)
      const clamped = { ...next, row: Math.min(Math.max(next.row, focusMinRowRef.current), focusMaxRowRef.current) }
      setFocus(clamped)
      setScrollTop(adjustScroll(liveRows, clamped, liveScroll, liveContentHeight))
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
    if ((isLeft || isRight) && (liveCurrent?.type === 'input' || liveCurrent?.type === 'search')) {
      const c = cursorRef.current
      if (isLeft && c > 0) {
        cursorRef.current = c - 1
        setCursor(c - 1)
      }
      if (isRight && c < liveCurrent.value.length) {
        cursorRef.current = c + 1
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
      switch (liveCurrent.type) {
        case 'input':
          if (liveCurrent.onEnter) liveCurrent.onEnter()
          else liveNavigate('down')
          break
        case 'search':
          liveNavigate('down')
          break
        case 'select':
          if (liveCurrent.onEnter) liveCurrent.onEnter()
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
    if (search && liveCurrent?.type !== 'input' && liveCurrent?.type !== 'select') {
      const v = searchValueRef.current
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
      const c = cursorRef.current
      const v = valueRef.current
      if (key.backspace) {
        if (c > 0) {
          const next = v.slice(0, c - 1) + v.slice(c)
          valueRef.current = next
          cursorRef.current = c - 1
          liveCurrent.onChange(next)
          setCursor(c - 1)
        }
      } else if (key.delete) {
        if (c < v.length) {
          const next = v.slice(0, c) + v.slice(c + 1)
          valueRef.current = next
          liveCurrent.onChange(next)
        }
      } else if (input && !key.ctrl && !key.meta && !isMouseResidue(input)) {
        const next = v.slice(0, c) + input + v.slice(c)
        valueRef.current = next
        cursorRef.current = c + input.length
        liveCurrent.onChange(next)
        setCursor(c + input.length)
      }
    }
  })
  useImperativeHandle(ref, () => ({
    clickAt(y: number, x: number) {
      if (y < top || y >= top + windowHeight || x < left || x >= left + windowWidth) return
      const rowIndex = hitRowIndex(y, top, titleLines, displayRows)
      if (rowIndex === null) return
      const next = { row: Math.min(Math.max(rowIndex, focusMinRow), focusMaxRow), col: 0 }
      setFocus(next)
      setScrollTop(adjustScroll(displayRows, next, scrollTop, contentHeight))
    },
  }))
  const visibleRows: ReactNode[] = []
  let offset = 0
  for (let i = 0; i < displayRows.length; i++) {
    const height = rowHeight(displayRows[i])
    if (offset + height <= scrollTop) {
      offset += height
      continue
    }
    if (offset >= scrollTop + contentHeight) break
    const baseY = top + 1 + titleLines + offset - scrollTop
    visibleRows.push(
      <Box key={`row-${i}`} flexDirection="column">
        {renderRow(displayRows[i], safeFocus.row === i, contentWidth, baseY, left)}
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
            <HighlightedText y={top + 1} col={left + 1 + Math.max(0, Math.floor((contentWidth - textWidth(title)) / 2))} text={title} />
          </Box>
          <Box height={1}>
            <Text> </Text>
          </Box>
        </>
      )}
      <Box flexDirection="column" height={contentHeight} overflow="hidden">
        {visibleRows}
      </Box>
      {footer !== undefined && <Box flexDirection="column">{footer}</Box>}
    </Box>
  )
})