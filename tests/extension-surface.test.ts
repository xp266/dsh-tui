import { describe, expect, it } from 'vitest'
import type { SessionEvent } from '@deepseek-ai/dsh-session'
import { initialTurnState, reduceChatEvent } from '../src/chat/store.ts'
import { createToolViewPresenter, registerToolView, toolViewOf } from '../src/chat/tool-views.ts'
import { registerChatNode } from '../src/chat/chat-nodes.ts'
import type { ChatNodeDefinition, CustomMessage, TuiKey, ToolViewContribution } from '../src/contract/index.ts'
import type { ChatToolPresenter } from '../src/chat/bridge.ts'
import { registerMessageView } from '../src/ui/message/message-views.ts'
import { buildRowIndex } from '../src/ui/message/layout.ts'
import { COMMANDS, commandArgHints, matchCommand, registerCommand } from '../src/ui/input/commands.ts'
import { registerWidget, widgetOf } from '../src/ui/widgets/registry.ts'
import { registerKeyBinding, handleKeyContributions } from '../src/ui/keymap.ts'
import { registerPalette, COLORS } from '../src/theme.ts'
import { closeBootLog, emitBootLine, openBootLog } from '../src/boot-log.ts'
import { createTuiExtensionPoint, exposeRuntimeFaces } from '../src/ui/extension-point.ts'
import { InteractionStore } from '../src/chat/interactions.ts'
import type { ChatBridge } from '../src/chat/bridge.ts'
import { createTestContext } from './harness.ts'
import type { Message } from '../src/model/message.ts'

function pluginEvent(type: string, payload: unknown): SessionEvent {
  return { type, seq: 1, time: 0, data: payload } as unknown as SessionEvent
}

describe('tool view contributions', () => {
  it('registers and disposes keyed by tool name', () => {
    const off = registerToolView({ tool: 'ext-tool', call: () => ({ label: 'L' }) })
    expect(toolViewOf('ext-tool')?.tool).toBe('ext-tool')
    off()
    expect(toolViewOf('ext-tool')).toBeUndefined()
  })

  it('overrides the harness presentation for call and result', () => {
    const contribution: ToolViewContribution = {
      tool: 'ext-tool',
      call: ({ args }) => ({ label: `ext[${String((args as { path?: string }).path ?? '')}]`, body: 'args' }),
      result: () => ({ kind: 'replace', text: 'replaced' }),
    }
    const off = registerToolView(contribution)
    const calls: string[] = []
    const inner: ChatToolPresenter = {
      call: name => {
        calls.push(name)
        return { label: `${name}[harness]`, body: 'harness' }
      },
      result: () => {
        calls.push('result')
        return { kind: 'append', text: 'harness' }
      },
      argsJson: () => '{}',
    }
    const presenter = createToolViewPresenter(inner, { resolve: toolViewOf, cwd: () => '/cwd' })
    const call = presenter.call('ext-tool', 'c1', '{"path":"a.ts"}')
    expect(call).toEqual({ label: 'ext[a.ts]', body: 'args' })
    expect(presenter.result('c1', { content: [], isError: false })).toEqual({ kind: 'replace', text: 'replaced' })
    expect(calls).toEqual([])
    const fallthrough = presenter.call('other-tool', 'c2', '{}')
    expect(fallthrough?.label).toBe('other-tool[harness]')
    expect(calls).toEqual(['other-tool'])
    expect(presenter.argsJson('c2')).toBe('{}')
    off()
    expect(toolViewOf('ext-tool')).toBeUndefined()
  })
})

describe('chat node contributions', () => {
  it('claims events, updates, and removes the custom message', () => {
    const definition: ChatNodeDefinition = {
      id: 'test-node',
      match: event => (event as { type: string }).type === 'plugin/card',
      start: () => ({ view: 'test-card', data: { text: 'started' } }),
      update: (event, message) => {
        const text = (event as { data: { text?: string } }).data?.text
        if (text === 'remove') return null
        return { view: message.view, data: { text: `updated:${text ?? ''}` } }
      },
    }
    const off = registerChatNode(definition)
    const turn = initialTurnState()
    let messages: Message[] = []
    const started = reduceChatEvent(messages, pluginEvent('plugin/card', {}), turn)
    expect(started.changed).toBe(true)
    messages = started.messages
    expect(messages).toHaveLength(1)
    const custom = messages[0] as CustomMessage
    expect(custom.kind).toBe('custom')
    expect(custom.view).toBe('test-card')
    expect(turn.chatNodes.get('test-node')).toBe(custom.id)
    const updated = reduceChatEvent(messages, pluginEvent('plugin/card', { text: 'x' }), turn)
    expect(((updated.messages[0] as CustomMessage).data as { text: string }).text).toBe('updated:x')
    const removed = reduceChatEvent(updated.messages, pluginEvent('plugin/card', { text: 'remove' }), turn)
    expect(removed.messages).toHaveLength(0)
    expect(turn.chatNodes.has('test-node')).toBe(false)
    off()
  })

  it('leaves builtin reduction untouched when no node matches', () => {
    const off = registerChatNode({
      id: 'idle-node',
      match: event => (event as { type: string }).type === 'plugin/idle',
      start: () => ({ view: 'idle', data: null }),
    })
    const turn = initialTurnState()
    const result = reduceChatEvent([], pluginEvent('user/message', {
      source: { kind: 'user' },
      content: [{ type: 'text', text: 'hello' }],
    }), turn)
    expect(result.changed).toBe(true)
    expect(result.messages[0]?.kind).toBe('bubble')
    off()
  })
})

