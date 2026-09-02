import { registerToolView } from './tool-views.ts'
import { ASK_USER_TOOL_NAME, formatAskQuestions } from './question-view.ts'
import { TODO_TOOL_NAME, formatTodoBubble, parseTodoArgs } from './todo-view.ts'

/**
 * The interactive builtins ride the same contribution registry third-party
 * plugins use: keyed by tool name, `takeover` keeps the protocol presenter
 * out, and the echoed result payload is dropped because the outcome reaches
 * the user through the interaction panel and the checklist instead.
 *
 * Registration is a module-level singleton: the views are static, and a
 * second registration would only churn every subscribed surface.
 */
let registered: (() => void) | undefined

export function registerBuiltinToolViews(): () => void {
  if (registered !== undefined) return registered
  const offTodo = registerToolView({
    tool: TODO_TOOL_NAME,
    takeover: true,
    call: ({ tool, args }) => {
      const items = parseTodoArgs(args)
      return { label: tool, body: items.length === 0 ? '' : formatTodoBubble(items) }
    },
  })
  const offAsk = registerToolView({
    tool: ASK_USER_TOOL_NAME,
    takeover: true,
    call: ({ tool, args }) => ({ label: tool, body: formatAskQuestions(args) }),
  })
  registered = () => {
    offTodo()
    offAsk()
    registered = undefined
  }
  return registered
}
