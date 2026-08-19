import { Box, Text } from 'ink'
import type { ReactNode } from 'react'
import { colors } from '../../theme.ts'
import { padToWidth, textWidth, truncate } from '../../utils/text.ts'
import { HighlightedText } from '../selection.tsx'
import type { DialogItem, DialogRow } from './dialog.tsx'

export const CAROUSEL_BUTTON_WIDTH = 3

export interface SelectBlock {
  blockWidth: number
  blockStart: number
  text: string
  leftPad: number
  fullLeftPad: number
  cursorX: number
}

export function selectBlock(contentWidth: number, value: string): SelectBlock {
  const blockWidth = Math.max(3, Math.floor(contentWidth * 0.6))
  const innerWidth = Math.max(1, blockWidth - CAROUSEL_BUTTON_WIDTH * 2)
  const text = truncate(value || '(none)', innerWidth)
  const padding = innerWidth - textWidth(text)
  const fullPadding = blockWidth - textWidth(text)
  return {
    blockWidth,
    blockStart: contentWidth - blockWidth,
    text,
    leftPad: Math.floor(padding / 2),
    fullLeftPad: Math.floor(fullPadding / 2),
    cursorX: CAROUSEL_BUTTON_WIDTH + Math.floor(padding / 2) + textWidth(text),
  }
}

export function renderRow(
  row: DialogRow,
  focused: boolean,
  contentWidth: number,
  baseY: number,
  left: number,
  pressed: 'left' | 'right' | null = null,
): ReactNode {
  let col = left + 1
  return (
    <Box flexDirection="row">
      {row.items.map((item, index) => {
        const next = renderItem(item, focused, contentWidth, baseY, col, pressed)
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
  }
}

function renderItem(
  item: DialogItem,
  focused: boolean,
  contentWidth: number,
  baseY: number,
  left: number,
  pressed: 'left' | 'right' | null,
): ReactNode {
  switch (item.type) {
    case 'search': {
      const isEmpty = item.value === ''
      const text = isEmpty ? 'Search' : item.value
      return (
        <Box flexDirection="column">
          <Box width={contentWidth} backgroundColor={colors.userBubbleBackground}>
            <HighlightedText y={baseY} col={left} text={truncate(text, contentWidth)} color={isEmpty ? colors.toolBodyText : undefined} />
          </Box>
          <Box height={1}>
            <Text> </Text>
          </Box>
        </Box>
      )
    }
    case 'input':
      return (
        <Box flexDirection="column">
          <Box height={1}>
            <HighlightedText y={baseY} col={left} text={item.label} />
          </Box>
          <Box width={contentWidth} height={1} backgroundColor={colors.userBubbleBackground}>
            <HighlightedText y={baseY + 1} col={left} text={truncate(item.value, contentWidth)} />
          </Box>
          <Box height={1}>
            <Text> </Text>
          </Box>
        </Box>
      )
    case 'select': {
      const block = selectBlock(contentWidth, item.value)
      const hasArrows = item.options.length > 1
      const pad = hasArrows ? block.leftPad : block.fullLeftPad
      const inner = block.blockWidth - (hasArrows ? CAROUSEL_BUTTON_WIDTH * 2 : 0)
      const carousel = (
        <Box width={contentWidth} justifyContent="space-between">
          <HighlightedText y={baseY} col={left} text={`${item.label}:`} />
          <Box width={block.blockWidth} flexDirection="row">
            {hasArrows && (
              <Text backgroundColor={pressed === 'left' ? colors.carouselButtonPressedBg : colors.carouselButtonBg}> ◀ </Text>
            )}
            <Text backgroundColor={colors.carouselCurrentBg}>
              {' '.repeat(pad)}
              {block.text}
              {' '.repeat(inner - pad - textWidth(block.text))}
            </Text>
            {hasArrows && (
              <Text backgroundColor={pressed === 'right' ? colors.carouselButtonPressedBg : colors.carouselButtonBg}> ▶ </Text>
            )}
          </Box>
        </Box>
      )
      if (!item.spaced) return carousel
      return (
        <Box flexDirection="column">
          {carousel}
          <Box height={1}>
            <Text> </Text>
          </Box>
        </Box>
      )
    }
    case 'button':
      if (item.right !== undefined) {
        if (focused) {
          const right = truncate(item.right, Math.floor(contentWidth / 2))
          const leftWidth = Math.max(1, contentWidth - textWidth(right))
          return <HighlightedText y={baseY} col={left} text={padToWidth(truncate(item.label, leftWidth), leftWidth) + right} inverse />
        }
        const right = item.right
        return (
          <Box width={contentWidth} justifyContent="space-between">
            <HighlightedText y={baseY} col={left} text={item.label} />
            <HighlightedText y={baseY} col={left + contentWidth - textWidth(right)} text={right} />
          </Box>
        )
      }
      if (focused) return <HighlightedText y={baseY} col={left} text={padToWidth(truncate(item.label, contentWidth), contentWidth)} inverse />
      return <HighlightedText y={baseY} col={left} text={item.label} />
    case 'checkbox':
      if (focused) {
        return (
          <Box>
            <HighlightedText y={baseY} col={left} text={padToWidth(truncate(item.label, contentWidth - 2), contentWidth - 2)} inverse />
            {item.checked && (
              <HighlightedText y={baseY} col={left + contentWidth - 2} text={' \u2713'} color={colors.success} inverse />
            )}
          </Box>
        )
      }
      return (
        <Box>
          <HighlightedText y={baseY} col={left} text={item.label} />
          {item.checked && <HighlightedText y={baseY} col={left + textWidth(item.label)} text={' \u2713'} color={colors.success} />}
        </Box>
      )
  }
}