import { Text } from 'ink'
import { render } from 'ink-testing-library'
import { beforeEach, describe, expect, it } from 'vitest'
import { clearAsyncListCache, seedAsyncListCache, useAsyncList } from '../src/ui/hooks/use-async-list.ts'

interface Row {
  id: string
}

function Probe({ load }: { load: () => Promise<Row[]> }): React.ReactElement {
  const { items } = useAsyncList(load, 'seed-probe')
  return <Text>{items.map(item => item.id).join(',')}</Text>
}

describe('async list cache seeding', () => {
  beforeEach(() => {
    clearAsyncListCache()
  })

  it('renders seeded items before the loader resolves, then refreshes', async () => {
    seedAsyncListCache('seed-probe', [{ id: 'seeded' }])
    const { lastFrame } = render(<Probe load={async () => [{ id: 'loaded' }]} />)
    expect(lastFrame()).toContain('seeded')
    await new Promise(resolve => setTimeout(resolve, 20))
    expect(lastFrame()).toContain('loaded')
  })

  it('starts empty without a seed', async () => {
    const { lastFrame } = render(<Probe load={async () => [{ id: 'late' }]} />)
    expect(lastFrame()).toBe('')
    await new Promise(resolve => setTimeout(resolve, 20))
    expect(lastFrame()).toContain('late')
  })
})
