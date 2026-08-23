import { Box } from 'ink'
import { render } from 'ink-testing-library'
import { describe, expect, it, vi } from 'vitest'
import { QuestionPanel } from '../src/ui/panels/question-panel.tsx'
import type { QuestionPanelRequest } from '../src/chat/interactions.ts'

const WIDTH = 80
const INNER = WIDTH - 8
const BLOCK = WIDTH - 4

async function settle(ms = 20): Promise<void> {
  await new Promise(resolve => setTimeout(resolve, ms))
}

function makePanel(questions: QuestionPanelRequest['request']['questions']): QuestionPanelRequest {
  return { id: `q-${Math.random().toString(36).slice(2)}`, request: { questions } }
}

describe('question panel', () => {
  it('shows options with cursor on the first row and marks the chosen one', async () => {
    const panel = makePanel([
      {
        id: 'target',
        question: 'Which deployment target should I use?',
        options: [
          { label: 'Vercel', description: 'edge network, fastest cold start' },
          { label: 'Fly.io', description: 'good for long-running processes' },
        ],
      },
    ])
    const { lastFrame, stdin } = render(
      <Box width={WIDTH} height={30}>
        <QuestionPanel
        question={panel}
        background="#000000"
        active
        columns={WIDTH}
        rows={30}
        innerWidth={INNER}
        blockWidth={BLOCK}
        onSubmit={() => {}}
        onCancel={() => {}}
        onResize={() => {}}
      />
        </Box>,
    )
    await settle()
    let frame = lastFrame() ?? ''
    expect(frame).toContain('Which deployment target should I use?')
    expect(frame).toMatch(/❯\s+1\. Vercel/)
    expect(frame).toContain('2. Fly.io')
    expect(frame).toContain('edge network, fastest cold start')
    expect(frame).toContain('1/2    ⇆ page    ⇅ wrap    enter select    esc close')
    stdin.write('\r')
    await settle()
    frame = lastFrame() ?? ''
    expect(frame).toMatch(/1\. Vercel    ✓/)
  })

  it('moves the cursor down and selects the second option instead', async () => {
    const panel = makePanel([
      { id: 'pick', question: 'Pick', options: [{ label: 'A' }, { label: 'B' }] },
    ])
    const { lastFrame, stdin } = render(
      <Box width={WIDTH} height={30}>
        <QuestionPanel question={panel} background="#000000" active columns={WIDTH} rows={30} innerWidth={INNER} blockWidth={BLOCK} onSubmit={() => {}} onCancel={() => {}} onResize={() => {}} />
        </Box>,
    )
    await settle()
    stdin.write('\u001b[B')
    await settle()
    expect(lastFrame() ?? '').toMatch(/❯\s+2\. B/)
    stdin.write('\r')
    await settle()
    const frame = lastFrame() ?? ''
    expect(frame).toMatch(/1\. A(?!\s+✓)/)
    expect(frame).toMatch(/2\. B\s+✓/)
  })

  it('multi select renders checkboxes and toggles in place', async () => {
    const panel = makePanel([
      { id: 'multi', question: 'Choose tools', multiSelect: true, options: [{ label: 'ESLint' }, { label: 'Prettier' }] },
    ])
    const { lastFrame, stdin } = render(
      <Box width={WIDTH} height={30}>
        <QuestionPanel question={panel} background="#000000" active columns={WIDTH} rows={30} innerWidth={INNER} blockWidth={BLOCK} onSubmit={() => {}} onCancel={() => {}} onResize={() => {}}
      />
        </Box>,
    )
    await settle()
    let frame = lastFrame() ?? ''
    expect(frame).toMatch(/1\. \[ \] ESLint/)
    stdin.write('\r')
    await settle()
    frame = lastFrame() ?? ''
    expect(frame).toMatch(/1\. \[✓\] ESLint/)
    expect(frame).toMatch(/2\. \[ \] Prettier/)
  })

  it('custom input activates on first enter, records text on the second, toggles afterwards', async () => {
    const panel = makePanel([
      { id: 'free', question: 'Describe your setup' },
    ])
    const { lastFrame, stdin } = render(
      <Box width={WIDTH} height={30}>
        <QuestionPanel question={panel} background="#000000" active columns={WIDTH} rows={30} innerWidth={INNER} blockWidth={BLOCK} onSubmit={() => {}} onCancel={() => {}}
          onResize={() => {}}
        />
        </Box>,
    )
    await settle()
    let frame = lastFrame() ?? ''
    expect(frame).toMatch(/❯\s+1\. Custom input content/)
    stdin.write('\r')
    await settle()
    stdin.write('my custom answer')
    await settle()
    frame = lastFrame() ?? ''
    expect(frame).toContain('my custom answer')
    expect(frame).not.toMatch(/Custom input content\s+✓/)
    stdin.write('\r')
    await settle()
    frame = lastFrame() ?? ''
    expect(frame).toContain('my custom answer')
    expect(frame).toMatch(/Custom input content    ✓/)
    stdin.write('\r')
    await settle()
    frame = lastFrame() ?? ''
    expect(frame).toContain('my custom answer')
    expect(frame).not.toMatch(/Custom input content\s+✓/)
    stdin.write('\r')
    await settle()
    stdin.write(' v2')
    await settle()
    stdin.write('\r')
    await settle()
    frame = lastFrame() ?? ''
    expect(frame).toContain('my custom answer v2')
    expect(frame).toMatch(/Custom input content    ✓/)
  })

  it('pages to the review page with unanswered marker and submits answers', async () => {
    const submit = vi.fn()
    const panel = makePanel([
      { id: 'first', question: 'First question?', options: [{ label: 'One' }, { label: 'Two' }] },
      { id: 'second', question: 'Second question?' },
    ])
    const { lastFrame, stdin } = render(
      <Box width={WIDTH} height={30}>
        <QuestionPanel question={panel} background="#000000" active columns={WIDTH} rows={30} innerWidth={INNER} blockWidth={BLOCK} onSubmit={submit} onCancel={() => {}}
        onResize={() => {}}
      />
        </Box>,
    )
    await settle()
    stdin.write('\r')
    await settle()
    stdin.write('\u001b[C')
    await settle()
    stdin.write('\u001b[C')
    await settle()
    let frame = lastFrame() ?? ''
    expect(frame).toContain('Confirm Selection')
    expect(frame).toContain('1. First question?')
    expect(frame).toContain('One')
    expect(frame).toContain('2. Second question?')
    expect(frame).toContain('(Question not answered)')
    expect(frame).toContain('3/3    ⇆ page    enter submit    esc close')
    stdin.write('\r')
    await settle()
    expect(submit).toHaveBeenCalledWith({
      answers: [
        { id: 'first', selected: ['One'] },
        { id: 'second', selected: [] },
      ],
    })
  })

  it('escape cancels the whole panel', async () => {
    const cancel = vi.fn()
    const panel = makePanel([{ id: 'q', question: 'Hello?' }])
    const { stdin } = render(
      <Box width={WIDTH} height={30}>
        <QuestionPanel question={panel} background="#000000" active columns={WIDTH} rows={30} innerWidth={INNER} blockWidth={BLOCK} onSubmit={() => {}} onCancel={cancel}
        onResize={() => {}}
      />
        </Box>,
    )
    await settle()
    stdin.write('\u001b')
    await settle()
    expect(cancel).toHaveBeenCalledOnce()
  })
})
