import { act } from 'react'
import { render } from 'ink-testing-library'
import { Box, Text } from 'ink'
import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { useComposer } from '../src/ui/input/use-composer.ts'
import { expandFieldChars } from '../src/core/field-view.ts'
import type { PendingImage } from '../src/core/paste.ts'
import { Dialog } from '../src/ui/dialog/dialog.tsx'
import type { DialogRow } from '../src/ui/dialog/dialog.tsx'

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

describe('composer paste', () => {
  it('summarizes a multi-line paste as a lines field and expands on send', async () => {
    const onSend = vi.fn()
    const { lastFrame, stdin } = render(<ComposerHarness onSend={onSend} />)
    await type(stdin, '\x1b[200~a\r\nb\r\nc\r\nd\x1b[201~')
    expect(onSend).not.toHaveBeenCalled()
    const frame = lastFrame() ?? ''
    expect(frame).toContain('[4 lines]')
    expect(frame).not.toContain('ddd')
    await type(stdin, '\r')
    expect(onSend).toHaveBeenCalledWith({ text: 'a\nb\nc\nd', images: [] })
  })

  it('summarizes a long single-line paste as a characters field', async () => {
    const onSend = vi.fn()
    const { lastFrame, stdin } = render(<ComposerHarness onSend={onSend} />)
    const long = 'a'.repeat(700)
    await type(stdin, `\x1b[200~${long}\x1b[201~`)
    expect(lastFrame() ?? '').toContain('[700 characters]')
    await type(stdin, '\r')
    expect(onSend).toHaveBeenCalledWith({ text: long, images: [] })
  })

  it('keeps short pastes verbatim', async () => {
    const onSend = vi.fn()
    const { lastFrame, stdin } = render(<ComposerHarness onSend={onSend} />)
    await type(stdin, '\x1b[200~ab\x1b[201~')
    expect(lastFrame() ?? '').toContain('ab')
    await type(stdin, '\r')
    expect(onSend).toHaveBeenCalledWith({ text: 'ab', images: [] })
  })

  it('inserts a real newline for ctrl+j without sending', async () => {
    const onSend = vi.fn()
    const { stdin } = render(<ComposerHarness onSend={onSend} />)
    await type(stdin, 'ab')
    await type(stdin, '\n')
    expect(onSend).not.toHaveBeenCalled()
    await type(stdin, 'cd')
    await type(stdin, '\r')
    expect(onSend).toHaveBeenCalledWith({ text: 'ab\ncd', images: [] })
  })
})

function DialogHarness() {
  const [value, setValue] = useState('')
  const rows: DialogRow[] = [
    { items: [{ type: 'input', label: 'API Key', value, onChange: setValue }] },
  ]
  return (
    <Box width={80} height={24}>
      <Dialog width={60} maxHeight={0.6} title="t" rows={rows} onClose={() => {}} />
    </Box>
  )
}

describe('dialog paste', () => {
  it('routes paste into the focused dialog field', async () => {
    const { lastFrame, stdin } = render(<DialogHarness />)
    await type(stdin, '\x1b[200~sk-abc\x1b[201~')
    expect(lastFrame() ?? '').toContain('sk-abc')
  })
})
