import { Box, Text, useCursor, useInput, usePaste, useStdout } from 'ink'
import { createContext, useContext } from 'react'
import type { ReactNode, Ref } from 'react'
import { useEffect, useImperativeHandle, useRef, useState } from 'react'
import { colors } from '../../theme.ts'
import { isMouseResidue } from '../../terminal/mouse.ts'
import { locToPoint, textWidth, truncate, wrapLines } from '../../utils/text.ts'
import { SelectableText } from '../selection.tsx'
import { actionPositions, renderRow, selectBlock, CAROUSEL_BUTTON_WIDTH } from './dialog-item.tsx'

export interface DialogRow {
  items: DialogItem[]
}

export type DialogItem =
  | { type: 'input'; label: string; value: string; onChange: (value: string) => void; onEnter?: () => void }
  | { type: 'select'; label: string; value: string; options: string[]; onChange: (value: string) => void; onEnter?: () => void; spaced?: boolean }
  | { type: 'search'; value: string; onChange: (value: string) => void }
  | { type: 'button'; label: string; right?: string; rightColor?: string; onPress: () => void }
  | { type: 'checkbox'; label: string; checked: boolean; onToggle: () => void; onConfirm: () => void }
  | { type: 'header'; label: string; leadingBlank?: boolean }
  | { type: 'actions'; confirmLabel: string; cancelLabel: string; onConfirm: () => void; onCancel: () => void }

export interface DialogFocus {
  row: number
  col: number
}

export function isSelectableRow(row: DialogRow | undefined): boolean {
  return !(row?.items.every(item => item.type === 'header') ?? true)
}

export function selectableSpan(row: DialogRow | undefined): number {
  if (row === undefined) return 0
  const only = row.items.length === 1 ? row.items[0] : undefined
  if (only?.type === 'actions') return 1
  return Math.max(0, row.items.length - 1)
}

export function snapRow(rows: DialogRow[], row: number): number {
  const count = rows.length
  if (count === 0) return 0
  const index = Math.min(Math.max(row, 0), count - 1)
  if (isSelectableRow(rows[index])) return index
  for (let down = index + 1; down < count; down++) {
    if (isSelectableRow(rows[down])) return down
  }
  for (let up = index - 1; up >= 0; up--) {
    if (isSelectableRow(rows[up])) return up
  }
  return index
}

function stepRow(rows: DialogRow[], from: number, delta: -1 | 1): number {
  let row = from + delta
  while (row >= 0 && row < rows.length && !isSelectableRow(rows[row])) row += delta
  return row >= 0 && row < rows.length ? row : from
}

function focusedItem(row: DialogRow | undefined, col: number): DialogItem | undefined {
  if (row === undefined) return undefined
  if (row.items.length === 1 && row.items[0]?.type === 'actions') return row.items[0]
  return row.items[col]
}

export function moveFocus(rows: DialogRow[], focus: DialogFocus, key: 'up' | 'down' | 'left' | 'right'): DialogFocus {
  switch (key) {
    case 'up':
      return { row: stepRow(rows, focus.row, -1), col: 0 }
    case 'down':
      return { row: stepRow(rows, focus.row, 1), col: 0 }
    case 'left':
      return { row: focus.row, col: Math.max(0, focus.col - 1) }
    case 'right': {
      const max = selectableSpan(rows[focus.row])
      return { row: focus.row, col: Math.max(0, Math.min(max, focus.col + 1)) }
    }
  }
}

export function clampFocus(rows: DialogRow[], focus: DialogFocus, minRow: number, maxRow: number): DialogFocus {
  const row = snapRow(rows, Math.min(Math.max(focus.row, minRow), maxRow))
  return { row, col: Math.min(focus.col, selectableSpan(rows[row])) }
}

export function rowHeight(row: DialogRow, width: number): number {
  const only = row.items.length === 1 ? row.items[0] : undefined
  if (only?.type === 'header') return only.leadingBlank === true ? 2 : 1
  if (only?.type === 'actions') return 1
  const input = row.items.find((item): item is Extract<DialogItem, { type: 'input' }> => item.type === 'input')
  if (input !== undefined) return 2 + wrapLines(input.value, width).length
  if (row.items.some(item => item.type === 'select' && item.spaced)) return 2
  if (row.items.some(item => item.type === 'search')) return 2
  return 1
}

export function rowTopOffset(rows: DialogRow[], rowIndex: number, width: number): number {
  let offset = 0
  for (let i = 0; i < rowIndex; i++) offset += rowHeight(rows[i]!, width)
  return offset
}

export function rowBlockSpan(rows: DialogRow[], rowIndex: number, width: number): { top: number; bottom: number } {
  const top = rowTopOffset(rows, rowIndex, width)
  let blockTop = top
  let bottom = top + rowHeight(rows[rowIndex] ?? { items: [] }, width) - 1
  for (let i = rowIndex - 1; i >= 0 && !isSelectableRow(rows[i]); i--) blockTop -= rowHeight(rows[i]!, width)
  for (let i = rowIndex + 1; i < rows.length && !isSelectableRow(rows[i]); i++) bottom += rowHeight(rows[i]!, width)
  return { top: blockTop, bottom }
}

export function adjustScroll(rows: DialogRow[], focus: DialogFocus, scrollTop: number, contentHeight: number, width: number): number {
  const { top, bottom } = rowBlockSpan(rows, focus.row, width)
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
  search?: boolean
  searchRight?: boolean
  onCtrlD?(focused: DialogItem | undefined): boolean
  onActivity?(): void
  ref?: Ref<DialogHandle>
}

