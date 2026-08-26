import { Box, Text } from 'ink'
import { colors } from '../../theme.ts'
import { padToWidth, textWidth, truncate } from '../../core/text.ts'
import { SelectableText } from '../selection.tsx'
import { caretNonceColor } from '../../core/caret-nonce.ts'
import { registerWidget } from './registry.ts'
import type { DialogItem } from '../dialog/items.ts'

type SearchItem = Extract<DialogItem, { type: 'search' }>

export function searchTextOf(item: SearchItem): string {
  return item.value === '' ? 'Search' : item.value
}

registerWidget<SearchItem>('search', {
  selectable: true,
  editable: true,
  height() {
    return 2
  },
  paintWidth(item) {
    return textWidth(searchTextOf(item))
  },
  caret(item, cursor) {
    return { dy: 0, dx: textWidth(item.value.slice(0, cursor)) }
  },
  onLeftRight(item, direction, api) {
    const next = Math.max(0, Math.min(item.value.length, api.cursor + direction))
    if (next === api.cursor) return false
    api.setCursor(next)
    return true
  },
  render({ item, focused, cursor, width, y, x, clip }) {
    const isEmpty = item.value === ''
    const text = truncate(searchTextOf(item), width)
    if (clip !== 0) {
      return (
        <Box flexDirection="column">
          <Box height={1}>
            <Text> </Text>
          </Box>
        </Box>
      )
    }
    return (
      <Box flexDirection="column">
      <Box width={width} backgroundColor={colors.dialogInputBackground}>
        <SelectableText y={y} col={x} text={padToWidth(text, width)} color={isEmpty ? colors.dialogHintText : undefined} />
      </Box>
        <Box height={1}>
          <Text color={focused && cursor !== undefined ? caretNonceColor(cursor) : undefined}>{' '}</Text>
        </Box>
      </Box>
    )
  },
})
