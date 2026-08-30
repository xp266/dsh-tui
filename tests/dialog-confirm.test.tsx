import { act } from 'react'
import { render } from 'ink-testing-library'
import { Box } from 'ink'
import { describe, expect, it, vi } from 'vitest'
import { Dialog } from '../src/ui/dialog/dialog.tsx'
import type { DialogRow } from '../src/ui/dialog/dialog.tsx'
import { DefaultsDialog } from '../src/ui/dialog/defaults-dialog.tsx'

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function formRows(onConfirm: () => void, onCancel: () => void): DialogRow[] {
  return [
    { items: [{ type: 'input', label: 'API Key', value: '', onChange: () => {} }] },
    { items: [{ type: 'actions', confirmLabel: 'Submit', cancelLabel: 'Cancel', onConfirm, onCancel }] },
  ]
}

function renderForm(onConfirm: () => void, onCancel: () => void) {
  return render(
    <Box width={100} height={24}>
      <Dialog width={60} maxHeight={0.6} title="t" rows={formRows(onConfirm, onCancel)} onClose={() => {}} />
    </Box>,
  )
}

describe('actions row keyboard', () => {
  it('navigates from the input instead of confirming', () => {
    const onConfirm = vi.fn()
    const onCancel = vi.fn()
    const { stdin } = renderForm(onConfirm, onCancel)
    act(() => {
      stdin.write('\r')
    })
    expect(onConfirm).not.toHaveBeenCalled()
    expect(onCancel).not.toHaveBeenCalled()
  })

  it('presses Submit with enter on the focused confirm button', () => {
    const onConfirm = vi.fn()
    const onCancel = vi.fn()
    const { stdin } = renderForm(onConfirm, onCancel)
    act(() => {
      stdin.write('\u001b[B')
    })
    act(() => {
      stdin.write('\r')
    })
    expect(onConfirm).toHaveBeenCalledTimes(1)
    expect(onCancel).not.toHaveBeenCalled()
  })

  it('switches to Cancel with right arrow and presses it', () => {
    const onConfirm = vi.fn()
    const onCancel = vi.fn()
    const { stdin } = renderForm(onConfirm, onCancel)
    act(() => {
      stdin.write('\u001b[B')
    })
    act(() => {
      stdin.write('\u001b[C')
    })
    act(() => {
      stdin.write('\r')
    })
    expect(onCancel).toHaveBeenCalledTimes(1)
    expect(onConfirm).not.toHaveBeenCalled()
  })

  it('renders both labels without a background row', () => {
    const { lastFrame } = renderForm(() => {}, () => {})
    const frame = lastFrame() ?? ''
    expect(frame).toContain('Submit')
    expect(frame).toContain('Cancel')
  })
})

function defaultsApi() {
  return {
    listPresets: vi.fn(async () => [
      { id: 'standard', name: 'Standard mode' },
      { id: 'code', name: 'Code mode' },
    ]),
    defaultPresetId: () => 'standard',
    setDefaultPreset: vi.fn(async () => {}),
    listPermissionPresets: vi.fn(async () => ['workspace-write', 'read-only']),
    defaultPermission: () => 'workspace-write',
    setDefaultPermission: vi.fn(async () => {}),
    themeMode: () => 'dark' as const,
    setThemeMode: vi.fn(async () => {}),
  }
}

describe('defaults dialog submit and cancel', () => {
  it('closes with enter on Submit without extra saves', async () => {
    const api = defaultsApi()
    const onClose = vi.fn()
    const { stdin } = render(
      <Box width={100} height={24}>
        <DefaultsDialog api={api} onClose={onClose} />
      </Box>,
    )
    await sleep(20)
    act(() => {
      stdin.write('\u001b[B')
    })
    act(() => {
      stdin.write('\u001b[B')
    })
    act(() => {
      stdin.write('\u001b[B')
    })
    act(() => {
      stdin.write('\r')
    })
    expect(onClose).toHaveBeenCalledTimes(1)
    expect(api.setDefaultPreset).not.toHaveBeenCalled()
    expect(api.setDefaultPermission).not.toHaveBeenCalled()
    expect(api.setThemeMode).not.toHaveBeenCalled()
  })

  it('reverts unsaved changes when Cancel is pressed', async () => {
    const api = defaultsApi()
    const onClose = vi.fn()
    const { stdin } = render(
      <Box width={100} height={24}>
        <DefaultsDialog api={api} onClose={onClose} />
      </Box>,
    )
    await sleep(20)
    act(() => {
      stdin.write('\u001b[C')
    })
    await sleep(20)
    expect(api.setDefaultPreset).toHaveBeenCalledWith('code')
    act(() => {
      stdin.write('\u001b[B')
    })
    act(() => {
      stdin.write('\u001b[B')
    })
    act(() => {
      stdin.write('\u001b[B')
    })
    act(() => {
      stdin.write('\u001b[C')
    })
    act(() => {
      stdin.write('\r')
    })
    await sleep(20)
    expect(api.setDefaultPreset).toHaveBeenLastCalledWith('standard')
    expect(onClose).toHaveBeenCalledTimes(1)
  })
})
