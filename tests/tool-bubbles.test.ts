import { describe, expect, it } from 'vitest'
import type { SessionEvent } from '@deepseek-ai/dsh-session'
import type { ContentBlock } from '@deepseek-ai/dsh-llm'
import { initialTurnState, reduceChatEvent } from '../src/chat/store.ts'
import type { ToolCardMessage } from '../src/model/message.ts'
import {
  createBuiltinToolPresenter,
  type BuiltinToolPresenterDeps,
  type CallViewLike,
  type ResultViewLike,
  type ToolResultLike,
} from '../src/chat/bridge.ts'
import { ToolCallLedger, createToolViewPresenter, registerToolView, toolViewOf } from '../src/chat/tool-views.ts'
import { registerBuiltinToolViews } from '../src/chat/builtin-tool-views.ts'

const CWD = '/home/u/project'

function presenterWith(views: Record<string, { call?: CallViewLike; result?: ResultViewLike }>): { presenter: ReturnType<typeof createBuiltinToolPresenter>; ledger: ToolCallLedger } {
  const ledger = new ToolCallLedger()
  const deps: BuiltinToolPresenterDeps = {
    ledger,
    presentCall: (tool, args) => views[tool]?.call,
    presentResult: (tool, args, result) => views[tool]?.result as ResultViewLike | undefined,
    cwd: () => CWD,
  }
  return { presenter: createBuiltinToolPresenter(deps), ledger }
}

function result(content: ContentBlock[], isError = false): ToolResultLike {
  return { content, isError }
}

describe('builtin presenter: call views', () => {
  it('shows an explicit workdir as a prompt prefix and omits the session default', () => {
    const { presenter, ledger } = presenterWith({ bash: { call: { card: 'terminal', title: 'pnpm build', cwd: 'src' } } })
    ledger.remember('bash', 'c1', '{}')
    expect(presenter.call('bash', 'c1', '{}')).toMatchObject({ body: 'src $ pnpm build' })
    ledger.remember('bash', 'c2', '{}')
    const plain = presenterWith({ bash: { call: { card: 'terminal', title: 'pnpm build' } } })
    plain.ledger.remember('bash', 'c2', '{}')
    expect(plain.presenter.call('bash', 'c2', '{}')).toMatchObject({ body: 'pnpm build' })
  })

  it('carries rawInput and content blocks as the generic call body', () => {
    const { presenter, ledger } = presenterWith({
      run_code: { call: { card: 'generic', title: 'Search the codebase', rawInput: 'grep("x")' } },
    })
    ledger.remember('run_code', 'c1', '{"description":"Search the codebase","code":"grep(\\"x\\")"}')
    expect(presenter.call('run_code', 'c1', '{"code":"grep(\\"x\\")"}')).toMatchObject({ label: 'run_code Search the codebase', body: 'grep("x")' })
  })

  it('summarizes multiple diff files in the header', () => {
    const { presenter, ledger } = presenterWith({
      edit: { call: { card: 'diff', title: 'Edit a.ts', diffs: [{ path: `${CWD}/a.ts`, oldText: 'a', newText: 'b' }, { path: `${CWD}/b.ts`, oldText: null, newText: 'c' }] } },
    })
    ledger.remember('edit', 'c1', '{}')
    const view = presenter.call('edit', 'c1', '{}')
    expect(view?.label).toBe('edit a.ts (+1)')
    expect(view?.diff?.hunks).toHaveLength(2)
  })
})

