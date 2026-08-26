import { render } from 'ink-testing-library'
import { describe, expect, it } from 'vitest'
import type { Message } from '../src/model/message.ts'
import { MessageList } from '../src/ui/message/message-list.tsx'

function tool(overrides: Partial<Extract<Message, { kind: 'collapsible' }>> = {}): Message {
  return { kind: 'collapsible', id: 't', label: 'Bash', body: '', running: true, collapsed: false, ...overrides }
}

function frameOf(messages: Message[]): string {
  const { lastFrame } = render(<MessageList messages={messages} height={10} width={80} scrollTop={0} onScroll={() => {}} />)
  return (lastFrame() ?? '').replace(/\x1b\[[0-9;]*[A-Za-z]/g, '')
}

describe('collapsible header symbols', () => {
  it('renders the dash symbol while collapsed and idle', () => {
    const frame = frameOf([tool({ collapsed: true, running: false })])
    expect(frame).toMatch(/- +Bash/)
  })

  it('renders the down arrow while expanded', () => {
    const frame = frameOf([tool({ running: false })])
    expect(frame).toMatch(/↓ +Bash/)
  })

  it('replaces the marker with a spinner frame while running', () => {
    const frame = frameOf([tool({ collapsed: true })])
    expect(frame).toMatch(/⠋ +Bash/)
    expect(frame).not.toMatch(/- +Bash/)
  })
})
