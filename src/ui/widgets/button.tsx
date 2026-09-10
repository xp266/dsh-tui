import { Box } from 'ink'
import { padToWidth, textWidth, truncate } from '../../core/text.ts'
import { DIALOG_COLORS } from '../../theme.ts'
import { SelectableText } from '../selection.tsx'
import { BUILTIN_WIDGET_ORDER, registerWidget } from './registry.ts'
import type { PaintArgs } from './types.ts'
import type { DialogItem } from '../dialog/items.ts'

type ButtonItem = Extract<DialogItem, { type: 'button' }>

function paintButton(item: ButtonItem, paint: PaintArgs<ButtonItem>) {
  const { width, y, x, focused } = paint
  if (item.right !== undefined) {
    const right = truncate(item.right, Math.floor(width / 2))
    const leftWidth = Math.max(1, width - textWidth(right))
    const label = padToWidth(truncate(item.label, leftWidth), leftWidth)
    if (focused) {
      return (
        <Box>
          <SelectableText y={y} col={x} text={label} inverse color={item.rightColor} />
          <SelectableText y={y} col={x + leftWidth} text={right} inverse color={item.rightColor} />
        </Box>
      )
    }
    return (
      <Box width={width} justifyContent="space-between">
        <SelectableText y={y} col={x} text={item.label} />
        <SelectableText y={y} col={x + width - textWidth(right)} text={right} color={item.rightColor ?? DIALOG_COLORS.dialogHintText} />
      </Box>
    )
  }
  if (focused) return <SelectableText y={y} col={x} text={padToWidth(truncate(item.label, width), width)} inverse />
  return <SelectableText y={y} col={x} text={item.label} />
}

registerWidget<ButtonItem>('button', {
  selectable: true,
  height() {
    return 1
  },
  paintWidth(item) {
    return textWidth(item.label + (item.right ?? ''))
  },
  searchTexts(item, searchRight) {
    return searchRight && item.right !== undefined ? [item.label, item.right] : [item.label]
  },
  render(paint) {
    return paintButton(paint.item, paint)
  },
  onEnter(item) {
    item.onPress()
    return true
  },
  activate(item) {
    item.onPress()
  },
}, { order: BUILTIN_WIDGET_ORDER })
