import { act } from 'react'
import { render } from 'ink-testing-library'
import { Box, Text } from 'ink'
import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { useComposer } from '../src/ui/input/use-composer.ts'
import { Dialog } from '../src/ui/dialog/dialog.tsx'
import type { DialogRow } from '../src/ui/dialog/dialog.tsx'

function ComposerHarness({ onSend }: { onSend: (text: string) => void }) {
  const { value } = useComposer(onSend, true, 40)
  return <Text>{value}</Text>
}

async function type(stdin: { write(data: string): void }, data: string) {
  act(() => {
    stdin.write(data)
  })
  await new Promise(resolve => setTimeout(resolve, 20))
}

describe('composer paste', () => {
  it('inserts bracketed paste verbatim without sending', async () => {
    const onSend = vi.fn()
    const { lastFrame, stdin } = render(<ComposerHarness onSend={onSend} />)
    await type(stdin, '\x1b[200~hello\r\nworld\x1b[201~')
    expect(onSend).not.toHaveBeenCalled()
    const frame = lastFrame() ?? ''
    expect(frame).toContain('hello')
    expect(frame).toContain('world')
    await type(stdin, '\r')
    expect(onSend).toHaveBeenCalledWith('hello\nworld')
  })

  it('normalizes crlf and cr line endings', async () => {
    const onSend = vi.fn()
    const { lastFrame, stdin } = render(<ComposerHarness onSend={onSend} />)
    await type(stdin, '\x1b[200~a\r\nb\rc\x1b[201~')
    await type(stdin, '\r')
    expect(onSend).toHaveBeenCalledWith('a\nb\nc')
    expect(lastFrame() ?? '').not.toContain('\r')
  })

  it('inserts a real newline for ctrl+j without sending', async () => {
    const onSend = vi.fn()
    const { stdin } = render(<ComposerHarness onSend={onSend} />)
    await type(stdin, 'ab')
    await type(stdin, '\n')
    expect(onSend).not.toHaveBeenCalled()
    await type(stdin, 'cd')
    await type(stdin, '\r')
    expect(onSend).toHaveBeenCalledWith('ab\ncd')
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
