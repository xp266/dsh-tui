import { Box, Text, useCursor, useInput, useStdout } from 'ink'
import type { ReactNode } from 'react'
import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react'
import { colors } from '../theme.ts'
import { isMouseResidue } from '../terminal/mouse.ts'
import { padToWidth, textWidth, truncate } from '../utils/text.ts'

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
  return row.items.some(item => item.type === 'input' || item.type === 'select') ? 3 : 1
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
}

export interface DialogHandle {
  clickAt(y: number, x: number): void
}

export const Dialog = forwardRef<DialogHandle, DialogProps>(function Dialog(
  { width, maxHeight, title, rows, footer, onClose, search = false },
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
            item => (item.type === 'button' || item.type === 'checkbox') && item.label.toLowerCase().includes(query),
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
      const localY = y - top - titleLines
      let offset = 0
      for (let i = 0; i < displayRows.length; i++) {
        const height = rowHeight(displayRows[i])
        if (localY >= offset && localY < offset + height) {
          const next = { row: i, col: 0 }
          setFocus(next)
          setScrollTop(adjustScroll(displayRows, next, scrollTop, contentHeight))
          return
        }
        offset += height
      }
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
    visibleRows.push(
      <Box key={`row-${i}`} flexDirection="column">
        {renderRow(displayRows[i], safeFocus.row === i, contentWidth)}
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
            <Text>{title}</Text>
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

function renderRow(row: DialogRow, focused: boolean, contentWidth: number): ReactNode {
  return (
    <Box flexDirection="row">
      {row.items.map((item, col) => (
        <Box key={col} flexDirection="row">
          {col > 0 && <Text> </Text>}
          {renderItem(item, focused, contentWidth)}
        </Box>
      ))}
    </Box>
  )
}

function renderItem(item: DialogItem, focused: boolean, contentWidth: number): ReactNode {
  switch (item.type) {
    case 'search': {
      const isEmpty = item.value === ''
      const text = isEmpty ? 'Search' : item.value
      return (
        <Box width={contentWidth} backgroundColor={colors.userBubbleBackground}>
          <Text color={isEmpty ? colors.toolBodyText : undefined}>{truncate(text, contentWidth)}</Text>
        </Box>
      )
    }
    case 'input':
      return (
        <Box flexDirection="column">
          <Box height={1}>
            <Text>{item.label}</Text>
          </Box>
          <Box width={contentWidth} height={1} backgroundColor={colors.userBubbleBackground}>
            <Text>{truncate(item.value, contentWidth)}</Text>
          </Box>
          <Box height={1}>
            <Text> </Text>
          </Box>
        </Box>
      )
    case 'select': {
      const index = Math.max(0, item.options.indexOf(item.value))
      const next = item.options.length > 1 ? item.options[(index + 1) % item.options.length] : undefined
      return (
        <Box flexDirection="column">
          <Box height={1}>
            <Text>{item.label}</Text>
          </Box>
          <Box height={1}>
            {next === undefined ? (
              <Text>{truncate(item.value || '(none)', contentWidth)}</Text>
            ) : (
              <Box>
                <Text>{truncate(item.value || '(none)', contentWidth)}</Text>
                <Text color={colors.toolLabel}> {'→'} </Text>
                <Text color={colors.toolBodyText}>{truncate(next, contentWidth)}</Text>
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
          return <Text inverse>{padToWidth(truncate(item.label, leftWidth), leftWidth)}{right}</Text>
        }
        return (
          <Box width={contentWidth} justifyContent="space-between">
            <Text>{item.label}</Text>
            <Text>{item.right}</Text>
          </Box>
        )
      }
      if (focused) return <Text inverse>{padToWidth(truncate(item.label, contentWidth), contentWidth)}</Text>
      return <Text>{item.label}</Text>
    case 'checkbox':
      if (focused) {
        return (
          <Box>
            <Text inverse>{padToWidth(truncate(item.label, contentWidth - 2), contentWidth - 2)}</Text>
            {item.checked && (
              <Text inverse color={colors.success}>
                {' '}
                {'\u2713'}
              </Text>
            )}
          </Box>
        )
      }
      return (
        <Box>
          <Text>{item.label}</Text>
          {item.checked && <Text color={colors.success}> {'\u2713'}</Text>}
        </Box>
      )
  }
}
