import { act } from 'react'
import { render } from 'ink-testing-library'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Message } from '../src/model/message.ts'
import { MessageList } from '../src/ui/message/message-list.tsx'

const SPINNER_FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏']

function runningTool(): Message {
  return { kind: 'collapsible', id: 't', label: 'Bash', body: '', running: true, collapsed: false }
}

describe('spinner animation', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('advances the running header spinner every 100ms', () => {
    vi.useFakeTimers()
    const { lastFrame } = render(<MessageList messages={[runningTool()]} height={10} width={80} scrollTop={0} onScroll={() => {}} />)
    expect(lastFrame() ?? '').toContain(SPINNER_FRAMES[0])
    act(() => {
      vi.advanceTimersByTime(100)
    })
    expect(lastFrame() ?? '').toContain(SPINNER_FRAMES[1])
    act(() => {
      vi.advanceTimersByTime(200)
    })
    expect(lastFrame() ?? '').toContain(SPINNER_FRAMES[3])
  })

  it('stops advancing once no tool is running', () => {
    vi.useFakeTimers()
    const { lastFrame, rerender } = render(
      <MessageList messages={[runningTool()]} height={10} width={80} scrollTop={0} onScroll={() => {}} />,
    )
    act(() => {
      vi.advanceTimersByTime(300)
    })
    const settled: Message[] = [{ kind: 'collapsible', id: 't', label: 'Bash', body: 'ok', running: false, collapsed: false }]
    act(() => {
      rerender(<MessageList messages={settled} height={10} width={80} scrollTop={0} onScroll={() => {}} />)
    })
    const before = lastFrame() ?? ''
    act(() => {
      vi.advanceTimersByTime(300)
    })
    expect(lastFrame() ?? '').toBe(before)
  })
})