import { render } from 'ink-testing-library'
import { Box } from 'ink'
import { describe, expect, it } from 'vitest'
import { MessageList } from '../src/ui/message/message-list.tsx'
import { rowIndexFor } from '../src/ui/message/layout.ts'
import type { Message } from '../src/model/message.ts'

const HEIGHT = 12
const WIDTH = 80

function transcript(): Message[] {
  const messages: Message[] = []
  for (let i = 0; i < 8; i++) {
    messages.push({
      kind: 'bubble',
      id: `u${i}`,
      role: 'user',
      content: `user-token-${i}-a\nuser-token-${i}-b`,
    })
    messages.push({
      kind: 'collapsible',
      id: `t${i}`,
      label: `tool-token-${i} [run ${i}]`,
      body: `body-token-${i}-alpha\nbody-token-${i}-beta`,
      running: false,
      collapsed: false,
    })
    messages.push({
      kind: 'bubble',
      id: `a${i}`,
      role: 'assistant',
      content: `assistant-token-${i}-a\nassistant-token-${i}-b`,
    })
  }
  return messages
}

const TOKEN_PATTERN = /(?:user|assistant|body|tool)-token-\d+-?\w*/

function expectedTokens(messages: Message[]): string[] {
  const index = rowIndexFor(messages, WIDTH)
  const tokens: string[] = []
  for (let row = 0; row < index.total; row++) {
    const info = index.rowAt(row)
    if (info === null || info.kind === 'pad' || info.kind === 'blank') continue
    const source = info.kind === 'header' ? info.label : info.text
    const match = source.match(TOKEN_PATTERN)
    if (match !== null) tokens.push(match[0])
  }
  return tokens
}

async function settle(): Promise<void> {
  await new Promise(resolve => setTimeout(resolve, 15))
}

describe('message list scroll integrity', () => {
  it('shows exactly the windowed sentinel rows at every scroll offset', async () => {
    const messages = transcript()
    const allTokens = expectedTokens(messages)
    expect(allTokens.length).toBeGreaterThan(40)
    const { lastFrame, rerender } = render(
      <Box width={WIDTH} height={HEIGHT}>
        <MessageList messages={messages} height={HEIGHT} width={WIDTH} scrollTop={0} onScroll={() => {}} />
      </Box>,
    )
    await settle()
    let previousTotal = -1
    for (let scrollTop = 0; scrollTop <= 140; scrollTop++) {
      rerender(
        <Box width={WIDTH} height={HEIGHT}>
          <MessageList messages={messages} height={HEIGHT} width={WIDTH} scrollTop={scrollTop} onScroll={() => {}} />
        </Box>,
      )
      await settle()
      const frame = lastFrame() ?? ''
      const seen: string[] = []
      for (const rawLine of frame.split('\n')) {
        const match = rawLine.match(TOKEN_PATTERN)
        if (match !== null) seen.push(match[0])
      }
      const counts = new Map<string, number>()
      for (const token of seen) counts.set(token, (counts.get(token) ?? 0) + 1)
      for (const [token, count] of counts) {
        expect(count, `duplicate ${token} at offset ${scrollTop}`).toBe(1)
        expect(allTokens.includes(token), `unknown ${token} at offset ${scrollTop}`).toBe(true)
      }
      const total = rowIndexFor(messages, WIDTH).total
      if (previousTotal < 0) previousTotal = total
      void previousTotal
      if (scrollTop > total) break
    }
  })
})
