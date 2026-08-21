import { act } from 'react'
import { render } from 'ink-testing-library'
import { Box } from 'ink'
import { describe, expect, it, vi } from 'vitest'
import { InputBar, inputLayout } from '../src/ui/input/input-bar.tsx'
import { useComposer } from '../src/ui/input/use-composer.ts'

function Harness({ onLayout }: { onLayout: (height: number) => void }) {
  const { value, cursor, api } = useComposer(() => {}, true, 72, () => {})
  const layout = inputLayout(value, cursor, 80)
  onLayout(layout.barHeight)
  return (
    <InputBar
      width={80}
      columns={80}
      rows={24}
      value={value}
      cursor={cursor}
      api={api}
      modelName="model"
      permissionMode="workspace-write"
    />
  )
}

function renderBar(onLayout: (height: number) => void) {
  return render(
    <Box width={80} height={24}>
      <Harness onLayout={onLayout} />
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
    const onLayout = vi.fn()
    const { stdin } = renderBar(onLayout)
    await type(stdin, 'hello')
    expect(onLayout).toHaveBeenLastCalledWith(5)
  })

  it('grows as content wraps and caps at eight content rows', async () => {
    const heights: number[] = []
    const record = (height: number) => {
      if (heights[heights.length - 1] !== height) heights.push(height)
    }
    const { stdin } = renderBar(record)
    await type(stdin, 'a'.repeat(150))
    expect(heights).toEqual([5, 7])
    await type(stdin, 'a'.repeat(400))
    expect(heights[heights.length - 1]).toBe(11)
    expect(heights.every(h => h >= 5 && h <= 11)).toBe(true)
  })
})
