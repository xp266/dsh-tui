import { act } from 'react'
import { render } from 'ink-testing-library'
import { Box } from 'ink'
import { describe, expect, it, vi } from 'vitest'
import { Dialog } from '../src/ui/dialog/dialog.tsx'
import type { DialogRow } from '../src/ui/dialog/dialog.tsx'
import { DefaultsDialog } from '../src/ui/dialog/defaults-dialog.tsx'

function carouselRows(): DialogRow[] {
  return [
    { items: [{ type: 'select', label: 'A', value: 'a', options: ['a', 'b'], onChange: () => {} }] },
    { items: [{ type: 'select', label: 'B', value: 'b', options: ['a', 'b'], onChange: () => {} }] },
  ]
}

function renderDialog(onConfirmLast: () => void, onClose: () => void) {
  return render(
    <Box width={100} height={24}>
      <Dialog width={60} maxHeight={22} title="t" rows={carouselRows()} onClose={onClose} onConfirmLast={onConfirmLast} />
    </Box>,
  )
}

describe('dialog last-row confirm', () => {
  it('confirms with enter on the last carousel row', () => {
    const onConfirmLast = vi.fn()
    const onClose = vi.fn()
    const { stdin } = renderDialog(onConfirmLast, onClose)
    act(() => {
      stdin.write('\u001b[B')
    })
    act(() => {
      stdin.write('\r')
    })
    expect(onConfirmLast).toHaveBeenCalledTimes(1)
    expect(onClose).not.toHaveBeenCalled()
  })

  it('navigates instead of confirming above the last row', () => {
    const onConfirmLast = vi.fn()
    const { stdin } = renderDialog(onConfirmLast, () => {})
    act(() => {
      stdin.write('\r')
    })
    expect(onConfirmLast).not.toHaveBeenCalled()
  })

  it('closes the defaults dialog with enter on the last carousel', async () => {
    const onClose = vi.fn()
    const api = {
      listPresets: vi.fn(async () => [
        { id: 'standard', name: 'Standard mode' },
        { id: 'code', name: 'Code mode' },
      ]),
      defaultPresetId: () => 'standard',
      setDefaultPreset: vi.fn(async () => {}),
      listPermissionPresets: vi.fn(async () => ['workspace-write', 'read-only']),
      defaultPermission: () => 'workspace-write',
      setDefaultPermission: vi.fn(async () => {}),
    }
    const { stdin } = render(
      <Box width={100} height={24}>
        <DefaultsDialog api={api} onClose={onClose} />
      </Box>,
    )
    await new Promise(resolve => setTimeout(resolve, 20))
    act(() => {
      stdin.write('\u001b[B')
    })
    act(() => {
      stdin.write('\r')
    })
    expect(onClose).toHaveBeenCalledTimes(1)
  })
})