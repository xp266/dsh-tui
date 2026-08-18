import { describe, it, expect } from 'vitest'
import React from 'react'
import { render } from 'ink-testing-library'
import { InputBar } from '../src/ui/input/input-bar'

function bgSpans(frame: string): number[] {
  return frame
    .split('\n')
    .map(line => {
      const m = line.match(/\x1b\[(?:40|48;5;237)m([^\x1b]*)\x1b\[49m/)
      return m ? [...(m[1] ?? '')].filter(c => c !== '\u200b').length : -1
    })
    .filter(x => x >= 0)
}

describe('input bar background', () => {
  it('emits blockWidth columns on every row', () => {
    const { lastFrame } = render(React.createElement(InputBar, { width: 100, modelName: 'glm-4.7-flash', onSend: () => {} }))
    const frame = lastFrame()
    expect(frame).toBeDefined()
    const spans = bgSpans(frame ?? '')
    expect(spans.length).toBeGreaterThan(0)
    expect(spans.every(x => x === 96)).toBe(true)
  })
})