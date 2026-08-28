import { act } from 'react'
import { render } from 'ink-testing-library'
import { describe, expect, it, vi } from 'vitest'
import type { ChatBridge } from '../src/chat/bridge.ts'
import { App } from '../src/ui/app.tsx'
import { createFakeBridge } from './helpers/fake-bridge.ts'

vi.mock('../src/ui/input/commands.ts', async importOriginal => {
  const actual = await importOriginal<typeof import('../src/ui/input/commands.ts')>()
  const commands = Array.from({ length: 12 }, (_, i) => ({ command: `/c${String(i + 1).padStart(2, '0')}`, description: `d${i + 1}` }))
  const filterCommands = (value: string) => {
    const token = value.split(/\s+/, 1)[0] ?? ''
    if (!token.startsWith('/')) return []
    return commands.filter(command => command.command.startsWith(token))
  }
  return {
    ...actual,
    COMMANDS: commands,
    filterCommands,
    visibleCommands: (value: string, isAvailable?: (command: (typeof commands)[number]) => boolean) => {
      const matches = filterCommands(value)
      return isAvailable === undefined ? matches : matches.filter(isAvailable)
    },
    matchCommand: (text: string) => commands.find(command => command.command === text),
    matchAvailableCommand: (text: string, isAvailable?: (command: (typeof commands)[number]) => boolean) => {
      const command = commands.find(entry => entry.command === text)
      if (command === undefined) return undefined
      if (isAvailable !== undefined && !isAvailable(command)) return undefined
      return command
    },
  }
})

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

describe('command hint windowing', () => {
  it('caps visible hints and scrolls the window with the pointer', async () => {
    const { lastFrame, stdin } = render(<App bridge={fakeBridge()} />)
    await type(stdin, '/')
    let frame = lastFrame() ?? ''
    expect(frame).toContain('/c01')
    expect(frame).toContain('/c10')
    expect(frame).not.toContain('/c11')
    expect(focusedSegment(frame)).toContain('/c01')

    for (let i = 0; i < 10; i++) await type(stdin, '\u001b[B')
    frame = lastFrame() ?? ''
    expect(frame).not.toContain('/c01')
    expect(frame).toContain('/c11')
    expect(focusedSegment(frame)).toContain('/c11')

    await type(stdin, '\u001b[B')
    frame = lastFrame() ?? ''
    expect(frame).not.toContain('/c02')
    expect(frame).toContain('/c12')
    expect(focusedSegment(frame)).toContain('/c12')

    for (let i = 0; i < 11; i++) await type(stdin, '\u001b[A')
    frame = lastFrame() ?? ''
    expect(frame).toContain('/c01')
    expect(frame).not.toContain('/c11')
    expect(focusedSegment(frame)).toContain('/c01')
  })

  it('keeps the window still until the pointer leaves its bounds', async () => {
    const { lastFrame, stdin } = render(<App bridge={fakeBridge()} />)
    await type(stdin, '/')
    for (let i = 0; i < 9; i++) await type(stdin, '\u001b[B')
    let frame = lastFrame() ?? ''
    expect(frame).toContain('/c01')
    expect(focusedSegment(frame)).toContain('/c10')

    await type(stdin, '\u001b[A')
    frame = lastFrame() ?? ''
    expect(frame).toContain('/c01')
    expect(focusedSegment(frame)).toContain('/c09')

    for (let i = 0; i < 8; i++) await type(stdin, '\u001b[A')
    frame = lastFrame() ?? ''
    expect(frame).toContain('/c01')
    expect(focusedSegment(frame)).toContain('/c01')
  })
})
