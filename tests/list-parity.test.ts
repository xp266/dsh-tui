import { describe, expect, it } from 'vitest'
import { createMarkdownRenderer, renderMarkdown } from '../src/ui/message/md/index.ts'

describe('list wrapper parity', () => {
  it('matches the incremental renderer output for list content', () => {
    const content = [
      '- first item that is long enough to wrap around several times over and over',
      '- second item',
      '  - nested item also long enough to wrap around more than once here indeed',
      '1. numbered item with enough text to require a wrapped continuation line too',
    ].join('\n')
    const renderer = createMarkdownRenderer(40)
    const streamed = renderer.update(content)
    expect(streamed.rows).toEqual(renderMarkdown(content, 40).rows)
  })
})
