import { TodoDialog } from '../dialog/todo-dialog.tsx'
import { useWindowService } from '../window-services.ts'
import type { WindowProps } from '../windows.ts'
import type { TodoItemLike } from '../../chat/todo-view.ts'

export function TodoWindow(props: WindowProps) {
  const todos = useWindowService<readonly TodoItemLike[]>('todos')
  if (todos === undefined) return null
  return <TodoDialog todos={todos} {...props} />
}
