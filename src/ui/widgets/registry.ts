import { createElement } from 'react'
import { Text } from 'ink'
import { keyedRegistry } from '../../kernel/registry.ts'
import type { DialogItem } from '../dialog/items.ts'
import type { WidgetDef } from '../../contract/index.ts'

type AnyWidgetDef = WidgetDef<DialogItem>

const widgets = keyedRegistry<AnyWidgetDef>()

function fallbackWidget(type: string): AnyWidgetDef {
  return {
    height: () => 1,
    paintWidth: () => 24,
    render: ({ item }: { item: DialogItem }) => {
      const label = (item as { label?: unknown }).label
      const text = typeof label === 'string' && label !== '' ? `${type}: ${label}` : `${type}: (unknown item)`
      return createElement(Text, { dimColor: true }, text)
    },
  } as unknown as AnyWidgetDef
}

export function registerWidget<I extends { type: string }>(type: I['type'], def: WidgetDef<I>, options?: { order?: number }): () => void {
  return widgets.register(type, def as unknown as AnyWidgetDef, options)
}

/** Builtin widgets register as high-order fallback layers; plugin widgets override by default. */
export const BUILTIN_WIDGET_ORDER = 500

export function widgetOf(type: DialogItem['type']): AnyWidgetDef {
  return widgets.get(type) ?? fallbackWidget(type)
}
