import { Box } from 'ink'
import { render } from 'ink-testing-library'
import { describe, expect, it, vi } from 'vitest'
import { ApprovalPanel, APPROVAL_BUTTON_COLS } from '../src/ui/panels/approval-panel.tsx'
import type { PanelPointerHandle } from '../src/ui/panels/approval-panel.tsx'

const WIDTH = 80
const INNER = WIDTH - 8
const BLOCK = WIDTH - 4

async function settle(): Promise<void> {
  await new Promise(resolve => setTimeout(resolve, 20))
}

describe('approval panel', () => {
  it('renders reason, command and both buttons with focus on allow once', async () => {
    const decide = vi.fn()
    const { lastFrame, stdin } = render(
      <Box width={WIDTH} height={24}>
      <ApprovalPanel
        reason="escalate sandbox to danger-full-access: need network"
        command="npm install left-pad"
        background="#000000"
        active
        columns={WIDTH}
        rows={24}
        innerWidth={INNER}
        blockWidth={BLOCK}
        onDecide={decide}
        onResize={() => {}}
      />
      </Box>,
    )
    await settle()
    const frame = lastFrame() ?? ''
    expect(frame).toContain('escalate sandbox to danger-full-access:')
    expect(frame).toContain('need network')
    expect(frame).toContain('npm install left-pad')
    expect(frame).toContain('Allow once')
    expect(frame).toContain('Reject')
    stdin.write('\r')
    await settle()
    expect(decide).toHaveBeenCalledWith('allowed-once')
  })

  it('switches focus with the arrow keys and rejects on enter', async () => {
    const decide = vi.fn()
    const { lastFrame, stdin } = render(
      <Box width={WIDTH} height={24}>
      <ApprovalPanel
        reason="reason"
        command="cmd"
        background="#000000"
        active
        columns={WIDTH}
        rows={24}
        innerWidth={INNER}
        blockWidth={BLOCK}
        onDecide={decide}
        onResize={() => {}}
      />
      </Box>,
    )
    await settle()
    stdin.write('\u001b[C')
    await settle()
    const frame = lastFrame() ?? ''
    const allowInverse = frame.indexOf('\u001b[7m Allow once')
    const rejectInverse = frame.indexOf('\u001b[7m Reject')
    expect(rejectInverse).toBeGreaterThanOrEqual(0)
    expect(allowInverse).toBe(-1)
    stdin.write('\r')
    await settle()
    expect(decide).toHaveBeenCalledWith('rejected')
  })

  it('omits the command section when no command is available', async () => {
    const { lastFrame } = render(
      <Box width={WIDTH} height={24}>
      <ApprovalPanel
        reason="short reason"
        background="#000000"
        active
        columns={WIDTH}
        rows={24}
        innerWidth={INNER}
        blockWidth={BLOCK}
        onDecide={() => {}}
        onResize={() => {}}
      />
      </Box>,
    )
    await settle()
    const frame = lastFrame() ?? ''
    const textLines = frame
      .split('\n')
      .map(line => line.replace(/\u001b\[[0-9;?]*[A-Za-z]/g, ''))
      .filter(line => line.trim() !== '')
    expect(textLines.length).toBe(4)
    expect(textLines[0]).toContain('▄▄▄▄')
    expect(textLines[1]).toContain('short reason')
    expect(textLines[2]).toContain('Allow once')
    expect(textLines[3]).toContain('▀▀▀▀')
  })

  it('scrolls an overflowing reason with the arrow keys', async () => {
    const words = Array.from({ length: 40 }, (_, i) => `token${String(i).padStart(2, '0')}`).join(' ')
    const { lastFrame, stdin } = render(
      <Box width={WIDTH} height={24}>
        <ApprovalPanel
          reason={words}
          background="#000000"
          active
          columns={WIDTH}
          rows={24}
          innerWidth={INNER}
          blockWidth={BLOCK}
          onDecide={() => {}}
          onResize={() => {}}
        />
      </Box>,
    )
    await settle()
    const before = (lastFrame() ?? '').replace(/\u001b\[[0-9;?]*[A-Za-z]/g, '')
    expect(before).toContain('token00')
    expect(before).not.toContain('token39')
    stdin.write('\u001b[B')
    await settle()
    stdin.write('\u001b[B')
    await settle()
    const after = (lastFrame() ?? '').replace(/\u001b\[[0-9;?]*[A-Za-z]/g, '')
    expect(after).not.toContain('token00')
    expect(after).toContain('token39')
  })

  it('decides from the clicked button regardless of keyboard focus', async () => {
    const decide = vi.fn()
    const handle: { current: PanelPointerHandle | null } = { current: null }
    const { stdin } = render(
      <Box width={WIDTH} height={24}>
        <ApprovalPanel
          reason="reason"
          command="cmd"
          background="#000000"
          active
          columns={WIDTH}
          rows={24}
          innerWidth={INNER}
          blockWidth={BLOCK}
          onDecide={decide}
          onResize={() => {}}
          handleRef={handle}
        />
      </Box>,
    )
    await settle()
    const buttonY = 24 - 2 - 5 + 5 - 1
    handle.current?.clickAt(buttonY, APPROVAL_BUTTON_COLS.allow + 2)
    handle.current?.clickAt(buttonY, APPROVAL_BUTTON_COLS.reject + 2)
    expect(decide).toHaveBeenNthCalledWith(1, 'allowed-once')
    expect(decide).toHaveBeenNthCalledWith(2, 'rejected')
    decide.mockClear()
    stdin.write('\u001b[C')
    await settle()
    handle.current?.clickAt(buttonY, APPROVAL_BUTTON_COLS.allow + 2)
    handle.current?.clickAt(buttonY, APPROVAL_BUTTON_COLS.reject + 2)
    expect(decide).toHaveBeenNthCalledWith(1, 'allowed-once')
    expect(decide).toHaveBeenNthCalledWith(2, 'rejected')
  })
})
