import type { DialogItem } from '../dialog/items.ts'
import type { WidgetDef } from './types.ts'

type AnyWidgetDef = WidgetDef<DialogItem>

const registry = new Map<string, AnyWidgetDef>()

export function registerWidget<I extends DialogItem>(type: I['type'], def: WidgetDef<I>): void {
  registry.set(type, def as unknown as AnyWidgetDef)
}

export function widgetOf(type: DialogItem['type']): AnyWidgetDef {
  const def = registry.get(type)
  if (def === undefined) {
    throw new Error(`No widget registered for item type: ${type}`)
  }
  return def
}
