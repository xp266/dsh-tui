import { Box, Text } from 'ink'
import { colors } from '../../theme.ts'
import { selectBlock, CAROUSEL_BUTTON_WIDTH } from '../dialog/geometry.ts'
import { textWidth } from '../../core/text.ts'
import { SelectableText } from '../selection.tsx'
import { registerWidget } from './registry.ts'
import type { PaintArgs, ClickHit, ClickActions, WidgetKeyApi } from './types.ts'
import type { DialogItem } from '../dialog/items.ts'

type SelectItem = Extract<DialogItem, { type: 'select' }>

export function carouselHit(item: SelectItem, width: number, localX: number): -1 | 1 | null {
  if (item.options.length <= 1) return null
  const block = selectBlock(width, item.value)
  if (localX >= block.blockStart && localX < block.blockStart + CAROUSEL_BUTTON_WIDTH) return -1
  if (localX >= block.blockStart + block.blockWidth - CAROUSEL_BUTTON_WIDTH && localX < block.blockStart + block.blockWidth) return 1
  return null
}

function paintSelect(paint: PaintArgs<SelectItem>) {
  const { item, width, y, x } = paint
  const block = selectBlock(width, item.value)
  const hasArrows = item.options.length > 1
  const pad = hasArrows ? block.leftPad : block.fullLeftPad
  const inner = block.blockWidth - (hasArrows ? CAROUSEL_BUTTON_WIDTH * 2 : 0)
  const valueCol = x + block.blockStart + (hasArrows ? CAROUSEL_BUTTON_WIDTH : 0)
  const valueText = ' '.repeat(pad) + block.text + ' '.repeat(Math.max(0, inner - pad - textWidth(block.text)))
  const carousel = (
    <Box width={width} justifyContent="space-between">
      <SelectableText y={y} col={x} text={`${item.label}:`} />
      <Box width={block.blockWidth} flexDirection="row">
        {hasArrows && (
          <Text backgroundColor={paint.pressed === 'left' ? colors.carouselButtonPressedBg : colors.carouselButtonBg}> ◀ </Text>
        )}
        <SelectableText
          y={y}
          col={valueCol}
          text={valueText}
          color={paint.focused ? colors.carouselSelectedText : undefined}
          backgroundColor={colors.carouselCurrentBg}
        />
        {hasArrows && (
          <Text backgroundColor={paint.pressed === 'right' ? colors.carouselButtonPressedBg : colors.carouselButtonBg}> ▶ </Text>
        )}
      </Box>
    </Box>
  )
  if (!item.spaced) return carousel
  return (
    <Box flexDirection="column">
      {paint.clip === 0 && carousel}
      <Box height={1}>
        <Text> </Text>
      </Box>
    </Box>
  )
}

function cycle(item: SelectItem, direction: -1 | 1): void {
  const index = Math.max(0, item.options.indexOf(item.value))
  const length = item.options.length
  const next = item.options[(index + direction + length) % length]
  if (next !== undefined) item.onChange(next)
}

registerWidget<SelectItem>('select', {
  selectable: true,
  height(item) {
    return item.spaced === true ? 2 : 1
  },
  paintWidth(item) {
    return textWidth(item.label)
  },
  render: paintSelect,
  onLeftRight(item, direction) {
    if (item.options.length <= 1) return false
    cycle(item, direction)
    return true
  },
  onEnter(item, api) {
    if (item.onEnter !== undefined) {
      item.onEnter()
      return true
    }
    api.navigate('down')
    return true
  },
  onClick(item, hit: ClickHit, actions: ClickActions) {
    if (hit.localY !== 0) return false
    const direction = carouselHit(item, hit.width, hit.localX)
    if (direction === null) return false
    cycle(item, direction)
    actions.flash(direction === -1 ? 'left' : 'right')
    return true
  },
})
