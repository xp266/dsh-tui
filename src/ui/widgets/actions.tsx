import { Box, Text } from 'ink'
import { actionPositions } from '../dialog/geometry.ts'
import { textWidth } from '../../core/text.ts'
import { SelectableText } from '../selection.tsx'
import { BUILTIN_WIDGET_ORDER, registerWidget } from './registry.ts'
import type { ClickHit, ClickActions } from './types.ts'
import type { DialogItem } from '../dialog/items.ts'

type ActionsItem = Extract<DialogItem, { type: 'actions' }>

function paddedLabel(label: string): string {
  return ` ${label} `
}

export function hitActionZone(item: ActionsItem, width: number, localX: number): 'confirm' | 'cancel' | null {
  const positions = actionPositions(width, paddedLabel(item.confirmLabel), paddedLabel(item.cancelLabel))
  if (localX >= positions.confirmX && localX < positions.confirmX + textWidth(paddedLabel(item.confirmLabel))) return 'confirm'
  if (localX >= positions.cancelX && localX < positions.cancelX + textWidth(paddedLabel(item.cancelLabel))) return 'cancel'
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
    const confirmLabel = paddedLabel(item.confirmLabel)
    const cancelLabel = paddedLabel(item.cancelLabel)
    const positions = actionPositions(width, confirmLabel, cancelLabel)
    const mid = positions.cancelX - (positions.confirmX + textWidth(confirmLabel))
    return (
      <Box flexDirection="row">
        <Text>{' '.repeat(positions.confirmX)}</Text>
        <SelectableText
          y={y}
          col={x + positions.confirmX}
          text={confirmLabel}
          inverse={focused && subCol === 0}
        />
        <Text>{' '.repeat(Math.max(0, mid))}</Text>
        <SelectableText
          y={y}
          col={x + positions.cancelX}
          text={cancelLabel}
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
}, { order: BUILTIN_WIDGET_ORDER })
