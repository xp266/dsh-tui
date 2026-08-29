import { act } from 'react'
import { render } from 'ink-testing-library'
import { Box } from 'ink'
import { describe, expect, it } from 'vitest'
import { Dialog } from '../src/ui/dialog/dialog.tsx'
import type { DialogFooterLine, DialogHandle, DialogRow } from '../src/ui/dialog/dialog.tsx'

function rows(): DialogRow[] {
  return [{ items: [{ type: 'button', label: 'row', onPress: () => {} }] }]
}

function stripAnsi(text: string): string {
  return text.replace(/\x1b\[[0-9;]*[A-Za-z]/g, '')
}

function xCount(frame: string): number {
  return (stripAnsi(frame).match(/x/g) ?? []).length
}

function renderErrors(errors: DialogFooterLine[] | undefined) {
  return render(
    <Box width={100} height={24}>
      <Dialog width={60} maxHeight={0.6} title="t" rows={rows()} errors={errors} onClose={() => {}} />
    </Box>,
  )
}

describe('dialog error window', () => {
  it('renders below the dialog with one blank row and keeps the window fixed', () => {
    const plain = stripAnsi(renderErrors(undefined).lastFrame() ?? '')
    const withError = stripAnsi(renderErrors([{ text: 'boom' }]).lastFrame() ?? '')
    const rowLine = (frame: string) => frame.split('\n').findIndex(line => line.includes('row'))
    expect(rowLine(withError)).toBe(rowLine(plain))
    const boom = withError.split('\n').findIndex(line => line.includes('boom'))
    expect(boom - rowLine(withError)).toBe(2)
  })

  it('shows long errors without truncation', () => {
    const { lastFrame } = renderErrors([{ text: 'x'.repeat(150) }])
    expect(xCount(lastFrame() ?? '')).toBe(150)
  })

  it('caps at three rows and scrolls with the wheel', () => {
    const ref: { current: DialogHandle | null } = { current: null }
    const { lastFrame } = render(
      <Box width={100} height={24}>
        <Dialog
          ref={ref}
          width={60}
          maxHeight={0.6}
          title="t"
          rows={rows()}
          errors={[{ text: 'x'.repeat(500) }]}
          onClose={() => {}}
        />
      </Box>,
    )
    expect(xCount(lastFrame() ?? '')).toBe(168)
    let handled = false
    act(() => {
      handled = ref.current?.wheelAt(15, 1) ?? false
    })
    expect(handled).toBe(true)
    expect(xCount(lastFrame() ?? '')).toBe(168)
    for (let i = 0; i < 6; i++) {
      act(() => {
        ref.current?.wheelAt(15, 1)
      })
    }
    expect(xCount(lastFrame() ?? '')).toBe(164)
    act(() => {
      handled = ref.current?.wheelAt(20, 1) ?? false
    })
    expect(handled).toBe(false)
  })

  it('disappears when the errors clear', () => {
    const view = renderErrors([{ text: 'boom' }])
    expect(stripAnsi(view.lastFrame() ?? '')).toContain('boom')
    view.rerender(
      <Box width={100} height={24}>
        <Dialog width={60} maxHeight={0.6} title="t" rows={rows()} errors={undefined} onClose={() => {}} />
      </Box>,
    )
    expect(stripAnsi(view.lastFrame() ?? '')).not.toContain('boom')
  })
})