describe('message view contributions', () => {
  it('renders custom messages with registered views and a JSON fallback', () => {
    const off = registerMessageView({
      view: 'test-card',
      render: ({ message }) => ({
        label: 'Card',
        lines: [`alpha ${String((message.data as { text?: string }).text ?? '')}`],
        muted: false,
      }),
    })
    const withView: CustomMessage = { kind: 'custom', id: 'c1', view: 'test-card', data: { text: 'beta' } }
    const index = buildRowIndex([withView], 80)
    expect(index.total).toBe(4)
    expect(index.rowAt(0)?.kind).toBe('header')
    expect(index.rowAt(0)?.label).toBe('Card')
    expect(index.rowAt(2)?.text).toContain('alpha beta')
    expect(index.rowAt(2)?.muted).toBe(false)
    off()
    const fallback: CustomMessage = { kind: 'custom', id: 'c2', view: 'missing-view', data: { k: 'v' } }
    const fallbackIndex = buildRowIndex([fallback], 80)
    const bodyLines = [2, 3, 4].map(row => fallbackIndex.rowAt(row)?.text ?? '').join('\n')
    expect(bodyLines).toContain('"k"')
  })
})

describe('command contributions', () => {
  it('registers, overrides, and disposes commands', () => {
    const off = registerCommand({ id: 'greet', command: '/greet', description: 'say hi', args: ['a|b'] })
    expect(matchCommand('/greet')?.id).toBe('greet')
    expect(commandArgHints('greet')).toEqual(['a|b'])
    expect(COMMANDS.some(def => def.id === 'greet')).toBe(true)
    off()
    expect(matchCommand('/greet')).toBeUndefined()
    expect(commandArgHints('greet')).toBeUndefined()
    const offOverride = registerCommand({ id: 'new', command: '/new', description: 'override' })
    expect(matchCommand('/new')?.description).toBe('override')
    offOverride()
    expect(matchCommand('/new')?.description).toBe('Start a new conversation in current directory')
  })

  it('keeps layers independent when disposed out of order', () => {
    const first = registerCommand({ id: 'layered', command: '/layered', description: 'first' })
    const second = registerCommand({ id: 'layered', command: '/layered', description: 'second' })
    expect(matchCommand('/layered')?.description).toBe('second')
    first()
    expect(matchCommand('/layered')?.description).toBe('second')
    second()
    expect(matchCommand('/layered')).toBeUndefined()
  })
})

describe('widget contributions', () => {
  it('registers widgets with working disposers', () => {
    const def = { height: () => 1, paintWidth: () => 1, render: () => null }
    const off = registerWidget('plugin-item', def)
    expect(widgetOf('plugin-item')).toBeDefined()
    off()
    expect(() => widgetOf('plugin-item' as 'input')).toThrow()
  })
})

describe('palette contributions', () => {
  it('overrides colors on register and restores on dispose', () => {
    const builtin = COLORS.sectionHeader
    const off = registerPalette({ id: 'test-palette', colors: { sectionHeader: '#123456' } })
    expect(COLORS.sectionHeader).toBe('#123456')
    off()
    expect(COLORS.sectionHeader).toBe(builtin)
  })

  it('respects the mode filter', () => {
    const off = registerPalette({ id: 'test-palette-mode', mode: 'light', colors: { selectionBg: '#abcdef' } })
    expect(COLORS.selectionBg).not.toBe('#abcdef')
    off()
  })
})

