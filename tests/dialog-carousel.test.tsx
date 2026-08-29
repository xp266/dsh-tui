import { act } from 'react'
import { createRef } from 'react'
import { render } from 'ink-testing-library'
import { Box } from 'ink'
import { describe, expect, it, vi } from 'vitest'
import { Dialog } from '../src/ui/dialog/dialog.tsx'
import type { DialogHandle, DialogRow } from '../src/ui/dialog/dialog.tsx'
import { selectBlock } from '../src/ui/dialog/geometry.ts'

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

const BG_ESCAPE = /\x1b\[48;5;\d+m|\x1b\[48;2;\d+;\d+;\d+m/g

function arrowBackgrounds(frame: string): string[] {
  return frame
    .split('\n')
    .filter(line => line.includes('◀'))
    .map(line => {
      const at = line.indexOf('◀')
      const matches = line.slice(0, at).match(BG_ESCAPE)
      return matches?.at(-1) ?? ''
    })
}

function selectRows(onChangeHandlers: Array<(next: string) => void>): DialogRow[] {
  return [
    { items: [{ type: 'select', label: 'First', value: 'a', options: ['a', 'b'], onChange: onChangeHandlers[0]! }] },
    { items: [{ type: 'select', label: 'Second', value: 'x', options: ['x', 'y'], onChange: onChangeHandlers[1]! }] },
  ]
}

describe('carousel press flash', () => {
  it('lights only the clicked row while another row stays focused', async () => {
    const firstChange = vi.fn()
    const secondChange = vi.fn()
    const ref = createRef<DialogHandle>()
    const { lastFrame } = render(
      <Box width={100} height={24}>
        <Dialog
          ref={ref}
          width={60}
          maxHeight={0.6}
          rows={selectRows([firstChange, secondChange])}
          onClose={() => {}}
        />
      </Box>,
    )
    await sleep(20)
    const before = arrowBackgrounds(lastFrame() ?? '')
    expect(before).toHaveLength(2)
    const block = selectBlock(56, 'x')
    act(() => {
      ref.current?.clickAt(12, 20 + 2 + block.blockStart + 1)
    })
    await sleep(20)
    const after = arrowBackgrounds(lastFrame() ?? '')
    expect(after).toHaveLength(2)
    expect(secondChange).toHaveBeenCalledWith('y')
    expect(firstChange).not.toHaveBeenCalled()
    expect(after[0]).toBe(before[0])
    expect(after[1]).not.toBe(before[1])
  })
})
