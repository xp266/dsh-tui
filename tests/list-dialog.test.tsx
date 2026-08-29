import { act } from 'react'
import { render } from 'ink-testing-library'
import { Box } from 'ink'
import { describe, expect, it, vi } from 'vitest'
import type { SessionSummary } from '../src/chat/session-list.ts'
import type { DialogHandle } from '../src/ui/dialog/dialog.tsx'
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
    expect(frame).toContain('Ungrouped')
    for (let i = 0; i < 4; i++) {
      act(() => {
        stdin.write('\u001b[B')
      })
      await new Promise(resolve => setTimeout(resolve, 10))
    }
    expect(lastFrame() ?? '').toContain('Other')
    for (let i = 0; i < 4; i++) {
      act(() => {
        stdin.write('\u001b[A')
      })
      await new Promise(resolve => setTimeout(resolve, 10))
    }
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

  it('arms only the focused row when a session appears in several sections', async () => {
    const now = Date.now()
    const hour = 60 * 60 * 1000
    const items: SessionSummary[] = [
      { id: 'aaa', name: 'aaa', directory: '/w', ungrouped: false, updatedAt: 1, modifiedAt: now - hour },
      { id: 'bbb', name: 'bbb', directory: '/w', ungrouped: false, updatedAt: 1, modifiedAt: now - 2 * hour },
    ]
    const api = {
      listSessions: vi.fn(async () => items),
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
    await untilFocused(lastFrame, 'aaa')
    act(() => {
      stdin.write('\u0004')
    })
    await until(() => (lastFrame() ?? '').includes('Press Ctrl+D again'))
    const frame = lastFrame() ?? ''
    const lines = frame.split('\n')
    expect(lines.filter(line => line.includes('Press Ctrl+D again')).length).toBe(1)
    expect(lines.some(line => line.includes('aaa') && line.includes('/w'))).toBe(true)
    act(() => {
      stdin.write('\u0004')
    })
    await until(() => api.archiveSession.mock.calls.length > 0)
    expect(api.archiveSession).toHaveBeenCalledWith('aaa')
  })

  it('keeps section headers attached to their items while scrolling', async () => {
    const now = Date.now()
    const hour = 60 * 60 * 1000
    const day = 24 * hour
    const items: SessionSummary[] = [
      ...Array.from({ length: 6 }, (_, i) => ({ id: `t${i}`, name: `Task-${i}`, directory: '/w', ungrouped: false, updatedAt: 1, modifiedAt: now - (i + 1) * hour })),
      ...Array.from({ length: 4 }, (_, i) => ({ id: `w${i}`, name: `Week-${i}`, directory: '/w', ungrouped: false, updatedAt: 1, modifiedAt: now - (2 + i) * day })),
      ...Array.from({ length: 6 }, (_, i) => ({ id: `o${i}`, name: `Old-${i}`, directory: '/w', ungrouped: false, updatedAt: 1, modifiedAt: now - (10 + i * 3) * day })),
    ]
    const api = {
      listSessions: vi.fn(async () => items),
      openSession: vi.fn(async () => {}),
      archiveSession: vi.fn(async () => {}),
      activeSessionId: () => '',
      newSession: vi.fn(async () => {}),
    }
    const ref: { current: DialogHandle | null } = { current: null }
    const { lastFrame } = render(
      <Box width={100} height={24}>
        <SessionsDialog ref={ref} api={api} onClose={() => {}} onSessionSelected={() => {}} />
      </Box>,
    )
    await untilFocused(lastFrame, 'Task-0')
    const headers = ['Recent', 'Today', 'This Week', 'Other']
    const gaps: Record<string, number> = { Recent: 7, Today: 8, 'This Week': 6 }
    const assertHeadersAttached = () => {
      const lines = (lastFrame() ?? '').split('\n').map(line => line.trim())
      const found = new Map<string, number>()
      for (let i = 0; i < lines.length; i++) {
        if (headers.includes(lines[i]!)) found.set(lines[i]!, i)
      }
      for (const [label, gap] of Object.entries(gaps)) {
        const start = found.get(label)
        const next = headers[headers.indexOf(label) + 1]!
        const end = found.get(next)
        if (start !== undefined && end !== undefined) expect(end - start).toBe(gap)
      }
    }
    for (let step = 0; step < 40; step++) {
      act(() => {
        ref.current?.wheelAt(10, 1)
      })
      await new Promise(resolve => setTimeout(resolve, 5))
      assertHeadersAttached()
    }
    for (let step = 0; step < 40; step++) {
      act(() => {
        ref.current?.wheelAt(10, -1)
      })
      await new Promise(resolve => setTimeout(resolve, 5))
      assertHeadersAttached()
    }
  })
})
