import { registerToolView } from './tool-views.ts'
import { ASK_USER_TOOL_NAME, formatAskAnswered, formatAskQuestions, parseAskAnswers, parseAskQuestions } from './question-view.ts'
import { TODO_TOOL_NAME, formatTodoBubble, parseTodoArgs } from './todo-view.ts'

/**
 * The interactive builtins ride the same contribution registry third-party
 * plugins use: keyed by tool name, `takeover` keeps the protocol presenter
 * out. The call renders the pending interaction; the ask result rewrites the
 * card into question-plus-choice so the settled record shows what was picked,
 * not the offer again. The todo checklist already IS the settled state (the
 * call args carry the new list), so its result stays a wipe.
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
    result: ({ result, args }) => {
      const answers = parseAskAnswers(resultTextOf(result))
      if (answers.length === 0) return { kind: 'replace', text: '' }
      return {
        kind: 'replace',
        text: formatAskAnswered(parseAskQuestions(args), answers),
        argsBody: '',
      }
    },
  })
  registered = () => {
    offTodo()
    offAsk()
    registered = undefined
  }
  return registered
}

function resultTextOf(result: { content: readonly { type: string; text?: string }[] }): string {
  let text = ''
  for (const block of result.content) {
    if (block.type === 'text') text += block.text ?? ''
  }
  return text
}
