import type { Ref } from 'react'
import { errorLine, loadingLine } from './status-lines.ts'
import { useAsyncList } from '../hooks/use-async-list.ts'
import { Dialog } from './dialog.tsx'
import type { DialogFooterLine, DialogHandle, DialogItem, DialogRow } from './dialog.tsx'

export interface ListDialogProps<T> {
  ref?: Ref<DialogHandle>
  title: string
  width: number
  maxHeight: number
  load: () => Promise<T[]>
  search?: boolean
  searchRight?: boolean
  staticRows?: DialogRow[]
  rowsSuffix?: DialogRow[]
  labelOf(item: T): string
  rightOf?(item: T): string | undefined
  onSelect(item: T): void
  onCtrlD?(item: T): boolean
  onCtrlE?(item: T): boolean
  onClose(): void
  footerLines?: DialogFooterLine[]
}

export function ListDialog<T>({
  ref,
  title,
  width,
  maxHeight,
  load,
  search = false,
  searchRight = false,
  staticRows = [],
  rowsSuffix = [],
  labelOf,
  rightOf,
  onSelect,
  onCtrlD,
  onCtrlE,
  onClose,
  footerLines,
}: ListDialogProps<T>) {
  const { items, loading, error } = useAsyncList(load)
  const itemRefs = new Map<DialogItem, T>()
  const itemRows: DialogRow[] = items.map(item => {
    const button: DialogItem = { type: 'button', label: labelOf(item), right: rightOf?.(item), onPress: () => onSelect(item) }
    itemRefs.set(button, item)
    return { items: [button] }
  })
  const footer: DialogFooterLine[] = loading
    ? [loadingLine()]
    : error !== null
      ? [errorLine(error)]
      : footerLines ?? []
  const handleCtrlD = (focused: DialogItem | undefined): boolean => {
    if (onCtrlD === undefined || focused === undefined) return false
    const mapped = itemRefs.get(focused)
    return mapped === undefined ? false : onCtrlD(mapped)
  }
  const handleCtrlE = (focused: DialogItem | undefined): boolean => {
    if (onCtrlE === undefined || focused === undefined) return false
    const mapped = itemRefs.get(focused)
    return mapped === undefined ? false : onCtrlE(mapped)
  }
  return (
    <Dialog
      ref={ref}
      width={width}
      maxHeight={maxHeight}
      title={title}
      rows={[...staticRows, ...itemRows, ...rowsSuffix]}
      footer={footer}
      onClose={onClose}
      search={search}
      searchRight={searchRight}
      onCtrlD={handleCtrlD}
      onCtrlE={handleCtrlE}
    />
  )
}