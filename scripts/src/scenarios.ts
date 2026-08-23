import { COMMANDS } from '../../src/ui/input/commands.ts'
import { InteractionStore } from '../../src/chat/interactions.ts'
import { SAMPLE_QUESTION } from './mock-bridge.ts'
import type { MockBridge } from './mock-bridge.ts'

export interface ShotContext {
  bridge: MockBridge
  type(keys: string): void
  sleep(ms: number): Promise<void>
}

export interface Scenario {
  id: string
  description: string
  discoveredFrom: string
  run(ctx: ShotContext): Promise<void> | void
}

type PanelStarter = (bridge: MockBridge) => void

const PANEL_STARTERS: Record<string, PanelStarter> = {
  pushApproval: bridge => {
    void bridge.interactions.pushApproval('bash', 'call-1', 'Allow running the unit test suite?')
  },
  pushQuestion: bridge => {
    void bridge.interactions.pushQuestion(SAMPLE_QUESTION).catch(() => {})
  },
}

function panelScenarios(): Scenario[] {
  const methods = Object.getOwnPropertyNames(InteractionStore.prototype)
    .filter(name => name.startsWith('push'))
    .sort()
  return methods.map(method => ({
    id: `panel/${method}`,
    description: PANEL_STARTERS[method] !== undefined
      ? `Bottom panel driven by InteractionStore.${method}()`
      : `Discovered InteractionStore.${method}() but no sample payload is registered`,
    discoveredFrom: 'chat/interactions.ts (prototype reflection)',
    run(ctx) {
      const starter = PANEL_STARTERS[method]
      if (starter === undefined) {
        throw new Error(
          `no sample payload registered for InteractionStore.${method}(); add one to scripts/src/scenarios.ts PANEL_STARTERS`,
        )
      }
      starter(ctx.bridge)
    },
  }))
}

function commandScenarios(): Scenario[] {
  return COMMANDS.map(command => ({
    id: `command/${command.id}`,
    description: `Type ${command.command} + Enter (${command.description})`,
    discoveredFrom: 'ui/input/commands.ts COMMANDS',
    run(ctx) {
      ctx.type(command.command)
      return ctx
        .sleep(300)
        .then(() => ctx.type('\r'))
        .then(() => ctx.sleep(300))
        .then(() => ctx.type('\r'))
    },
  }))
}

function chatTranscriptEvents(): unknown[] {
  return [
    {
      type: 'user/message',
      data: {
        source: { kind: 'user' },
        content: [{ type: 'text', text: 'Refactor the screen parser and add a snapshot API. Then run the tests.' }],
      },
    },
    {
      type: 'assistant/chunk',
      data: { step: 0, chunk: { type: 'reasoning-delta', text: 'Inspect terminal/screen.ts, extend the cell grid, expose snapshot().' } },
    },
    { type: 'assistant/message', data: { step: 0 } },
    {
      type: 'assistant/chunk',
      data: {
        step: 1,
        chunk: {
          type: 'text-delta',
          text: '**Plan**\n1. Track SGR attributes per cell\n2. Add `snapshot()` to ScreenCapture\n\n```ts\nconst frame = capture.snapshot()\n```\n\nAll layouts are captured as plain text.',
        },
      },
    },
    {
      type: 'tool/call',
      data: { name: 'bash', callId: 'call-1', arguments: { command: 'pnpm test' } },
    },
    {
      type: 'tool/result',
      data: {
        message: {
          content: [
            {
              toolCallId: 'call-1',
              content: [{ type: 'text', text: 'Test Files  21 passed (21)\nTests  214 passed (214)' }],
            },
          ],
        },
      },
    },
    { type: 'turn/end', data: { reason: { kind: 'stop' } } },
  ]
}

export function buildScenarios(options: { inputText?: string } = {}): Scenario[] {
  const scenarios: Scenario[] = [
    {
      id: 'base',
      description: 'Idle main screen: input bar, status line, stats bar',
      discoveredFrom: 'built-in',
      run() {},
    },
    {
      id: 'input',
      description: 'Composer filled with text (--text, default sample sentence)',
      discoveredFrom: 'built-in',
      run(ctx) {
        ctx.type(options.inputText ?? 'fix the failing unit tests in src/core and rerun vitest')
      },
    },
    {
      id: 'hint',
      description: 'Slash-command hint list overlay (typed "/mo")',
      discoveredFrom: 'built-in',
      run(ctx) {
        ctx.type('/mo')
      },
    },
    {
      id: 'chat-transcript',
      description: 'Message area populated with user bubble, thinking block, markdown answer and tool card',
      discoveredFrom: 'built-in',
      run(ctx) {
        for (const event of chatTranscriptEvents()) ctx.bridge.emitEvent(event)
      },
    },
  ]
  return [...scenarios, ...commandScenarios(), ...panelScenarios()]
}
