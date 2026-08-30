import { describe, expect, it } from 'vitest'
import { filterHintEntries } from '../src/ui/input/commands.ts'
import type { CommandHintItem } from '../src/ui/input/commands.ts'

const entries: CommandHintItem[] = [
  { command: '/models', description: 'Open model selection' },
  { command: '/reasoning-effort', description: "Select the current model's reasoning effort" },
  { command: '/presets', description: 'Choose an agent preset' },
  { command: '/sessions', description: 'Open session picker' },
  { command: '/plan', description: 'Toggle plan mode', hint: '[off]' },
]

const names = (value: string): string[] => filterHintEntries(entries, value).map(entry => entry.command)

describe('command hint filtering', () => {
  it('matches command names by in-order subsequence', () => {
    expect(names('/md')).toEqual(['/models'])
    expect(names('/st')).toContain('/presets')
    expect(names('/os')).toContain('/models')
    expect(names('/os')).toContain('/sessions')
  })

  it('rejects out-of-order command name queries', () => {
    expect(names('/dm')).toEqual([])
    expect(names('/odm')).toEqual([])
  })

  it('matches descriptions by contiguous substring', () => {
    expect(names('/mod')).toEqual(['/models', '/reasoning-effort', '/plan'])
    expect(names('/mode')).toEqual(['/models', '/reasoning-effort', '/plan'])
    expect(names('/picker')).toEqual(['/sessions'])
  })

  it('never matches through the description with scattered letters', () => {
    expect(names('/md')).not.toContain('/reasoning-effort')
    expect(names('/pnst')).toEqual([])
  })

  it('does not match hint arguments', () => {
    expect(names('/off')).not.toContain('/plan')
  })

  it('keeps case-insensitive behavior and ranks prefixes first', () => {
    expect(names('/MD')).toEqual(['/models'])
    expect(names('/MODELS')).toEqual(['/models'])
    expect(names('/mo')).toEqual(['/models', '/reasoning-effort', '/plan'])
  })

  it('returns every entry in original order for a bare slash', () => {
    expect(names('/')).toEqual(['/models', '/reasoning-effort', '/presets', '/sessions', '/plan'])
  })

  it('returns nothing for non-command or spaced input', () => {
    expect(names('models')).toEqual([])
    expect(names('/models x')).toEqual([])
  })
})
