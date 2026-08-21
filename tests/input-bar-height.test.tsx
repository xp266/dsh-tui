import { act } from 'react'
import { render } from 'ink-testing-library'
import { Box } from 'ink'
import { describe, expect, it, vi } from 'vitest'
import { InputBar } from '../src/ui/input/input-bar.tsx'

function renderBar(onHeightChange: (height: number) => void) {
  return render(
    <Box width={80} height={24}>
      <InputBar
        width={80}
        modelName="model"
        permissionMode="workspace-write"
        onCyclePermission={() => {}}
        onSend={() => {}}
        onHeightChange={onHeightChange}
      />
    </Box>,
  )
}

async function type(stdin: { write(data: string): void }, data: string) {
  act(() => {
    stdin.write(data)
  })
  await new Promise(resolve => setTimeout(resolve, 20))
}

describe('input bar dynamic height', () => {
  it('stays at the minimum for short input', async () => {
    const onHeightChange = vi.fn()
    const { stdin } = renderBar(onHeightChange)
    await type(stdin, 'hello')
    expect(onHeightChange).not.toHaveBeenCalled()
  })

  it('grows as content wraps and caps at eight content rows', async () => {
    const heights: number[] = []
    const onHeightChange = vi.fn((height: number) => {
      heights.push(height)
    })
    const { lastFrame, stdin } = renderBar(onHeightChange)
    await type(stdin, 'a'.repeat(150))
    expect(heights).toEqual([6])
    await type(stdin, 'a'.repeat(400))
    expect(heights[heights.length - 1]).toBe(11)
    expect(heights.every(h => h >= 6 && h <= 11)).toBe(true)
    const frame = lastFrame() ?? ''
    expect(frame).toContain('a')
  })
})
