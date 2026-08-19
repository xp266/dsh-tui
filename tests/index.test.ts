import { describe, expect, it, vi } from 'vitest'
import { render } from 'ink'
import * as plugin from '../src/index.tsx'
import { createTestContext } from './harness.ts'

vi.mock('ink', () => ({
  render: vi.fn(() => ({ unmount: vi.fn(), rerender: vi.fn(), clear: vi.fn() })),
}))

function applyPlugin() {
  const ctx = createTestContext()
  plugin.apply(ctx)
  return ctx
}

describe('dsh-tui plugin', () => {
  it('registers under the expected name', () => {
    expect(plugin.name).toBe('dsh-tui')
  })

  it('renders ink on load without throwing', () => {
    const renderMock = vi.mocked(render)
    expect(() => applyPlugin()).not.toThrow()
    expect(renderMock).toHaveBeenCalledTimes(1)
    expect(renderMock.mock.results[0]?.value).toBeDefined()
  })

  it('clears the screen and rerenders the frame on terminal resize', () => {
    const renderMock = vi.mocked(render)
    const writeSpy = vi.spyOn(process.stdout, 'write')
    applyPlugin()
    const instance = renderMock.mock.results[0]?.value as { clear: ReturnType<typeof vi.fn>; rerender: ReturnType<typeof vi.fn> }
    process.stdout.emit('resize')
    expect(instance.clear).toHaveBeenCalledTimes(1)
    expect(instance.rerender).toHaveBeenCalledTimes(1)
    const writes = writeSpy.mock.calls.map(call => String(call[0]))
    expect(writes.some(write => write.includes('\x1b[2J\x1b[3J\x1b[H'))).toBe(true)
  })
})
