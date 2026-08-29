import { act } from 'react'
import { render } from 'ink-testing-library'
import { Box } from 'ink'
import { describe, expect, it } from 'vitest'
import { Dialog } from '../src/ui/dialog/dialog.tsx'
import type { DialogRow } from '../src/ui/dialog/dialog.tsx'

function rows(count: number): DialogRow[] {
  return Array.from({ length: count }, (_, i) => ({
    items: [{ type: 'button', label: `item-${i}`, onPress: () => {} }],
  }))
}

function frameWith(maxHeight: number): React.ReactElement {
  return (
    <Box width={100} height={24}>
      <Dialog width={60} maxHeight={maxHeight} title="t" rows={rows(10)} onClose={() => {}} />
    </Box>
  )
}

describe('dialog scroll on resize', () => {
  it('reveals rows scrolled out of a smaller viewport when the window grows', () => {
    const { lastFrame, stdin, rerender } = render(frameWith(0.25))
    for (let i = 0; i < 9; i++) {
      act(() => {
        stdin.write('\u001b[B')
      })
    }
    const shrunk = lastFrame() ?? ''
    expect(shrunk).toContain('item-9')
    expect(shrunk).not.toContain('item-0')
    rerender(frameWith(0.6))
    const grown = lastFrame() ?? ''
    expect(grown).toContain('item-0')
    expect(grown).toContain('item-9')
  })

  it('clamps the window to the terminal width', () => {
    const { lastFrame } = render(
      <Box width={100} height={24}>
        <Dialog width={140} maxHeight={0.6} title="t" rows={rows(10)} onClose={() => {}} />
      </Box>,
    )
    expect(lastFrame() ?? '').toContain('item-0')
  })
})
