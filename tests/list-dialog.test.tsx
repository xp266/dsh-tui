import { act } from 'react'
import { render } from 'ink-testing-library'
import { Box } from 'ink'
import { describe, expect, it, vi } from 'vitest'
import type { SessionSummary } from '../src/chat/session-list.ts'
import { SessionsDialog } from '../src/ui/dialog/sessions-dialog.tsx'

function sessions(): SessionSummary[] {
  const now = Date.now()
  return [
    { id: 's1', name: 'Alpha', directory: '/w', ungrouped: false, updatedAt: 1, modifiedAt: now - 60_000 },
    { id: 's2', name: 'Beta', directory: '/other', ungrouped: true, updatedAt: 2, modifiedAt: now - 40 * 24 * 60 * 60 * 1000 },
  ]
}

async function until(check: () => boolean, timeoutMs = 2000): Promise<void> {
  const start = Date.now()
  while (!check()) {
    if (Date.now() - start > timeoutMs) throw new Error('condition not met before timeout')
    await new Promise(resolve => setTimeout(resolve, 10))
  }
}

async function untilFocused(lastFrame: () => string | undefined, label: string): Promise<void> {
  await until(() => {
    const frame = lastFrame() ?? ''
    return frame.includes(label) && frame.includes('\x1b[7m')
  })
}

describe('list dialog', () => {
  it('loads rows and selects the focused item with enter', async () => {
    const selected: string[] = []
    const api = {
      listSessions: vi.fn(async () => sessions()),
      openSession: vi.fn(async () => {}),
      archiveSession: vi.fn(async () => {}),
      activeSessionId: () => '',
      newSession: vi.fn(async () => {}),
    }
    const { lastFrame, stdin } = render(
      <Box width={100} height={24}>
        <SessionsDialog api={api} onClose={() => {}} onSessionSelected={session => selected.push(session.id)} />
      </Box>,
    )
    await untilFocused(lastFrame, 'Alpha')
    const frame = lastFrame() ?? ''
    expect(frame).toContain('Recent')
    expect(frame).toContain('Today')
    expect(frame).toContain('Other')
    expect(frame).toContain('Ungrouped')
    act(() => {
      stdin.write('\r')
    })
    await until(() => api.openSession.mock.calls.length > 0)
    expect(api.openSession).toHaveBeenCalledWith('s1')
    expect(selected).toEqual(['s1'])
  })

  it('skips group headers when moving down', async () => {
    const api = {
      listSessions: vi.fn(async () => sessions()),
      openSession: vi.fn(async () => {}),
      archiveSession: vi.fn(async () => {}),
      activeSessionId: () => '',
      newSession: vi.fn(async () => {}),
    }
    const { lastFrame, stdin } = render(
      <Box width={100} height={24}>
        <SessionsDialog api={api} onClose={() => {}} onSessionSelected={() => {}} />
      </Box>,
    )
    await untilFocused(lastFrame, 'Alpha')
    act(() => {
      stdin.write('\u001b[B')
    })
    act(() => {
      stdin.write('\r')
    })
    await until(() => api.openSession.mock.calls.length > 0)
    expect(api.openSession).toHaveBeenCalledWith('s2')
    expect(lastFrame() ?? '').toContain('Beta')
  })

  it('shows the loading footer until the load resolves', async () => {
    let resolveLoad: ((items: SessionSummary[]) => void) | undefined
    const api = {
      listSessions: vi.fn(() => new Promise<SessionSummary[]>(resolve => {
        resolveLoad = resolve
      })),
      openSession: vi.fn(async () => {}),
      archiveSession: vi.fn(async () => {}),
      activeSessionId: () => '',
      newSession: vi.fn(async () => {}),
    }
    const { lastFrame } = render(
      <Box width={100} height={24}>
        <SessionsDialog api={api} onClose={() => {}} onSessionSelected={() => {}} />
      </Box>,
    )
    await until(() => (lastFrame() ?? '').includes('loading'))
    act(() => {
      resolveLoad?.(sessions())
    })
    await until(() => (lastFrame() ?? '').includes('Alpha'))
  })

  it('surfaces load failures in the footer', async () => {
    const api = {
      listSessions: vi.fn(async () => {
        throw new Error('boom')
      }),
      openSession: vi.fn(async () => {}),
      archiveSession: vi.fn(async () => {}),
      activeSessionId: () => '',
      newSession: vi.fn(async () => {}),
    }
    const { lastFrame } = render(
      <Box width={100} height={24}>
        <SessionsDialog api={api} onClose={() => {}} onSessionSelected={() => {}} />
      </Box>,
    )
    await until(() => (lastFrame() ?? '').includes('boom'))
  })
})
