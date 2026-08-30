import { describe, expect, it } from 'vitest'
import { groupSessions } from '../src/chat/session-groups.ts'
import type { SessionSummary } from '../src/chat/session-list.ts'

const NOW = new Date('2026-08-21T15:00:00').getTime()
const DAY_MS = 24 * 60 * 60 * 1000

function dayStart(offsetDays = 0): number {
  const date = new Date(NOW)
  date.setHours(0, 0, 0, 0)
  return date.getTime() - offsetDays * DAY_MS
}

function session(id: string, modifiedAt?: number, updatedAt = 0): SessionSummary {
  const base: SessionSummary = { id, name: id, directory: '/w', ungrouped: false, updatedAt }
  return modifiedAt === undefined ? base : { ...base, modifiedAt }
}

describe('session grouping', () => {
  it('buckets by the seven-day window', () => {
    const sections = groupSessions([
      session('today-edge', dayStart()),
      session('week-latest', dayStart() - 1),
      session('week-edge', dayStart(7)),
      session('older', dayStart(7) - 1),
    ], NOW)
    expect(sections.map(section => section.kind)).toEqual(['recent', 'week', 'older'])
    expect(sections[1]!.items.map(item => item.id)).toEqual(['today-edge', 'week-latest', 'week-edge'])
    expect(sections[2]!.items.map(item => item.id)).toEqual(['older'])
  })

  it('caps Recent at five entries while keeping them in their groups', () => {
    const items = Array.from({ length: 6 }, (_, index) => session(`s${index}`, NOW - (index + 1) * 1000))
    const sections = groupSessions(items, NOW)
    expect(sections).toHaveLength(2)
    expect(sections[0]!.kind).toBe('recent')
    expect(sections[0]!.items.map(item => item.id)).toEqual(['s0', 's1', 's2', 's3', 's4'])
    expect(sections[1]!.kind).toBe('week')
    expect(sections[1]!.items).toHaveLength(6)
  })

  it('falls back to updatedAt when modifiedAt is missing', () => {
    const sections = groupSessions([
      session('fresh', undefined, NOW - 1000),
      session('stale', undefined, dayStart(30)),
    ], NOW)
    expect(sections.map(section => section.kind)).toEqual(['recent', 'week', 'older'])
    expect(sections[1]!.items.map(item => item.id)).toEqual(['fresh'])
    expect(sections[2]!.items.map(item => item.id)).toEqual(['stale'])
  })

  it('omits empty groups and returns nothing for an empty list', () => {
    expect(groupSessions([], NOW)).toEqual([])
    const sections = groupSessions([session('old', dayStart(40))], NOW)
    expect(sections.map(section => section.kind)).toEqual(['recent', 'older'])
  })

  it('sorts each section newest first regardless of input order', () => {
    const sections = groupSessions([
      session('a', dayStart() - 3000),
      session('b', dayStart() - 1000),
      session('c', dayStart() - 2000),
    ], NOW)
    for (const section of sections) {
      expect(section.items.map(item => item.id)).toEqual(['b', 'c', 'a'])
    }
  })
})
