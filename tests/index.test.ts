import { describe, expect, it, vi } from 'vitest'
import { render } from 'ink'
import * as plugin from '../src/index.tsx'
import { createTestContext } from './harness.ts'

vi.mock('ink', () => ({
  render: vi.fn(() => ({ unmount: vi.fn(), rerender: vi.fn() })),
}))

describe('dsh-tui plugin', () => {
  it('registers under the expected name', () => {
    expect(plugin.name).toBe('dsh-tui')
  })

  it('renders ink on load without throwing', () => {
    const renderMock = vi.mocked(render)
    const ctx = createTestContext()
    expect(() => plugin.apply(ctx)).not.toThrow()
    expect(renderMock).toHaveBeenCalledTimes(1)
    expect(renderMock.mock.results[0]?.value).toBeDefined()
  })
})
