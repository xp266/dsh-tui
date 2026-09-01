/**
 * Native dialog stack for plugin windows. Importing from `dsh-tui/dialog`
 * renders a window with the exact builtin look and behavior: frame, title,
 * search, focus navigation, widget interaction, mouse click/wheel, and the
 * close guard — all theme-aware.
 */
export { Dialog, CloseGuardContext } from './ui/dialog/dialog.tsx'
export type { DialogProps, DialogHandle } from './ui/dialog/dialog.tsx'
export type { DialogRow, DialogItem, DialogFocus, TextItem } from './ui/dialog/items.ts'
export { asTextItem } from './ui/dialog/items.ts'
export type { DialogFooterLine } from './ui/dialog/geometry.ts'
export { rowHeight, wrapStatusLines } from './ui/dialog/geometry.ts'
export { registerWidget } from './ui/widgets/registry.ts'
