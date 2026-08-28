import { act } from 'react'
import { render } from 'ink-testing-library'
import { Box } from 'ink'
import { describe, expect, it } from 'vitest'
import { InputBar } from '../src/ui/input/input-bar.tsx'
import type { InputBarHandle } from '../src/ui/input/input-bar.tsx'
import { useComposer } from '../src/ui/input/use-composer.ts'

const WIDTH = 100
const HEIGHT = 24

async function flush(): Promise<void> {
  await new Promise(resolve => setTimeout(resolve, 0))
}

function Harness({ handleRef }: { handleRef: { current: InputBarHandle | null } }) {
  const { value, cursor, api } = useComposer(() => {}, true, WIDTH - 8, () => {})
  return (
    <InputBar
      ref={handleRef}
      width={WIDTH}
      columns={WIDTH}
      rows={HEIGHT}
      value={value}
      cursor={cursor}
      api={api}
      modelName="model"
      permissionMode="workspace-write"
    />
  )
}

function renderInput() {
  const ref: { current: InputBarHandle | null } = { current: null }
  const view = render(
    <Box width={WIDTH} height={HEIGHT}>
      <Harness handleRef={ref} />
    </Box>,
  )
  return { view, handle: () => ref.current }
}

function stripAnsi(text: string): string {
  return text.replace(/\x1b\[[0-9;]*[A-Za-z]/g, '')
}

describe('input bar mouse handle', () => {
  it('selects a hint on the first click and confirms the selection', async () => {
    const { view, handle } = renderInput()
    act(() => {
      view.stdin.write('/')
    })
    await flush()
    act(() => {
      handle()?.hintClick(1)
    })
    await flush()
    expect(stripAnsi(view.lastFrame() ?? '')).toContain('/')
    act(() => {
      view.stdin.write('\r')
    })
    await flush()
    const frame = stripAnsi(view.lastFrame() ?? '')
    expect(frame).toContain('/todo')
  })

  it('places the cursor where the content is clicked', async () => {
    const { view, handle } = renderInput()
    act(() => {
      view.stdin.write('hello world')
    })
    await flush()
    act(() => {
      handle()?.clickAt(19, 9)
    })
    await flush()
    act(() => {
      view.stdin.write('X')
    })
    await flush()
    expect(stripAnsi(view.lastFrame() ?? '')).toContain('helloX world')
  })

  it('ignores clicks on the reserve row below the content', async () => {
    const { view, handle } = renderInput()
    act(() => {
      view.stdin.write('hello')
    })
    await flush()
    act(() => {
      handle()?.clickAt(20, 7)
    })
    await flush()
    act(() => {
      view.stdin.write('X')
    })
    await flush()
    expect(stripAnsi(view.lastFrame() ?? '')).toContain('helloX')
  })

  it('moves the cursor across wrapped lines with the wheel', async () => {
    const { view, handle } = renderInput()
    act(() => {
      view.stdin.write('abc')
    })
    act(() => {
      view.stdin.write('\n')
    })
    act(() => {
      view.stdin.write('def')
    })
    await flush()
    act(() => {
      handle()?.wheel(-1)
    })
    await flush()
    act(() => {
      view.stdin.write('Z')
    })
    await flush()
    const frame = stripAnsi(view.lastFrame() ?? '')
    expect(frame).toContain('abcZ')
    expect(frame).toContain('def')
  })
})
