import { Box, Text } from 'ink'
import { colors } from '../../theme.ts'
import { textWidth } from '../../core/text.ts'
import { SelectableText } from '../selection.tsx'
import { registerWidget } from './registry.ts'
import type { DialogItem } from '../dialog/items.ts'

type HeaderItem = Extract<DialogItem, { type: 'header' }>

registerWidget<HeaderItem>('header', {
  selectable: false,
  height(item) {
    return item.leadingBlank === true ? 2 : 1
  },
  paintWidth(item) {
    return textWidth(item.label)
  },
  onEnter() {
    return true
  },
  render({ item, y, x, clip }) {
    const lead = item.leadingBlank === true && clip === 0 ? 1 : 0
    const label = (
      <SelectableText y={y + lead} col={x} text={item.label} color={colors.sectionHeader} bold />
    )
    if (lead === 0) return label
    return (
      <Box flexDirection="column">
        <Box height={1}>
          <Text> </Text>
        </Box>
        {label}
      </Box>
    )
  },
})
