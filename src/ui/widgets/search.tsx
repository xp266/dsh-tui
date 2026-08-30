import { Box, Text } from 'ink'
import { COLORS } from '../../theme.ts'
import { caretScrollStart, padToWidth, textWidth, truncate } from '../../core/text.ts'
import { SelectableText } from '../selection.tsx'
import { caretNonceBold, caretNonceColor, caretNonceText } from '../../core/caret-nonce.ts'
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
  onLeftRight(item, direction, api) {
    const next = Math.max(0, Math.min(item.value.length, api.cursor + direction))
    if (next === api.cursor) return false
    api.setCursor(next)
    return true
  },
  render({ item, cursor, width, y, x, clip }) {
    const isEmpty = item.value === ''
    const start = caretScrollStart(item.value, cursor ?? item.value.length, width)
    const text = isEmpty ? 'Search' : truncate(item.value.slice(start), width)
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
      <Box width={width} backgroundColor={COLORS.dialogInputBackground}>
        <SelectableText y={y} col={x} text={padToWidth(text, width)} color={isEmpty ? COLORS.dialogHintText : undefined} />
      </Box>
        <Box height={1}>
          <Text
            color={cursor !== undefined ? caretNonceColor(cursor) : undefined}
            bold={cursor !== undefined ? caretNonceBold(cursor) : undefined}
          >
            {cursor !== undefined ? caretNonceText(cursor) : ' '}
          </Text>
        </Box>
      </Box>
    )
  },
})
