import type { Ref } from 'react'
import { Dialog } from './dialog.tsx'
import type { DialogHandle, DialogRow } from './dialog.tsx'
import { todoSymbol } from '../../chat/todo-view.ts'
import type { TodoItemLike } from '../../chat/todo-view.ts'

export interface TodoDialogProps {
  ref?: Ref<DialogHandle>
  todos: readonly TodoItemLike[]
  onClose: () => void
}

const DIALOG_WIDTH = 56
const DIALOG_MAX_HEIGHT = 16

export function todoRows(todos: readonly TodoItemLike[]): DialogRow[] {
  return todos.map(item => ({ items: [{ type: 'static', label: `${todoSymbol(item.status)} ${item.content}` }] }))
}

export function TodoDialog({ ref, todos, onClose }: TodoDialogProps) {
  return (
    <Dialog
      ref={ref}
      title="todo"
      width={DIALOG_WIDTH}
      maxHeight={DIALOG_MAX_HEIGHT}
      rows={todoRows(todos)}
      onClose={onClose}
    />
  )
}
