import { Box, Text } from 'ink'
import type { ReactNode } from 'react'
import { colors } from '../../theme.ts'
import { padToWidth, textWidth, truncate, wrapLines } from '../../utils/text.ts'
import { SelectableText } from '../selection.tsx'
import { actionPositions, CAROUSEL_BUTTON_WIDTH, selectBlock } from './geometry.ts'
import type { DialogItem, DialogRow } from './items.ts'

export { actionPositions, CAROUSEL_BUTTON_WIDTH, selectBlock }

export function renderRow(
  row: DialogRow,
  focused: boolean,
  contentWidth: number,
  baseY: number,
  left: number,
  pressed: 'left' | 'right' | null = null,
  subCol = 0,
  clip = 0,
): ReactNode {
  let col = left + 1
  return (
    <Box flexDirection="row">
      {row.items.map((item, index) => {
        const next = renderItem(item, focused, contentWidth, baseY, col, pressed, subCol, clip)
        col += textWidth(itemText(item)) + 1
        return (
          <Box key={index} flexDirection="row">
            {index > 0 && <Text> </Text>}
            {next}
          </Box>
        )
      })}
    </Box>
  )
}

function itemText(item: DialogItem): string {
  switch (item.type) {
    case 'search':
      return item.value === '' ? 'Search' : item.value
    case 'input':
      return item.label
    case 'select':
      return item.label
    case 'button':
      return item.label + (item.right ?? '')
    case 'checkbox':
      return item.label
    case 'header':
      return item.label
    case 'actions':
      return ''
  }
}

function renderItem(
  item: DialogItem,
  focused: boolean,
  contentWidth: number,
  baseY: number,
  left: number,
  pressed: 'left' | 'right' | null,
  subCol = 0,
  clip = 0,
): ReactNode {
  switch (item.type) {
    case 'search': {
      const isEmpty = item.value === ''
      const text = isEmpty ? 'Search' : item.value
      return (
        <Box flexDirection="column">
          {clip === 0 && (
            <Box width={contentWidth} backgroundColor={colors.dialogInputBackground}>
              <SelectableText y={baseY} col={left} text={truncate(text, contentWidth)} color={isEmpty ? colors.dialogHintText : undefined} />
            </Box>
          )}
          <Box height={1}>
            <Text> </Text>
          </Box>
        </Box>
      )
    }
    case 'input': {
      const lines = wrapLines(item.value, contentWidth)
      const first = Math.min(Math.max(clip - 1, 0), lines.length)
      const parts: ReactNode[] = []
      let y = baseY
      if (clip === 0) {
        parts.push(
          <Box key="label" height={1}>
            <SelectableText y={y} col={left} text={item.label} />
          </Box>,
        )
        y += 1
      }
      for (let index = first; index < lines.length; index++) {
        const lineY = y
        parts.push(
          <Box key={index} width={contentWidth} height={1} backgroundColor={colors.dialogInputBackground}>
            <SelectableText y={lineY} col={left} text={lines[index]!} />
          </Box>,
        )
        y += 1
      }
      parts.push(
        <Box key="pad" height={1}>
          <Text> </Text>
        </Box>,
      )
      return <Box flexDirection="column">{parts}</Box>
    }
    case 'select': {
      const block = selectBlock(contentWidth, item.value)
      const hasArrows = item.options.length > 1
      const pad = hasArrows ? block.leftPad : block.fullLeftPad
      const inner = block.blockWidth - (hasArrows ? CAROUSEL_BUTTON_WIDTH * 2 : 0)
      const valueCol = left + block.blockStart + (hasArrows ? CAROUSEL_BUTTON_WIDTH : 0)
      const valueText = ' '.repeat(pad) + block.text + ' '.repeat(Math.max(0, inner - pad - textWidth(block.text)))
      const carousel = (
        <Box width={contentWidth} justifyContent="space-between">
          <SelectableText y={baseY} col={left} text={`${item.label}:`} />
          <Box width={block.blockWidth} flexDirection="row">
            {hasArrows && (
              <Text backgroundColor={pressed === 'left' ? colors.carouselButtonPressedBg : colors.carouselButtonBg}> ◀ </Text>
            )}
            <SelectableText y={baseY} col={valueCol} text={valueText} backgroundColor={colors.carouselCurrentBg} />
            {hasArrows && (
              <Text backgroundColor={pressed === 'right' ? colors.carouselButtonPressedBg : colors.carouselButtonBg}> ▶ </Text>
            )}
          </Box>
        </Box>
      )
      if (!item.spaced) return carousel
      return (
        <Box flexDirection="column">
          {clip === 0 && carousel}
          <Box height={1}>
            <Text> </Text>
          </Box>
        </Box>
      )
    }
    case 'button':
      if (item.right !== undefined) {
        const right = truncate(item.right, Math.floor(contentWidth / 2))
        const leftWidth = Math.max(1, contentWidth - textWidth(right))
        const label = padToWidth(truncate(item.label, leftWidth), leftWidth)
        if (focused) {
          return (
            <Box>
              <SelectableText y={baseY} col={left} text={label} inverse />
              <SelectableText y={baseY} col={left + leftWidth} text={right} inverse color={item.rightColor} />
            </Box>
          )
        }
        return (
          <Box width={contentWidth} justifyContent="space-between">
            <SelectableText y={baseY} col={left} text={item.label} />
            <SelectableText y={baseY} col={left + contentWidth - textWidth(right)} text={right} color={item.rightColor} />
          </Box>
        )
      }
      if (focused) return <SelectableText y={baseY} col={left} text={padToWidth(truncate(item.label, contentWidth), contentWidth)} inverse />
      return <SelectableText y={baseY} col={left} text={item.label} />
    case 'checkbox': {
      const label = padToWidth(truncate(item.label, contentWidth - 2), contentWidth - 2)
      if (focused) {
        return (
          <Box>
            <SelectableText y={baseY} col={left} text={label} inverse />
            {item.checked && (
              <SelectableText y={baseY} col={left + contentWidth - 2} text={' \u2713'} color={colors.success} inverse />
            )}
          </Box>
        )
      }
      return (
        <Box>
          <SelectableText y={baseY} col={left} text={label} />
          {item.checked && (
            <SelectableText y={baseY} col={left + contentWidth - 2} text={' \u2713'} color={colors.success} />
          )}
        </Box>
      )
    }
    case 'header': {
      const lead = item.leadingBlank === true && clip === 0 ? 1 : 0
      const label = (
        <SelectableText y={baseY + lead} col={left} text={item.label} color={colors.sectionHeader} bold />
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
    }
    case 'actions': {
      const positions = actionPositions(contentWidth, item.confirmLabel, item.cancelLabel)
      const mid = positions.cancelX - (positions.confirmX + textWidth(item.confirmLabel))
      return (
        <Box flexDirection="row">
          <Text>{' '.repeat(positions.confirmX)}</Text>
          <SelectableText
            y={baseY}
            col={left + positions.confirmX}
            text={item.confirmLabel}
            inverse={focused && subCol === 0}
          />
          <Text>{' '.repeat(Math.max(0, mid))}</Text>
          <SelectableText
            y={baseY}
            col={left + positions.cancelX}
            text={item.cancelLabel}
            inverse={focused && subCol === 1}
          />
        </Box>
      )
    }
  }
}
