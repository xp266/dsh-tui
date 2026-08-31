import { Box } from 'ink'
import { COLORS } from '../../theme.ts'
import { textWidth, wrapLines } from '../../core/text.ts'
import { SelectableText } from '../selection.tsx'
import { BUILTIN_WIDGET_ORDER, registerWidget } from './registry.ts'
import type { DialogItem } from '../dialog/items.ts'

type StaticItem = Extract<DialogItem, { type: 'static' }>

registerWidget<StaticItem>('static', {
  selectable: false,
  height(item, width) {
    return Math.max(1, wrapLines(item.label, Math.max(4, width)).length)
  },
  paintWidth(item) {
    return textWidth(item.label)
  },
  render({ item, width, y, x }) {
    const lines = item.label === '' ? [''] : wrapLines(item.label, Math.max(4, width))
    if (lines.length === 1) {
      return <SelectableText y={y} col={x} text={item.label === '' ? ' ' : item.label} color={item.label === '' ? undefined : COLORS.toolBodyText} />
    }
    return (
      <Box flexDirection="column">
        {lines.map((line, index) => (
          <SelectableText
            key={index}
            y={y + index}
            col={x}
            text={line === '' ? ' ' : line}
            color={line === '' ? undefined : COLORS.toolBodyText}
          />
        ))}
      </Box>
    )
  },
}, { order: BUILTIN_WIDGET_ORDER })