describe('builtin presenter: result views', () => {
  it('projects a read result into a structured read with totals', () => {
    const { presenter, ledger } = presenterWith({
      read: { result: { card: 'read', path: `${CWD}/src/main.ts`, offset: 40, lines: [{ number: 40, text: 'const x = 1' }], totalLines: 120, lang: 'ts' } },
    })
    ledger.remember('read', 'c1', '{}')
    const view = presenter.result('c1', result([]))
    expect(view).toMatchObject({
      kind: 'replace',
      read: { path: 'src/main.ts', totalLines: 120, lang: 'ts', lines: [{ number: 40, text: 'const x = 1' }] },
    })
  })

  it('keeps the truncated search recovery footer from the raw result text', () => {
    const { presenter, ledger } = presenterWith({
      grep: { result: { card: 'search', shape: 'paths', paths: ['a.ts'], truncated: true, total: 900 } },
    })
    ledger.remember('grep', 'c1', '{}')
    const view = presenter.result('c1', result([{ type: 'text', text: 'a.ts\nFull grep result stored at: /tmp/spill. Use the read tool.' }]))
    expect(view?.kind).toBe('replace')
    expect(view?.text).toContain('... 900 total')
    expect(view?.text).toContain('Full grep result stored at: /tmp/spill.')
  })

  it('shows web search snippets and publication dates', () => {
    const { presenter, ledger } = presenterWith({
      web_search: {
        result: {
          card: 'web',
          kind: 'search',
          sources: [{ url: 'https://example.com', title: 'Example', snippet: 'A short excerpt', publishedAt: '2026-08-30T00:00:00Z' }],
          truncated: false,
        },
      },
    })
    ledger.remember('web_search', 'c1', '{}')
    const view = presenter.result('c1', result([]))
    expect(view?.text).toContain('- Example · https://example.com (2026-08-30)')
    expect(view?.text).toContain('  A short excerpt')
  })

  it('replaces the card label with the settled result title', () => {
    const { presenter, ledger } = presenterWith({
      exit_plan_mode: { result: { card: 'generic', title: 'Plan review', content: [{ type: 'text', text: 'approved' }] } },
    })
    ledger.remember('exit_plan_mode', 'c1', '{}')
    const view = presenter.result('c1', result([]))
    expect(view).toMatchObject({ label: 'exit_plan_mode Plan review', text: 'approved' })
  })
})

describe('builtin tool view contributions', () => {
  it('renders the todo bubble and drops the echoed result', () => {
    const off = registerBuiltinToolViews()
    const ledger = new ToolCallLedger()
    const inner = {
      call: () => {
        throw new Error('builtin must not run')
      },
      result: () => {
        throw new Error('builtin must not run')
      },
      argsJson: () => undefined,
    }
    const presenter = createToolViewPresenter(inner, { resolve: toolViewOf, cwd: () => CWD, ledger })
    const call = presenter.call('todo_write', 'c1', '{"todos":[{"content":"ship it","status":"in_progress"}]}')
    expect(call?.body).toContain('ship it')
    expect(presenter.result('c1', { content: [], isError: false })).toEqual({ kind: 'replace', text: '' })
    expect(presenter.argsJson('c1')).toContain('ship it')
    off()
  })
})

describe('code dispatch sub-calls', () => {
  const dispatchStart = (payload: Record<string, unknown>): SessionEvent =>
    ({ type: 'tool/code-dispatch-start', seq: 1, time: 0, data: payload }) as unknown as SessionEvent
  const dispatch = (payload: Record<string, unknown>): SessionEvent =>
    ({ type: 'tool/code-dispatch', seq: 2, time: 1, data: payload }) as unknown as SessionEvent

  function runToolCall(messages: ReturnType<typeof Array>): { messages: ToolCardMessage[]; turn: ReturnType<typeof initialTurnState> } {
    const turn = initialTurnState()
    const event = { type: 'tool/call', seq: 0, time: 0, data: { callId: 'root', name: 'run_code', arguments: '{}' } } as unknown as SessionEvent
    const next = reduceChatEvent(messages as never, event, turn, undefined)
    return { messages: next.messages as ToolCardMessage[], turn: next.turn }
  }

  it('nests the settled sub-call under the root card', () => {
    const { messages, turn } = runToolCall([])
    const next = reduceChatEvent(messages, dispatchStart({ rootCallId: 'root', parentCallId: 'root', subCallId: 'root:code:1', name: 'read', arguments: { file_path: 'a.ts' } }), turn, undefined)
    const settled = reduceChatEvent(next.messages, dispatch({ rootCallId: 'root', parentCallId: 'root', subCallId: 'root:code:1', name: 'read', arguments: {}, isError: false, content: [{ type: 'text', text: 'file body' }] }), next.turn, undefined)
    const root = settled.messages[0]
    expect(root?.kind).toBe('tool-card')
    if (root?.kind === 'tool-card') {
      expect(root.nested).toHaveLength(1)
      const child = root.nested![0]!
      expect(child).toMatchObject({ tool: 'read', label: 'read', running: false, resultBody: 'file body' })
    }
  })

  it('marks a failed sub-call', () => {
    const { messages, turn } = runToolCall([])
    const next = reduceChatEvent(messages, dispatchStart({ rootCallId: 'root', parentCallId: 'root', subCallId: 'root:code:1', name: 'bash', arguments: {} }), turn, undefined)
    const settled = reduceChatEvent(next.messages, dispatch({ rootCallId: 'root', parentCallId: 'root', subCallId: 'root:code:1', name: 'bash', arguments: {}, isError: true, content: [] }), next.turn, undefined)
    const root = settled.messages[0]
    if (root?.kind === 'tool-card') {
      expect(root.nested![0]!.failed).toBe(true)
    }
  })
})
