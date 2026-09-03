import { act } from 'react'
import { Text } from 'ink'
import { render } from 'ink-testing-library'
import { describe, expect, it } from 'vitest'
import { useComposer } from '../src/ui/input/use-composer.ts'
import type { ComposerSubmission } from '../src/ui/input/composer-fields.ts'

function Harness({ onSend }: { onSend: (submission: ComposerSubmission) => void }) {
  const { value, cursor } = useComposer(onSend, true, 80)
  const rendered = value.slice(0, cursor) + '|' + value.slice(cursor)
  return <Text>{rendered.length === 1 ? '<empty>' : rendered}</Text>
}

async function type(stdin: { write(data: string): void }, data: string) {
  act(() => {
    stdin.write(data)
  })
  await new Promise(resolve => setTimeout(resolve, 20))
}

function noop(): void {}

describe('composer undo and redo', () => {
  it('undoes and redoes edits with ctrl+z / ctrl+y', async () => {
    const { lastFrame, stdin } = render(<Harness onSend={noop} />)
    await type(stdin, 'hello')
    expect(lastFrame() ?? '').toContain('hello|')

    await type(stdin, '\x1a')
    expect(lastFrame() ?? '').toContain('<empty>')

    await type(stdin, '\x19')
    expect(lastFrame() ?? '').toContain('hello|')

    await type(stdin, '\x1a')
    expect(lastFrame() ?? '').toContain('<empty>')
    await type(stdin, '\x1a')
    expect(lastFrame() ?? '').toContain('<empty>')
  })

  it('clears the undo history after sending', async () => {
    const { lastFrame, stdin } = render(<Harness onSend={noop} />)
    await type(stdin, 'hello')
    await type(stdin, '\r')
    await type(stdin, '\x1a')
    expect(lastFrame() ?? '').toContain('<empty>')
  })

  it('deletes whole words with alt+backspace, including cjk', async () => {
    const { lastFrame, stdin } = render(<Harness onSend={noop} />)
    await type(stdin, 'foo bar')
    await type(stdin, '\x1b\x7f')
    expect(lastFrame() ?? '').toContain('foo |')

    await type(stdin, '你好世界')
    await type(stdin, '\x1b\x7f')
    expect(lastFrame() ?? '').toContain('foo |')
  })

  it('moves by words with alt+left / alt+right', async () => {
    const { lastFrame, stdin } = render(<Harness onSend={noop} />)
    await type(stdin, 'foo bar')
    await type(stdin, '\x1b[1;3D')
    expect(lastFrame() ?? '').toContain('foo |bar')

    await type(stdin, '\x1b[1;3C')
    expect(lastFrame() ?? '').toContain('foo bar|')
  })
})
