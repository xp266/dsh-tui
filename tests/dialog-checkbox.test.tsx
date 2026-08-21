import { render } from 'ink-testing-library'
import { Box } from 'ink'
import { describe, expect, it } from 'vitest'
import { Dialog } from '../src/ui/dialog/dialog.tsx'
import type { DialogRow } from '../src/ui/dialog/dialog.tsx'

function stripAnsi(text: string): string {
  return text.replace(/\x1b\[[0-9;]*[A-Za-z]/g, '')
}

function checkboxRow(label: string, checked: boolean): DialogRow {
  return { items: [{ type: 'checkbox', label, checked, onToggle: () => {}, onConfirm: () => {} }] }
}

function frameWith(rows: DialogRow[]): string {
  const { lastFrame } = render(
    <Box width={80} height={24}>
      <Dialog width={60} maxHeight={22} title="Select Models" rows={rows} onClose={() => {}} />
    </Box>,
  )
  return lastFrame() ?? ''
}

function lineOf(frame: string, text: string): string {
  return stripAnsi(frame).split('\n').find(line => line.includes(text)) ?? ''
}

describe('dialog checkbox checkmark', () => {
  it('right-aligns the check mark identically for focused and unfocused rows', () => {
    const focusedLine = lineOf(frameWith([checkboxRow('model-a', true)]), 'model-a')
    const unfocusedLine = lineOf(frameWith([checkboxRow('other', false), checkboxRow('model-a', true)]), 'model-a')
    expect(focusedLine.trimEnd().endsWith('\u2713')).toBe(true)
    expect(unfocusedLine.trimEnd().endsWith('\u2713')).toBe(true)
    expect(unfocusedLine.trimEnd()).toBe(focusedLine.trimEnd())
  })

  it('renders no check mark for unchecked rows', () => {
    expect(stripAnsi(frameWith([checkboxRow('model-b', false)]))).not.toContain('\u2713')
  })
})

describe('dialog wrapped input', () => {
  it('wraps a long value across multiple background rows instead of truncating', () => {
    const rows: DialogRow[] = [
      { items: [{ type: 'input', label: 'API URL', value: 'https://example.com/' + 'a'.repeat(120), onChange: () => {} }] },
    ]
    const frame = stripAnsi(frameWith(rows))
    expect(frame).toContain('https://example.com/')
    expect((frame.match(/a/g) ?? []).length).toBeGreaterThanOrEqual(120)
  })
})
