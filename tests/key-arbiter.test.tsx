import { act } from 'react'
import { render } from 'ink-testing-library'
import { describe, expect, it, vi } from 'vitest'
import { App } from '../src/ui/app.tsx'
import { createTuiExtensionPoint } from '../src/ui/extension-point.ts'
import type { ChatBridge } from '../src/chat/bridge.ts'
import { createFakeBridge } from './helpers/fake-bridge.ts'
import { createTestContext } from './harness.ts'

function settle(ms = 30): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

async function poll(lastFrame: () => string | undefined, text: string, maxTries = 40): Promise<string> {
  let frame = lastFrame() ?? ''
  for (let i = 0; i < maxTries && !frame.includes(text); i++) {
    await settle(25)
    frame = lastFrame() ?? ''
  }
  return frame
}

describe('true key consumption through the arbiter', () => {
  it('chrome key contributions preempt the composer for repeated keys', async () => {
    const ctx = createTestContext()
    const { dispose } = createTuiExtensionPoint(ctx)
    const handled = vi.fn()
    const off = ctx.tui.chrome.keys.register({
      id: 'swallow-x',
      handle: (input) => {
        if (input === 'x') {
          handled()
          return true
        }
        return false
      },
    })
    const bridge = createFakeBridge() as ChatBridge
    const { lastFrame, stdin } = render(<App bridge={bridge} />)
    await settle(60)
    for (let i = 0; i < 3; i++) {
      act(() => {
        stdin.write('x')
      })
      await settle(10)
    }
    await poll(lastFrame, 'ready')
    const frame = lastFrame() ?? ''
    expect(handled).toHaveBeenCalledTimes(3)
    expect(frame.includes('xxx')).toBe(false)
    off()
    for (let i = 0; i < 3; i++) {
      act(() => {
        stdin.write('x')
      })
      await settle(10)
    }
    const after = lastFrame() ?? ''
    expect(after.includes('xxx')).toBe(true)
    dispose()
  })

  it('chrome key contributions preempt an open dialog', async () => {
    const ctx = createTestContext()
    const { dispose } = createTuiExtensionPoint(ctx)
    const off = ctx.tui.chrome.keys.register({
      id: 'swallow-escape',
      handle: (_input, key) => key.escape,
    })
    const bridge = createFakeBridge() as ChatBridge
    const { lastFrame, stdin } = render(<App bridge={bridge} />)
    await poll(lastFrame, 'glm-4.7-flash')
    await poll(lastFrame, 'models')
    act(() => {
      stdin.write('/models')
    })
    await settle()
    act(() => {
      stdin.write('\r')
    })
    await poll(lastFrame, 'Ctrl+A add providers')
    act(() => {
      stdin.write('\x1b')
    })
    await settle()
    // the dialog must still be open: the contribution consumed the escape
    expect(lastFrame() ?? '').toContain('Ctrl+A add providers')
    off()
    dispose()
  })
})
