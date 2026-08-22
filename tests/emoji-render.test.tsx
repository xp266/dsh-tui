import { render } from 'ink-testing-library'
import { Box } from 'ink'
import { describe, expect, it } from 'vitest'
import stringWidth from 'string-width'
import { MessageList } from '../src/ui/message/message-list.tsx'
import { rowIndexFor } from '../src/ui/message/layout.ts'
import type { Message } from '../src/model/message.ts'

const WIDTH = 100
const HEIGHT = 12

function emojiTranscript(): Message[] {
  return [
    {
      kind: 'bubble',
      id: 'u0',
      role: 'user',
      content: 'A'.repeat(90) + '1️⃣' + 'END-TOKEN',
    },
    {
      kind: 'collapsible',
      id: 't0',
      label: 'tool [run 0]',
      body: '| 1️⃣ | rm /home/xp266/ox-alpha-permission-test.txt（工作区外删除） | ❌ 被拒：Read-only file system + [sandbox: file access denied under workspace-write mode]，并附升级提示 |',
      running: false,
      collapsed: false,
    },
  ]
}

async function settle(): Promise<void> {
  await new Promise(resolve => setTimeout(resolve, 15))
}

describe('emoji message rendering integrity', () => {
  it('renders exactly the indexed rows without renderer re-wrap', async () => {
    const messages = emojiTranscript()
    const index = rowIndexFor(messages, WIDTH)
    const { lastFrame, rerender } = render(
      <Box width={WIDTH} height={HEIGHT}>
        <MessageList messages={messages} height={HEIGHT} width={WIDTH} scrollTop={0} onScroll={() => {}} />
      </Box>,
    )
    await settle()
    rerender(
      <Box width={WIDTH} height={HEIGHT}>
        <MessageList messages={messages} height={HEIGHT} width={WIDTH} scrollTop={0} onScroll={() => {}} />
      </Box>,
    )
    await settle()
    const frame = lastFrame() ?? ''
    const lines = frame.replace(/\x1b\[[0-9;]*[A-Za-z]/g, '').split('\n')
    for (const line of lines) {
      expect(stringWidth(line), `line too wide: ${JSON.stringify(line)}`).toBeLessThanOrEqual(WIDTH)
    }
    expect(lines.some(line => line.trim() === 'END-TOKEN')).toBe(true)
    expect(lines.some(line => line.includes('ND-TOKEN') && !line.includes('END-TOKEN'))).toBe(false)
    const textRows = lines.filter(line => line.includes('END-TOKEN') || line.includes('permission-test'))
    expect(textRows.length).toBeGreaterThan(0)
    void index
  })
})
