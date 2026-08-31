import { keyedRegistry } from '../../kernel/registry.ts'
import type { DialogItem } from '../dialog/items.ts'
import type { WidgetDef } from '../../contract/index.ts'

type AnyWidgetDef = WidgetDef<DialogItem>

const widgets = keyedRegistry<AnyWidgetDef>()

export function registerWidget<I extends { type: string }>(type: I['type'], def: WidgetDef<I>): () => void {
  return widgets.register(type, def as unknown as AnyWidgetDef)
}

export function widgetOf(type: DialogItem['type']): AnyWidgetDef {
  const def = widgets.get(type)
  if (def === undefined) {
    throw new Error(`No widget registered for item type: ${type}`)
  }
  return def
}
