import { Box, Text, useCursor, useInput, useStdout } from 'ink'
import type { ReactNode } from 'react'
import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react'
import { colors } from '../theme.ts'
import { isMouseResidue } from '../terminal/mouse.ts'
import { padToWidth, textWidth, truncate } from '../utils/text.ts'
import { HighlightedText } from './selection.tsx'

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

export const Dialog = forwardRef<DialogHandle, DialogProps>(function Dialog(
  { width, maxHeight, title, rows, footer, onClose, search = false, searchRight = false },
  ref,
) {
  const { stdout } = useStdout()
  const { setCursorPosition } = useCursor()
  const columns = stdout?.columns ?? 80
  const totalRows = stdout?.rows ?? 24
  const [focus, setFocus] = useState<DialogFocus>({ row: 0, col: 0 })
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
  useEffect(() => {
    setFocus(current => (current.row > displayRows.length - 1 ? { row: Math.max(0, displayRows.length - 1), col: 0 } : current))
  }, [displayRows])
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
  const contentHeightRef = useRef(contentHeight)
  rowsRef.current = displayRows
  focusRef.current = focus
  scrollTopRef.current = scrollTop
  cursorRef.current = cursor
  contentHeightRef.current = contentHeight
  const safeFocus: DialogFocus = {
    row: Math.min(focus.row, Math.max(0, displayRows.length - 1)),
    col: Math.min(focus.col, Math.max(0, (displayRows[focus.row]?.items.length ?? 1) - 1)),
  }
  const current = displayRows[safeFocus.row]?.items[safeFocus.col]
  valueRef.current = current?.type === 'input' || current?.type === 'search' ? current.value : ''
  useEffect(() => {
    const item = displayRows[safeFocus.row]?.items[safeFocus.col]
    setCursor(item?.type === 'input' || item?.type === 'search' ? item.value.length : 0)
  }, [current?.type, safeFocus.row, safeFocus.col, displayRows.length])
  if (current?.type === 'input' || current?.type === 'select' || current?.type === 'search') {
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
      setFocus(next)
      setScrollTop(adjustScroll(liveRows, next, liveScroll, liveContentHeight))
    }
    const liveCurrent = liveRows[liveFocus.row]?.items[liveFocus.col]
    if (key.escape || (key.ctrl && input === 'c')) {
      onClose()
      return
    }
    if ((key.leftArrow || key.rightArrow) && liveCurrent?.type === 'select' && liveCurrent.options.length > 1) {
      const index = Math.max(0, liveCurrent.options.indexOf(liveCurrent.value))
      const length = liveCurrent.options.length
      const chosen = key.rightArrow
        ? liveCurrent.options[(index + 1) % length]
        : liveCurrent.options[(index - 1 + length) % length]
      if (chosen !== undefined) liveCurrent.onChange(chosen)
      return
    }
    if ((key.leftArrow || key.rightArrow) && (liveCurrent?.type === 'input' || liveCurrent?.type === 'search')) {
      const c = cursorRef.current
      if (key.leftArrow && c > 0) {
        cursorRef.current = c - 1
        setCursor(c - 1)
      }
      if (key.rightArrow && c < liveCurrent.value.length) {
        cursorRef.current = c + 1
        setCursor(c + 1)
      }
      return
    }
    if (key.upArrow || key.downArrow) {
      liveNavigate(key.upArrow ? 'up' : 'down')
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
      const next = { row: rowIndex, col: 0 }
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

function renderRow(row: DialogRow, focused: boolean, contentWidth: number, baseY: number, left: number): ReactNode {
  let col = left + 1
  return (
    <Box flexDirection="row">
      {row.items.map((item, index) => {
        const next = renderItem(item, focused, contentWidth, baseY, col)
        col += textWidth(itemText(item)) + 1
        return (
          <Box key={index} flexDirection="row">
            {index > 0 && <Text> </Text>}
            {next}
          </Box>
        )
      })}
    </Box>
  )
}

function itemText(item: DialogItem): string {
  switch (item.type) {
    case 'search':
      return item.value === '' ? 'Search' : item.value
    case 'input':
      return item.label
    case 'select':
      return item.label
    case 'button':
      return item.label + (item.right ?? '')
    case 'checkbox':
      return item.label
  }
}

function renderItem(item: DialogItem, focused: boolean, contentWidth: number, baseY: number, left: number): ReactNode {
  switch (item.type) {
    case 'search': {
      const isEmpty = item.value === ''
      const text = isEmpty ? 'Search' : item.value
      return (
        <Box flexDirection="column">
          <Box width={contentWidth} backgroundColor={colors.userBubbleBackground}>
            <HighlightedText y={baseY} col={left} text={truncate(text, contentWidth)} color={isEmpty ? colors.toolBodyText : undefined} />
          </Box>
          <Box height={1}>
            <Text> </Text>
          </Box>
        </Box>
      )
    }
    case 'input':
      return (
        <Box flexDirection="column">
          <Box height={1}>
            <HighlightedText y={baseY} col={left} text={item.label} />
          </Box>
          <Box width={contentWidth} height={1} backgroundColor={colors.userBubbleBackground}>
            <HighlightedText y={baseY + 1} col={left} text={truncate(item.value, contentWidth)} />
          </Box>
          <Box height={1}>
            <Text> </Text>
          </Box>
        </Box>
      )
    case 'select': {
      const index = Math.max(0, item.options.indexOf(item.value))
      const next = item.options.length > 1 ? item.options[(index + 1) % item.options.length] : undefined
      const value = truncate(item.value || '(none)', contentWidth)
      return (
        <Box flexDirection="column">
          <Box height={1}>
            <HighlightedText y={baseY} col={left} text={item.label} />
          </Box>
          <Box height={1}>
            {next === undefined ? (
              <HighlightedText y={baseY + 1} col={left} text={value} />
            ) : (
              <Box>
                <HighlightedText y={baseY + 1} col={left} text={value} />
                <HighlightedText y={baseY + 1} col={left + textWidth(value)} text={' → '} color={colors.toolLabel} />
                <HighlightedText y={baseY + 1} col={left + textWidth(value) + 3} text={truncate(next, contentWidth)} color={colors.toolBodyText} />
              </Box>
            )}
          </Box>
          <Box height={1}>
            <Text> </Text>
          </Box>
        </Box>
      )
    }
    case 'button':
      if (item.right !== undefined) {
        if (focused) {
          const right = truncate(item.right, Math.floor(contentWidth / 2))
          const leftWidth = Math.max(1, contentWidth - textWidth(right))
          return <HighlightedText y={baseY} col={left} text={padToWidth(truncate(item.label, leftWidth), leftWidth) + right} inverse />
        }
        const right = item.right
        return (
          <Box width={contentWidth} justifyContent="space-between">
            <HighlightedText y={baseY} col={left} text={item.label} />
            <HighlightedText y={baseY} col={left + contentWidth - textWidth(right)} text={right} />
          </Box>
        )
      }
      if (focused) return <HighlightedText y={baseY} col={left} text={padToWidth(truncate(item.label, contentWidth), contentWidth)} inverse />
      return <HighlightedText y={baseY} col={left} text={item.label} />
    case 'checkbox':
      if (focused) {
        return (
          <Box>
            <HighlightedText y={baseY} col={left} text={padToWidth(truncate(item.label, contentWidth - 2), contentWidth - 2)} inverse />
            {item.checked && (
              <HighlightedText y={baseY} col={left + contentWidth - 2} text={' \u2713'} color={colors.success} inverse />
            )}
          </Box>
        )
      }
      return (
        <Box>
          <HighlightedText y={baseY} col={left} text={item.label} />
          {item.checked && <HighlightedText y={baseY} col={left + textWidth(item.label)} text={' \u2713'} color={colors.success} />}
        </Box>
      )
  }
}
