import { act } from 'react'
import { render } from 'ink-testing-library'
import { Text } from 'ink'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { useComposer } from '../src/ui/input/use-composer.ts'
import { expandFieldChars } from '../src/core/field-view.ts'
import type { PendingImage } from '../src/core/paste.ts'

function ComposerHarness({ onSend }: { onSend: (submission: { text: string; images: PendingImage[][] }) => void }) {
  const { value } = useComposer(onSend, true, 40)
  return <Text>{expandFieldChars(value)}</Text>
}

async function type(stdin: { write(data: string): void }, data: string) {
  act(() => {
    stdin.write(data)
  })
  await new Promise(resolve => setTimeout(resolve, 20))
}

function makeImagePath(name: string): string {
  const dir = mkdtempSync(join(tmpdir(), 'dsh-tui-img-'))
  const path = join(dir, name)
  writeFileSync(path, 'png-bytes')
  return path
}

function makeSpaceImagePath(name: string): string {
  const dir = mkdtempSync(join(tmpdir(), 'dsh-tui-img space-'))
  const path = join(dir, name)
  writeFileSync(path, 'png-bytes')
  return path
}

describe('composer image paste', () => {
  it('shows an images chip per paste group and sends grouped image paths', async () => {
    const one = makeImagePath('one.png')
    const two = makeImagePath('two.png')
    const three = makeImagePath('three.png')
    const onSend = vi.fn()
    const { lastFrame, stdin } = render(<ComposerHarness onSend={onSend} />)
    await type(stdin, 'look ')
    await type(stdin, `\x1b[200~${one}\n${two}\x1b[201~`)
    await type(stdin, `\x1b[200~${three}\x1b[201~`)
    const frame = lastFrame() ?? ''
    expect(frame).toContain('[2 images]')
    expect(frame).toContain('[1 images]')
    expect(frame).toContain('look')
    await type(stdin, '\r')
    expect(onSend).toHaveBeenCalledWith({
      text: 'look',
      images: [[{ kind: 'path', path: one }, { kind: 'path', path: two }], [{ kind: 'path', path: three }]],
    })
  })

  it('groups file-manager drops with copy action and file:// uris', async () => {
    const one = makeImagePath('drop-a.png')
    const two = makeSpaceImagePath('drop b.png')
    const onSend = vi.fn()
    const { lastFrame, stdin } = render(<ComposerHarness onSend={onSend} />)
    await type(stdin, `\x1b[200~copy\nfile://${one}\nfile://${encodeURI(two)}\x1b[201~`)
    expect(lastFrame() ?? '').toContain('[2 images]')
    await type(stdin, '\r')
    expect(onSend).toHaveBeenCalledWith({
      text: '',
      images: [[{ kind: 'path', path: one }, { kind: 'path', path: two }]],
    })
  })

  it('deletes a whole images chip with one backspace', async () => {
    const one = makeImagePath('only.png')
    const onSend = vi.fn()
    const { lastFrame, stdin } = render(<ComposerHarness onSend={onSend} />)
    await type(stdin, `\x1b[200~${one}\x1b[201~`)
    expect(lastFrame() ?? '').toContain('[1 images]')
    await type(stdin, '\x7f')
    expect(lastFrame() ?? '').not.toContain('[1 images]')
    await type(stdin, '\r')
    expect(onSend).not.toHaveBeenCalled()
  })
})
