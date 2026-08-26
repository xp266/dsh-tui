import type { ReactNode } from 'react'
import type { DialogItem } from '../dialog/items.ts'

export interface PaintArgs<I extends DialogItem> {
  item: I
  focused: boolean
  subCol: number
  cursor?: number
  width: number
  y: number
  x: number
  pressed: 'left' | 'right' | null
  clip: number
}

export interface ClickHit {
  localX: number
  localY: number
  width: number
}

export interface ClickActions {
  focus(subCol: number): void
  flash(side: 'left' | 'right'): void
}

export interface WidgetKeyApi {
  cursor: number
  subCol: number
  setCursor(next: number): void
  navigate(direction: 'up' | 'down' | 'left' | 'right'): void
}

export interface WidgetDef<I extends DialogItem> {
  height(item: I, width: number): number
  paintWidth(item: I): number
  render(paint: PaintArgs<I>): ReactNode
  searchTexts?(item: I, searchRight: boolean): string[]
  stops?(item: I): number
  fullRowFocus?: boolean
  selectable?: boolean
  editable?: boolean
  caret?(item: I, cursor: number, width: number): { dy: number; dx: number }
  onLeftRight?(item: I, direction: -1 | 1, api: WidgetKeyApi): boolean
  onEnter?(item: I, api: WidgetKeyApi): boolean
  onSpace?(item: I): void
  onClick?(item: I, hit: ClickHit, actions: ClickActions): boolean
  activate?(item: I): void
}
