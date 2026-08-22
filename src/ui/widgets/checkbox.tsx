import { Box } from 'ink'
import { colors } from '../../theme.ts'
import { padToWidth, textWidth, truncate } from '../../core/text.ts'
import { SelectableText } from '../selection.tsx'
import { registerWidget } from './registry.ts'
import type { PaintArgs } from './types.ts'
import type { DialogItem } from '../dialog/items.ts'

type CheckboxItem = Extract<DialogItem, { type: 'checkbox' }>

function paintCheckbox(item: CheckboxItem, paint: PaintArgs<CheckboxItem>) {
  const { width, y, x, focused } = paint
  const label = padToWidth(truncate(item.label, width - 2), width - 2)
  if (focused) {
    return (
      <Box>
        <SelectableText y={y} col={x} text={label} inverse />
        {item.checked && (
          <SelectableText y={y} col={x + width - 2} text={' \u2713'} color={colors.success} inverse />
        )}
      </Box>
    )
  }
  return (
    <Box>
      <SelectableText y={y} col={x} text={label} />
      {item.checked && (
        <SelectableText y={y} col={x + width - 2} text={' \u2713'} color={colors.success} />
      )}
    </Box>
  )
}

registerWidget<CheckboxItem>('checkbox', {
  selectable: true,
  height() {
    return 1
  },
  paintWidth(item) {
    return textWidth(item.label)
  },
  searchTexts(item) {
    return [item.label]
  },
  render(paint) {
    return paintCheckbox(paint.item, paint)
  },
  onEnter(item) {
    item.onConfirm()
    return true
  },
  onSpace(item) {
    item.onToggle()
  },
  activate(item) {
    item.onConfirm()
  },
})
