import { Box, Text } from 'ink'
import { DIALOG_COLORS } from '../../theme.ts'
import { locToPoint, textWidth, wrapLines } from '../../core/text.ts'
import { caretNonceBold, caretNonceColor, caretNonceText } from '../../core/caret-nonce.ts'
import { SelectableText } from '../selection.tsx'
import { BUILTIN_WIDGET_ORDER, registerWidget } from './registry.ts'
import { INPUT_MAX_ROWS } from '../dialog/sizes.ts'
import type { DialogItem } from '../dialog/items.ts'

type InputItem = Extract<DialogItem, { type: 'input' }>

function scrollStart(lines: number, caretRow: number): number {
  return Math.min(Math.max(caretRow - (INPUT_MAX_ROWS - 1), 0), Math.max(0, lines - INPUT_MAX_ROWS))
}

registerWidget<InputItem>('input', {
  selectable: true,
  editable: true,
  height(item, width) {
    return 2 + Math.min(wrapLines(item.value, width).length, INPUT_MAX_ROWS)
  },
  paintWidth(item) {
    return textWidth(item.label)
  },
  caret(item, cursor, width) {
    const point = locToPoint(item.value, width, cursor)
    const lines = wrapLines(item.value, width).length
    return { dy: 1 + point.row - scrollStart(lines, point.row), dx: point.col }
  },
  render({ item, focused, cursor, width, y, x, clip }) {
    const lines = wrapLines(item.value, width)
    const shown = Math.min(lines.length, INPUT_MAX_ROWS)
    const point = cursor === undefined ? null : locToPoint(item.value, width, cursor)
    const first = point === null ? 0 : scrollStart(lines.length, point.row)
    const parts = []
    if (clip === 0) {
      parts.push(
        <Box key="label" height={1}>
          <SelectableText y={y} col={x} text={item.label} color={focused ? DIALOG_COLORS.ink : DIALOG_COLORS.dialogHintText} />
        </Box>,
      )
    }
    for (let index = 0; index < shown; index++) {
      if (1 + index < clip) continue
      const currentY = y + 1 + index - clip
      parts.push(
        <Box key={index} width={width} height={1} backgroundColor={DIALOG_COLORS.dialogInputBackground}>
          <SelectableText y={currentY} col={x} text={lines[first + index]!} />
        </Box>,
      )
    }
    parts.push(
      <Box key="pad" height={1}>
        <Text
          color={focused && cursor !== undefined ? caretNonceColor(cursor) : undefined}
          bold={focused && cursor !== undefined ? caretNonceBold(cursor) : undefined}
        >
          {focused && cursor !== undefined ? caretNonceText(cursor) : ' '}
        </Text>
      </Box>,
    )
    return <Box flexDirection="column">{parts}</Box>
  },
  onLeftRight(item, direction, api) {
    if (direction === -1 && api.cursor > 0) api.setCursor(api.cursor - 1)
    if (direction === 1 && api.cursor < item.value.length) api.setCursor(api.cursor + 1)
    return true
  },
  onEnter(item) {
    if (item.onEnter !== undefined) {
      item.onEnter()
      return true
    }
    return false
  },
}, { order: BUILTIN_WIDGET_ORDER })
