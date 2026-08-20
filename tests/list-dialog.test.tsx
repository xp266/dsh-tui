import { act } from 'react'
import { render } from 'ink-testing-library'
import { Box } from 'ink'
import { describe, expect, it, vi } from 'vitest'
import type { SessionSummary } from '../src/chat/session-list.ts'
import { SessionsDialog } from '../src/ui/dialog/sessions-dialog.tsx'

function sessions(): SessionSummary[] {
  return [
    { id: 's1', name: 'Alpha', directory: '/w', ungrouped: false, updatedAt: 1 },
    { id: 's2', name: 'Beta', directory: '/other', ungrouped: true, updatedAt: 2 },
  ]
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

describe('list dialog', () => {
  it('loads rows and selects the focused item with enter', async () => {
    const selected: string[] = []
    const api = {
      listSessions: vi.fn(async () => sessions()),
      openSession: vi.fn(async () => {}),
    }
    const { lastFrame, stdin } = render(
      <Box width={100} height={24}>
        <SessionsDialog api={api} onClose={() => {}} onSessionSelected={session => selected.push(session.id)} />
      </Box>,
    )
    await sleep(20)
    const frame = lastFrame() ?? ''
    expect(frame).toContain('Alpha')
    expect(frame).toContain('Ungrouped')
    act(() => {
      stdin.write('\r')
    })
    await sleep(20)
    expect(api.openSession).toHaveBeenCalledWith('s1')
    expect(selected).toEqual(['s1'])
  })

  it('shows the loading footer until the load resolves', async () => {
    let resolveLoad: ((items: SessionSummary[]) => void) | undefined
    const api = {
      listSessions: vi.fn(() => new Promise<SessionSummary[]>(resolve => {
        resolveLoad = resolve
      })),
      openSession: vi.fn(async () => {}),
    }
    const { lastFrame } = render(
      <Box width={100} height={24}>
        <SessionsDialog api={api} onClose={() => {}} onSessionSelected={() => {}} />
      </Box>,
    )
    expect(lastFrame() ?? '').toContain('loading')
    act(() => {
      resolveLoad?.(sessions())
    })
    await sleep(20)
    expect(lastFrame() ?? '').toContain('Alpha')
  })

  it('surfaces load failures in the footer', async () => {
    const api = {
      listSessions: vi.fn(async () => {
        throw new Error('boom')
      }),
      openSession: vi.fn(async () => {}),
    }
    const { lastFrame } = render(
      <Box width={100} height={24}>
        <SessionsDialog api={api} onClose={() => {}} onSessionSelected={() => {}} />
      </Box>,
    )
    await sleep(20)
    expect(lastFrame() ?? '').toContain('boom')
  })
})