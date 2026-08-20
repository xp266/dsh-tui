import { render } from 'ink-testing-library'
import { Box } from 'ink'
import { describe, expect, it } from 'vitest'
import { Dialog } from '../src/ui/dialog/dialog.tsx'
import type { DialogRow } from '../src/ui/dialog/dialog.tsx'

function rows(): DialogRow[] {
  return [{ items: [{ type: 'button', label: 'row', onPress: () => {} }] }]
}

function renderFooter(footer: { text: string; color?: string }[]) {
  return render(
    <Box width={100} height={24}>
      <Dialog width={60} maxHeight={22} title="t" rows={rows()} footer={footer} onClose={() => {}} />
    </Box>,
  )
}

describe('dialog footer', () => {
  it('keeps the window compact when no footer is present', () => {
    const { lastFrame } = render(
      <Box width={100} height={24}>
        <Dialog width={60} maxHeight={22} title="t" rows={rows()} onClose={() => {}} />
      </Box>,
    )
    const frame = lastFrame() ?? ''
    expect(frame).toContain('row')
    expect(frame).not.toContain('error text')
  })

  it('wraps a long footer line without truncating the text', () => {
    const { lastFrame } = renderFooter([{ text: 'x'.repeat(80) }])
    const frame = lastFrame() ?? ''
    expect((frame.match(/x/g) ?? []).length).toBe(80)
  })

  it('caps a footer line at two rows with an ellipsis', () => {
    const { lastFrame } = renderFooter([{ text: 'x'.repeat(200) }])
    const frame = lastFrame() ?? ''
    expect((frame.match(/x/g) ?? []).length).toBe(119)
    expect(frame).toContain('…')
  })

  it('separates the footer from the content with a blank row', () => {
    const { lastFrame } = renderFooter([{ text: 'boom' }])
    const frame = lastFrame() ?? ''
    const lines = frame.split('\n')
    const rowLine = lines.findIndex(line => line.includes('row'))
    const errorLine = lines.findIndex(line => line.includes('boom'))
    expect(errorLine).toBeGreaterThan(rowLine)
  })
})