export function filterRowsWithHeaders(rows: DialogRow[], query: string, searchRight: boolean): DialogRow[] {
  const q = query.trim().toLowerCase()
  if (q === '') return rows
  const matches = (item: DialogItem): boolean =>
    (item.type === 'button' || item.type === 'checkbox' || item.type === 'select') &&
    (item.label.toLowerCase().includes(q) ||
      (searchRight && item.type === 'button' && item.right !== undefined && item.right.toLowerCase().includes(q)))
  const out: DialogRow[] = []
  let pendingHeader: DialogRow | undefined
  for (const row of rows) {
    if (!isSelectableRow(row)) {
      pendingHeader = row
      continue
    }
    if (!row.items.some(matches)) continue
    if (pendingHeader !== undefined) {
      out.push(pendingHeader)
      pendingHeader = undefined
    }
    out.push(row)
  }
  const first = out[0]
  if (first !== undefined && first.items.length === 1 && first.items[0]?.type === 'header') {
    out[0] = { items: [{ ...first.items[0], leadingBlank: false }] }
  }
  return out
}

export interface DialogHandle {
  clickAt(y: number, x: number): void
  wheelAt(y: number, dir: -1 | 1): boolean
}

export const CloseGuardContext = createContext(false)

export function hitRowIndex(y: number, top: number, titleLines: number, rows: DialogRow[], scrollTop = 0, width = Number.POSITIVE_INFINITY): number | null {
  const localY = y - top - 1 - titleLines + scrollTop
  let offset = 0
  for (let i = 0; i < rows.length; i++) {
    const height = rowHeight(rows[i]!, width)
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
    process.stdout.write(isInput ? '\x1b[1 q' : '\x1b[2 q')
  }, [current?.type, safeFocus.row, safeFocus.col])
  useEffect(() => {
    return () => {
      process.stdout.write('\x1b[0 q')
      clearTimeout(carouselPressTimer.current)
    }
  }, [])
  usePaste(text => {
    onActivity?.()
    const liveCurrent = live.current.rows[live.current.focus.row]?.items[live.current.focus.col]
    if (liveCurrent?.type !== 'input' && liveCurrent?.type !== 'search') return
    const normalized = text.replace(/\r\n?/g, '\n')
    if (normalized === '') return
    const c = live.current.cursor
    const next = liveCurrent.value.slice(0, c) + normalized + liveCurrent.value.slice(c)
    liveCurrent.onChange(next)
    live.current.value = next
    live.current.cursor = c + normalized.length
    setCursor(c + normalized.length)
  })
  useInput((input, key) => {
    const liveRows = live.current.rows
    const liveFocus = live.current.focus
    const liveScroll = live.current.scrollTop
    const liveContentHeight = live.current.viewportHeight
    const liveNavigate = (direction: 'up' | 'down' | 'left' | 'right') => {
      const next = moveFocus(liveRows, liveFocus, direction)
      const clamped = clampFocus(liveRows, next, live.current.focusMinRow, live.current.focusMaxRow)
      setFocus(clamped)
      const contentRow = Math.max(0, clamped.row - (search ? 1 : 0))
      setScrollTop(adjustScroll(live.current.contentRows, { row: contentRow, col: clamped.col }, liveScroll, liveContentHeight, live.current.contentWidth))
    }
    const liveCurrent = focusedItem(liveRows[liveFocus.row], liveFocus.col)
    const rawArrow = arrowFromRaw(input)
    const isUp = key.upArrow || rawArrow === 'up'
    const isDown = key.downArrow || rawArrow === 'down'
    const isLeft = key.leftArrow || rawArrow === 'left'
    const isRight = key.rightArrow || rawArrow === 'right'
    if (key.ctrl && input === 'd' && onCtrlD !== undefined && onCtrlD(liveCurrent)) return
    onActivity?.()
    if (key.escape || (key.ctrl && input === 'c')) {
      if (!(key.ctrl && closeGuarded)) onClose()
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
    if ((isLeft || isRight) && liveCurrent?.type === 'actions') {
      liveNavigate(isRight ? 'right' : 'left')
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
        case 'actions':
          if (liveFocus.col === 1) liveCurrent.onCancel()
          else liveCurrent.onConfirm()
          break
        case 'header':
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
    wheelAt(y, dir) {
      onActivity?.()
      if (y < top || y >= top + windowHeight) return false
      const state = live.current
      const next = moveFocus(state.rows, state.focus, dir === -1 ? 'up' : 'down')
      const clamped = clampFocus(state.rows, next, state.focusMinRow, state.focusMaxRow)
      setFocus(clamped)
      const contentRow = Math.max(0, clamped.row - (search ? 1 : 0))
      setScrollTop(adjustScroll(state.contentRows, { row: contentRow, col: clamped.col }, state.scrollTop, state.viewportHeight, state.contentWidth))
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
    const baseY = top + 1 + titleLines + fixedHeight + offset - scrollTop
    const focused = safeFocus.row === i + (search ? 1 : 0)
    visibleRows.push(
      <Box key={`row-${i}`} flexDirection="column">
        {renderRow(contentRows[i], focused, contentWidth, baseY, left, carouselPress, focused ? safeFocus.col : 0)}
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