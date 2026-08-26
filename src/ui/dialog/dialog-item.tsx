import { Box, Text } from 'ink'
import type { ReactNode } from 'react'
import { textWidth } from '../../core/text.ts'
import { actionPositions, CAROUSEL_BUTTON_WIDTH, selectBlock } from './geometry.ts'
import { widgetOf } from '../widgets/registry.ts'
import '../widgets/index.ts'
import type { DialogRow } from './items.ts'

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
  cursor?: number,
): ReactNode {
  let col = left + 1
  return (
    <Box flexDirection="row">
      {row.items.map((item, index) => {
        const def = widgetOf(item.type)
        const next = def.render({ item, focused, width: contentWidth, y: baseY, x: col, pressed, subCol, clip, cursor: focused ? cursor : undefined })
        col += def.paintWidth(item) + 1
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
