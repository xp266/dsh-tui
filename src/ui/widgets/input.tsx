import { Box, Text } from 'ink'
import { colors } from '../../theme.ts'
import { locToPoint, textWidth, wrapLines } from '../../core/text.ts'
import { SelectableText } from '../selection.tsx'
import { registerWidget } from './registry.ts'
import type { DialogItem } from '../dialog/items.ts'

type InputItem = Extract<DialogItem, { type: 'input' }>

registerWidget<InputItem>('input', {
  selectable: true,
  editable: true,
  height(item, width) {
    return 2 + wrapLines(item.value, width).length
  },
  paintWidth(item) {
    return textWidth(item.label)
  },
  caret(item, cursor, width) {
    const point = locToPoint(item.value, width, cursor)
    return { dy: 1 + point.row, dx: point.col }
  },
  render({ item, width, y, x, clip }) {
    const lines = wrapLines(item.value, width)
    const first = Math.min(Math.max(clip - 1, 0), lines.length)
    const parts = []
    let lineY = y
    if (clip === 0) {
      parts.push(
        <Box key="label" height={1}>
          <SelectableText y={lineY} col={x} text={item.label} />
        </Box>,
      )
      lineY += 1
    }
    for (let index = first; index < lines.length; index++) {
      const currentY = lineY
      parts.push(
        <Box key={index} width={width} height={1} backgroundColor={colors.dialogInputBackground}>
          <SelectableText y={currentY} col={x} text={lines[index]!} />
        </Box>,
      )
      lineY += 1
    }
    parts.push(
      <Box key="pad" height={1}>
        <Text> </Text>
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
})
