import { act } from 'react'
import { render } from 'ink-testing-library'
import { Box } from 'ink'
import { describe, expect, it, vi } from 'vitest'
import { CloseGuardContext, Dialog } from '../src/ui/dialog/dialog.tsx'
import type { DialogRow } from '../src/ui/dialog/dialog.tsx'

function rows(): DialogRow[] {
  return [{ items: [{ type: 'button', label: 'row', onPress: () => {} }] }]
}

function renderDialog(guarded: boolean, onClose: () => void) {
  return render(
    <Box width={80} height={24}>
      <CloseGuardContext.Provider value={guarded}>
        <Dialog width={60} maxHeight={0.6} title="t" rows={rows()} onClose={onClose} />
      </CloseGuardContext.Provider>
    </Box>,
  )
}

async function press(stdin: { write(data: string): void }, data: string) {
  act(() => {
    stdin.write(data)
  })
  await new Promise(resolve => setTimeout(resolve, 20))
}

describe('dialog close guard', () => {
  it('closes on ctrl+c when the guard is inactive', async () => {
    const onClose = vi.fn()
    const { stdin } = renderDialog(false, onClose)
    await press(stdin, '\x03')
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('keeps the dialog open on ctrl+c while a selection is active', async () => {
    const onClose = vi.fn()
    const { lastFrame, stdin } = renderDialog(true, onClose)
    await press(stdin, '\x03')
    expect(onClose).not.toHaveBeenCalled()
    expect(lastFrame() ?? '').toContain('row')
  })

  it('still closes on escape while the guard is active', async () => {
    const onClose = vi.fn()
    const { stdin } = renderDialog(true, onClose)
    await press(stdin, '\x1b')
    expect(onClose).toHaveBeenCalledTimes(1)
  })
})
