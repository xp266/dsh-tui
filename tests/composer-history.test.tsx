import { act } from 'react'
import { Text } from 'ink'
import { render } from 'ink-testing-library'
import { describe, expect, it } from 'vitest'
import { useComposer } from '../src/ui/input/use-composer.ts'
import type { ComposerSubmission } from '../src/ui/input/composer-fields.ts'

function Harness({ onSend }: { onSend: (submission: ComposerSubmission) => void }) {
  const { value, cursor, hintOpen } = useComposer(onSend, true, 80)
  const rendered = value.slice(0, cursor) + '|' + value.slice(cursor)
  return <Text>{rendered.length === 1 ? '<empty>' : rendered}{hintOpen ? ' [HINT]' : ''}</Text>
}

async function type(stdin: { write(data: string): void }, data: string) {
  act(() => {
    stdin.write(data)
  })
  await new Promise(resolve => setTimeout(resolve, 20))
}

function noop(): void {}

describe('composer send history', () => {
  it('recalls sent messages with up and returns with down', async () => {
    const sent: string[] = []
    const { lastFrame, stdin } = render(<Harness onSend={submission => sent.push(submission.text)} />)
    await type(stdin, 'one')
    await type(stdin, '\r')
    await type(stdin, 'two')
    await type(stdin, '\r')
    expect(sent).toEqual(['one', 'two'])
    expect(lastFrame() ?? '').toContain('<empty>')

    await type(stdin, '\x1b[A')
    expect(lastFrame() ?? '').toContain('two|')

    await type(stdin, '\x1b[A')
    expect(lastFrame() ?? '').toContain('one|')

    await type(stdin, '\x1b[A')
    expect(lastFrame() ?? '').toContain('one|')

    await type(stdin, '\x1b[B')
    expect(lastFrame() ?? '').toContain('two|')

    await type(stdin, '\x1b[B')
    expect(lastFrame() ?? '').toContain('<empty>')

    await type(stdin, '\x1b[B')
    expect(lastFrame() ?? '').toContain('<empty>')
  })

  it('restores the typed draft after browsing history', async () => {
    const { lastFrame, stdin } = render(<Harness onSend={noop} />)
    await type(stdin, 'sent')
    await type(stdin, '\r')
    await type(stdin, 'my draft')
    await type(stdin, '\x1b[A')
    expect(lastFrame() ?? '').toContain('sent|')
    await type(stdin, '\x1b[B')
    expect(lastFrame() ?? '').toContain('my draft|')
  })

  it('skips consecutive duplicate sends in history', async () => {
    const { lastFrame, stdin } = render(<Harness onSend={noop} />)
    await type(stdin, 'dup')
    await type(stdin, '\r')
    await type(stdin, 'dup')
    await type(stdin, '\r')
    await type(stdin, 'other')
    await type(stdin, '\r')
    await type(stdin, '\x1b[A')
    expect(lastFrame() ?? '').toContain('other|')
    await type(stdin, '\x1b[A')
    expect(lastFrame() ?? '').toContain('dup|')
    await type(stdin, '\x1b[A')
    expect(lastFrame() ?? '').toContain('dup|')
  })

  it('moves the caret up before recalling history on multiline input', async () => {
    const { lastFrame, stdin } = render(<Harness onSend={noop} />)
    await type(stdin, 'sent')
    await type(stdin, '\r')
    await type(stdin, 'line one')
    await type(stdin, '\n')
    await type(stdin, 'line two')
    expect(lastFrame() ?? '').toContain('line two|')
    await type(stdin, '\x1b[A')
    expect(lastFrame() ?? '').toContain('line one|')
    await type(stdin, '\x1b[A')
    expect(lastFrame() ?? '').toContain('sent|')
  })

  it('restores a multiline draft when going down at the bottom boundary', async () => {
    const { lastFrame, stdin } = render(<Harness onSend={noop} />)
    await type(stdin, 'sent')
    await type(stdin, '\r')
    await type(stdin, 'line one')
    await type(stdin, '\n')
    await type(stdin, 'line two')
    await type(stdin, '\x1b[A')
    await type(stdin, '\x1b[A')
    expect(lastFrame() ?? '').toContain('sent|')
    await type(stdin, '\x1b[B')
    await type(stdin, '\x1b[B')
    expect(lastFrame() ?? '').toContain('line two|')
  })

  it('is a no-op when history is empty', async () => {
    const { lastFrame, stdin } = render(<Harness onSend={noop} />)
    await type(stdin, 'abc')
    await type(stdin, '\x1b[A')
    expect(lastFrame() ?? '').toContain('abc|')
    await type(stdin, '\x1b[B')
    expect(lastFrame() ?? '').toContain('abc|')
  })

  it('does not open the command hint while scrolling history', async () => {
    const { lastFrame, stdin } = render(<Harness onSend={noop} />)
    await type(stdin, 'normal')
    await type(stdin, '\r')
    await type(stdin, '/new')
    await type(stdin, '\r')

    await type(stdin, '\x1b[A')
    expect(lastFrame() ?? '').toContain('/new|')
    expect(lastFrame() ?? '').not.toContain('[HINT]')

    await type(stdin, '\x1b[A')
    expect(lastFrame() ?? '').toContain('normal|')

    await type(stdin, '\x1b[B')
    expect(lastFrame() ?? '').toContain('/new|')
    expect(lastFrame() ?? '').not.toContain('[HINT]')

    await type(stdin, '\x08')
    expect(lastFrame() ?? '').toContain('/ne|')
    expect(lastFrame() ?? '').toContain('[HINT]')
  })
})