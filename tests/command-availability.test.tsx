import { act } from 'react'
import { render } from 'ink-testing-library'
import { describe, expect, it, vi } from 'vitest'
import type { ChatBridge } from '../src/chat/bridge.ts'
import { App } from '../src/ui/app.tsx'
import { createFakeBridge } from './helpers/fake-bridge.ts'

function fakeBridge(): ChatBridge {
  return createFakeBridge()
}

function focusedSegment(frame: string): string {
  const match = frame.match(/\x1b\[7m((?:\x1b\[[0-9;]*[A-Za-z])*[^\x1b]*)/)
  return (match?.[1] ?? '').replace(/\x1b\[[0-9;]*[A-Za-z]/g, '').trim()
}

async function type(stdin: { write(data: string): void }, data: string) {
  act(() => {
    stdin.write(data)
  })
  await new Promise(resolve => setTimeout(resolve, 20))
}

describe('command availability', () => {
  it('hides unavailable /todo and never lets the pointer reach a ghost entry', async () => {
    const bridge = fakeBridge()
    const { lastFrame, stdin } = render(<App bridge={bridge} />)
    await type(stdin, '/')
    let frame = lastFrame() ?? ''
    expect(frame).toContain('/new')
    expect(frame).not.toContain('/todo')

    await type(stdin, '\u001b[B')
    frame = lastFrame() ?? ''
    expect(focusedSegment(frame)).not.toContain('/todo')

    await type(stdin, '\u001b[A')
    await type(stdin, '\u001b[A')
    frame = lastFrame() ?? ''
    expect(focusedSegment(frame)).toContain('/new')

    await type(stdin, '\r')
    await type(stdin, '\r')
    expect(bridge.newSession).toHaveBeenCalled()
    expect(bridge.send).not.toHaveBeenCalled()
  })

  it('swallows an explicitly typed unavailable command instead of sending it to the model', async () => {
    const bridge = fakeBridge()
    const { stdin } = render(<App bridge={bridge} />)
    await type(stdin, '/todo')
    await type(stdin, '\r')
    expect(bridge.send).not.toHaveBeenCalled()
    expect(bridge.newSession).not.toHaveBeenCalled()
  })

  it('keeps /todo reachable once todos exist', async () => {
    const bridge = fakeBridge()
    let handler: ((event: unknown) => void) | undefined
    bridge.subscribe = cb => {
      handler = cb as typeof handler
      return () => {}
    }
    const { lastFrame, stdin } = render(<App bridge={bridge} />)
    await new Promise(resolve => setTimeout(resolve, 30))
    act(() => {
      handler?.({
        type: 'todo/write',
        seq: 1,
        time: 0,
        data: { todos: [{ content: 'first task', status: 'pending' }] },
      })
    })
    await new Promise(resolve => setTimeout(resolve, 60))
    await type(stdin, '/')
    const frame = lastFrame() ?? ''
    expect(frame).toContain('/todo')
  })

  it('merges host registry commands into hints and executes them on send', async () => {
    const bridge = fakeBridge() as ChatBridge & {
      listRegistryCommands(): unknown[]
      onRegistryChanged(listener: () => void): () => void
      executeCommandLine: ReturnType<typeof vi.fn>
    }
    const executed = vi.fn(async () => {})
    let changeListener: (() => void) | undefined
    bridge.executeCommandLine = executed
    bridge.listRegistryCommands = () => [{ name: 'echo', description: 'Echo test command' }]
    bridge.onRegistryChanged = listener => {
      changeListener = listener
      return () => {}
    }
    const { lastFrame, stdin } = render(<App bridge={bridge} />)
    await type(stdin, '/')
    expect(lastFrame() ?? '').toContain('/echo')
    expect(lastFrame() ?? '').toContain('Echo test command')

    act(() => {
      changeListener?.()
    })
    await type(stdin, '\u001b[B')
    await type(stdin, '\u001b[B')
    let frame = lastFrame() ?? ''
    while (!focusedSegment(frame).includes('/echo')) {
      await type(stdin, '\u001b[B')
      const next = lastFrame() ?? ''
      if (next === frame) break
      frame = next
    }
    expect(focusedSegment(frame)).toContain('/echo')

    await type(stdin, '\r')
    await type(stdin, '\r')
    expect(executed).toHaveBeenCalledWith('/echo')
    expect(bridge.send).not.toHaveBeenCalled()
  })
})