describe('key binding contributions', () => {
  const keyOf = (overrides: Partial<TuiKey> = {}): TuiKey => ({
    upArrow: false,
    downArrow: false,
    leftArrow: false,
    rightArrow: false,
    pageDown: false,
    pageUp: false,
    return: false,
    escape: false,
    ctrl: false,
    shift: false,
    tab: false,
    backspace: false,
    delete: false,
    meta: false,
    ...overrides,
  })

  it('consumes keys in registration order before builtin handling', () => {
    const seen: string[] = []
    const first = registerKeyBinding({ id: 'key-first', order: 1, handle: () => true })
    const second = registerKeyBinding({ id: 'key-second', order: 2, handle: () => { seen.push('second'); return false } })
    expect(handleKeyContributions('x', keyOf())).toBe(true)
    expect(seen).toEqual([])
    first()
    expect(handleKeyContributions('x', keyOf())).toBe(false)
    expect(seen).toEqual(['second'])
    second()
  })
})

describe('startup boot log', () => {
  it('fans boot lines out to sinks with history replay and close', () => {
    const ctx = createTestContext()
    const dispose = createTuiExtensionPoint(ctx)
    const received: string[] = []
    openBootLog()
    emitBootLine('one')
    const off = ctx.tui.startup.registerSink({ id: 'test-sink', write: line => { received.push(line) } })
    expect(received).toEqual(['one'])
    emitBootLine('two')
    expect(received).toEqual(['one', 'two'])
    off()
    emitBootLine('dropped')
    expect(received).toEqual(['one', 'two'])
    closeBootLog()
    dispose()
  })
})

describe('runtime interaction faces', () => {
  it('pushes a plugin request and settles it through the panel kind', async () => {
    const ctx = createTestContext()
    const dispose = createTuiExtensionPoint(ctx)
    const store = new InteractionStore()
    exposeRuntimeFaces(ctx.tui, { interactions: store } as ChatBridge)
    const interactions = ctx.tui.interactions!
    const off = interactions.panels.register({ kind: 'test-interact', component: () => null })
    const request = { value: 1 }
    const pending = interactions.push('test-interact', request)
    expect(store.getSnapshot()?.kind).toBe('test-interact')
    expect(store.resolveRequest('test-interact', request, 'done')).toBe(true)
    await expect(pending).resolves.toBe('done')
    off()
    dispose()
  })
})

describe('tui extension point service', () => {
  it('exposes every contribution face over the cordis service', () => {
    const ctx = createTestContext()
    const dispose = createTuiExtensionPoint(ctx)
    expect(ctx.tui).toBeDefined()
    const offCommand = ctx.tui.commands.register({ id: 'ext-cmd', command: '/ext', description: 'external' })
    expect(matchCommand('/ext')?.description).toBe('external')
    offCommand()
    const offTool = ctx.tui.tools.register({ tool: 'ext-tool-2', call: () => ({ label: 'L' }) })
    expect(toolViewOf('ext-tool-2')).toBeDefined()
    offTool()
    const offNode = ctx.tui.content.nodes.register({
      id: 'ext-node',
      match: () => false,
      start: () => ({ view: 'v', data: null }),
    })
    expect(offNode).toBeTypeOf('function')
    offNode()
    const offView = ctx.tui.content.views.register({ view: 'ext-view', render: () => ({ lines: [] }) })
    expect(offView).toBeTypeOf('function')
    offView()
    const offWidget = ctx.tui.chrome.widgets.register('ext-item', { height: () => 1, paintWidth: () => 1, render: () => null })
    expect(offWidget).toBeTypeOf('function')
    offWidget()
    const offWindow = ctx.tui.windows.register({ id: 'ext-window', title: 'Ext', component: () => null })
    expect(offWindow).toBeTypeOf('function')
    offWindow()
    const offStatus = ctx.tui.chrome.statusLine.register({ id: 'ext-status', render: () => 'x' })
    expect(offStatus).toBeTypeOf('function')
    offStatus()
    const offOverlay = ctx.tui.chrome.overlays.register({ id: 'ext-overlay', render: () => null })
    expect(offOverlay).toBeTypeOf('function')
    offOverlay()
    const offService = ctx.tui.services.register('ext-service', {})
    expect(offService).toBeTypeOf('function')
    offService()
    const offPalette = ctx.tui.chrome.palette.register({ id: 'ext-palette', colors: { selectionBg: '#0f0f0f' } })
    expect(COLORS.selectionBg).toBe('#0f0f0f')
    offPalette()
    const offKey = ctx.tui.chrome.keys.register({ id: 'ext-key', handle: () => false })
    expect(offKey).toBeTypeOf('function')
    offKey()
    dispose()
  })
})
