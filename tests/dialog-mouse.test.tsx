import { act } from 'react'
import { render } from 'ink-testing-library'
import { Box } from 'ink'
import { describe, expect, it, vi } from 'vitest'
import { Dialog } from '../src/ui/dialog/dialog.tsx'
import type { DialogHandle, DialogRow } from '../src/ui/dialog/dialog.tsx'

const WIDTH = 100
const HEIGHT = 24

function buttonRows(count: number, onPress: (index: number) => void): DialogRow[] {
  return Array.from({ length: count }, (_, i) => ({
    items: [{ type: 'button', label: `action-${i}`, onPress: () => onPress(i) }],
  }))
}

function actionsRow(onConfirm: () => void, onCancel: () => void): DialogRow {
  return { items: [{ type: 'actions', confirmLabel: 'Submit', cancelLabel: 'Cancel', onConfirm, onCancel }] }
}

function rowY(rowsCount: number, index: number): number {
  const windowHeight = rowsCount + 2 + 2
  const top = Math.floor((HEIGHT - windowHeight) / 2)
  return top + 1 + 2 + index
}

async function flush(): Promise<void> {
  await new Promise(resolve => setTimeout(resolve, 0))
}

function renderDialog(rows: DialogRow[]): { handle(): DialogHandle | null } {
  const ref: { current: DialogHandle | null } = { current: null }
  render(
    <Box width={WIDTH} height={HEIGHT}>
      <Dialog ref={ref} width={60} maxHeight={22} title="t" rows={rows} onClose={() => {}} />
    </Box>,
  )
  return { handle: () => ref.current }
}

describe('dialog mouse confirm', () => {
  it('activates a focused button on the second click', async () => {
    const onPress = vi.fn()
    const { handle } = renderDialog(buttonRows(3, onPress))
    act(() => {
      handle()?.clickAt(rowY(3, 1), 25)
    })
    await flush()
    expect(onPress).not.toHaveBeenCalled()
    act(() => {
      handle()?.clickAt(rowY(3, 1), 25)
    })
    expect(onPress).toHaveBeenCalledTimes(1)
    expect(onPress).toHaveBeenCalledWith(1)
  })

  it('only focuses an unfocused button on the first click', async () => {
    const onPress = vi.fn()
    const { handle } = renderDialog(buttonRows(3, onPress))
    act(() => {
      handle()?.clickAt(rowY(3, 2), 25)
    })
    await flush()
    expect(onPress).not.toHaveBeenCalled()
  })

  it('confirms a focused checkbox on the second click', async () => {
    const onToggle = vi.fn()
    const onConfirm = vi.fn()
    const { handle } = renderDialog([
      { items: [{ type: 'checkbox', label: 'a', checked: false, onToggle, onConfirm }] },
      { items: [{ type: 'checkbox', label: 'b', checked: false, onToggle, onConfirm }] },
    ])
    act(() => {
      handle()?.clickAt(rowY(2, 1), 25)
    })
    await flush()
    expect(onConfirm).not.toHaveBeenCalled()
    expect(onToggle).not.toHaveBeenCalled()
    act(() => {
      handle()?.clickAt(rowY(2, 1), 25)
    })
    expect(onConfirm).toHaveBeenCalledTimes(1)
  })

  it('moves focus with the wheel inside the window and reports outside misses', async () => {
    const onPress = vi.fn()
    const { handle } = renderDialog(buttonRows(4, onPress))
    act(() => {
      handle()?.clickAt(rowY(4, 2), 25)
    })
    await flush()
    expect(handle()?.wheelAt(rowY(4, 2), -1)).toBe(true)
    await flush()
    expect(handle()?.wheelAt(0, 1)).toBe(false)
    act(() => {
      handle()?.clickAt(rowY(4, 1), 25)
    })
    expect(onPress).toHaveBeenCalledWith(1)
  })

  it('triggers Submit or Cancel directly on click', async () => {
    const onConfirm = vi.fn()
    const onCancel = vi.fn()
    const { handle } = renderDialog([actionsRow(onConfirm, onCancel)])
    const y = rowY(1, 0)
    act(() => {
      handle()?.clickAt(y, 33)
    })
    await flush()
    expect(onConfirm).toHaveBeenCalledTimes(1)
    expect(onCancel).not.toHaveBeenCalled()
    act(() => {
      handle()?.clickAt(y, 63)
    })
    expect(onCancel).toHaveBeenCalledTimes(1)
  })

  it('focuses the actions row without triggering between labels', async () => {
    const onConfirm = vi.fn()
    const onCancel = vi.fn()
    const { handle } = renderDialog([actionsRow(onConfirm, onCancel)])
    act(() => {
      handle()?.clickAt(rowY(1, 0), 22)
    })
    await flush()
    expect(onConfirm).not.toHaveBeenCalled()
    expect(onCancel).not.toHaveBeenCalled()
  })

  it('ignores clicks on group headers while items stay clickable', async () => {
    const onPress = vi.fn()
    const { handle } = renderDialog([
      { items: [{ type: 'header', label: 'Recent' }] },
      { items: [{ type: 'button', label: 'item-a', onPress: () => onPress('a') }] },
    ])
    act(() => {
      handle()?.clickAt(rowY(2, 0), 25)
    })
    await flush()
    expect(onPress).not.toHaveBeenCalled()
    act(() => {
      handle()?.clickAt(rowY(2, 1), 25)
    })
    await flush()
    act(() => {
      handle()?.clickAt(rowY(2, 1), 25)
    })
    expect(onPress).toHaveBeenCalledWith('a')
  })
})
