import { Box, Text } from 'ink'
import { actionPositions } from '../dialog/geometry.ts'
import { textWidth } from '../../core/text.ts'
import { SelectableText } from '../selection.tsx'
import { registerWidget } from './registry.ts'
import type { ClickHit, ClickActions } from './types.ts'
import type { DialogItem } from '../dialog/items.ts'

type ActionsItem = Extract<DialogItem, { type: 'actions' }>

export function hitActionZone(item: ActionsItem, width: number, localX: number): 'confirm' | 'cancel' | null {
  const positions = actionPositions(width, item.confirmLabel, item.cancelLabel)
  if (localX >= positions.confirmX && localX < positions.confirmX + textWidth(item.confirmLabel)) return 'confirm'
  if (localX >= positions.cancelX && localX < positions.cancelX + textWidth(item.cancelLabel)) return 'cancel'
  return null
}

registerWidget<ActionsItem>('actions', {
  selectable: true,
  fullRowFocus: true,
  stops: () => 2,
  height() {
    return 1
  },
  paintWidth() {
    return 0
  },
  render({ item, focused, width, y, x, subCol }) {
    const positions = actionPositions(width, item.confirmLabel, item.cancelLabel)
    const mid = positions.cancelX - (positions.confirmX + textWidth(item.confirmLabel))
    return (
      <Box flexDirection="row">
        <Text>{' '.repeat(positions.confirmX)}</Text>
        <SelectableText
          y={y}
          col={x + positions.confirmX}
          text={item.confirmLabel}
          inverse={focused && subCol === 0}
        />
        <Text>{' '.repeat(Math.max(0, mid))}</Text>
        <SelectableText
          y={y}
          col={x + positions.cancelX}
          text={item.cancelLabel}
          inverse={focused && subCol === 1}
        />
      </Box>
    )
  },
  onLeftRight(item, direction, api) {
    api.navigate(direction === 1 ? 'right' : 'left')
    return true
  },
  onEnter(item, api) {
    if (api.subCol === 1) item.onCancel()
    else item.onConfirm()
    return true
  },
  onClick(item, hit: ClickHit, actions: ClickActions) {
    if (hit.localY !== 0) {
      actions.focus(0)
      return true
    }
    const zone = hitActionZone(item, hit.width, hit.localX)
    if (zone === 'confirm') {
      actions.focus(0)
      item.onConfirm()
      return true
    }
    if (zone === 'cancel') {
      actions.focus(1)
      item.onCancel()
      return true
    }
    actions.focus(0)
    return true
  },
})
