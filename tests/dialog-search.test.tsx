import { act } from 'react'
import { render } from 'ink-testing-library'
import { Box } from 'ink'
import { describe, expect, it } from 'vitest'
import { useEffect, useState } from 'react'
import { Dialog } from '../src/ui/dialog/dialog.tsx'
import type { DialogHandle, DialogRow } from '../src/ui/dialog/dialog.tsx'

function rows(count: number): DialogRow[] {
  return Array.from({ length: count }, (_, i) => ({
    items: [{ type: 'button' as const, label: `item-${i}`, onPress: () => {} }],
  }))
}

function AsyncRows({ loaded }: { loaded: boolean }) {
  const [list, setList] = useState<DialogRow[]>([])
  useEffect(() => {
    if (loaded) setList(rows(6))
  }, [loaded])
  return (
    <Box width={100} height={24}>
      <Dialog width={60} maxHeight={22} title="list" rows={list} onClose={() => {}} search />
    </Box>
  )
}

function focusedSegment(frame: string): string {
  return frame.match(/\x1b\[7m([^\x1b]*)/)?.[1] ?? ''
}

function renderSearch(rows: DialogRow[]) {
  return render(
    <Box width={100} height={24}>
      <Dialog width={60} maxHeight={22} title="list" rows={rows} onClose={() => {}} search />
    </Box>,
  )
}

describe('dialog search', () => {
  it('starts focused on the first item instead of the search row', () => {
    const { lastFrame } = renderSearch(rows(3))
    expect(focusedSegment(lastFrame() ?? '')).toContain('item-0')
  })

  it('accepts typing into the search box while focus stays on the first item', () => {
    const { lastFrame, stdin } = renderSearch(rows(3))
    act(() => {
      stdin.write('it')
    })
    const frame = lastFrame() ?? ''
    expect(frame).toContain('it')
    expect(focusedSegment(frame)).toContain('item-0')
  })

  it('places the search caret on click and inserts at that spot', () => {
    const ref: { current: DialogHandle | null } = { current: null }
    const { lastFrame, stdin } = render(
      <Box width={100} height={24}>
        <Dialog ref={ref} width={60} maxHeight={22} title="list" rows={rows(1)} onClose={() => {}} search />
      </Box>,
    )
    act(() => {
      stdin.write('ab')
    })
    expect(lastFrame() ?? '').toContain('ab')
    act(() => {
      ref.current?.clickAt(12, 21)
    })
    act(() => {
      stdin.write('Z')
    })
    expect(lastFrame() ?? '').toContain('aZb')
  })

  it('filters rows by the typed search text', () => {
    const { lastFrame, stdin } = renderSearch(rows(3))
    act(() => {
      stdin.write('item-2')
    })
    const frame = lastFrame() ?? ''
    expect(frame).toContain('item-2')
    expect(frame).not.toContain('item-1')
  })

  it('navigates below the search row with arrow keys', () => {
    const { lastFrame, stdin } = renderSearch(rows(3))
    act(() => {
      stdin.write('\u001b[B')
    })
    expect(focusedSegment(lastFrame() ?? '')).toContain('item-1')
    act(() => {
      stdin.write('\u001b[B')
    })
    expect(focusedSegment(lastFrame() ?? '')).toContain('item-2')
    act(() => {
      stdin.write('\u001b[A')
    })
    expect(focusedSegment(lastFrame() ?? '')).toContain('item-1')
  })

  it('handles kitty-style arrow sequences that ink fails to parse', () => {
    const { lastFrame, stdin } = renderSearch(rows(3))
    act(() => {
      stdin.write('\u001b[1;2B')
    })
    expect(focusedSegment(lastFrame() ?? '')).toContain('item-1')
    act(() => {
      stdin.write('\u001b[2B')
    })
    expect(focusedSegment(lastFrame() ?? '')).toContain('item-2')
    act(() => {
      stdin.write('\u001b[1;2A')
    })
    expect(focusedSegment(lastFrame() ?? '')).toContain('item-1')
  })

  it('navigates into rows that load after mount', () => {
    const { lastFrame, stdin, rerender } = render(<AsyncRows loaded={false} />)
    act(() => {
      rerender(<AsyncRows loaded={true} />)
    })
    act(() => {})
    expect(lastFrame() ?? '').toContain('item-5')
    act(() => {
      stdin.write('\u001b[B')
    })
    expect(focusedSegment(lastFrame() ?? '')).toContain('item-1')
    act(() => {
      stdin.write('\u001b[B')
    })
    expect(focusedSegment(lastFrame() ?? '')).toContain('item-2')
    act(() => {
      stdin.write('\u001b[B')
    })
    expect(focusedSegment(lastFrame() ?? '')).toContain('item-3')
  })

  it('keeps accepting input when the search has no matches', () => {
    const { lastFrame, stdin } = renderSearch(rows(3))
    act(() => {
      stdin.write('zzz')
    })
    let frame = lastFrame() ?? ''
    expect(frame).toContain('zzz')
    expect(frame).not.toContain('item-0')
    act(() => {
      stdin.write('y')
    })
    frame = lastFrame() ?? ''
    expect(frame).toContain('zzzy')
    act(() => {
      stdin.write('\u007f')
    })
    frame = lastFrame() ?? ''
    expect(frame).toContain('zzz')
    expect(frame).not.toContain('zzzy')
    act(() => {
      stdin.write('\u007f')
    })
    act(() => {
      stdin.write('\u007f')
    })
    act(() => {
      stdin.write('\u007f')
    })
    frame = lastFrame() ?? ''
    expect(frame).toContain('item-0')
  })
})