import { describe, expect, it } from 'vitest'
import {
  buildMarkdownRows,
  createMarkdownTokenizer,
  createSegmentWrapper,
  layoutLineSegments,
} from '../src/ui/message/markdown.ts'
import type { Segment } from '../src/ui/message/markdown.ts'

describe('list wrapper parity', () => {
  it('matches the incremental wrapper output for list content', () => {
    const content = [
      '- first item that is long enough to wrap around several times over and over',
      '- second item',
      '  - nested item also long enough to wrap around more than once here indeed',
      '1. numbered item with enough text to require a wrapped continuation line too',
    ].join('\n')
    const wrapper = createSegmentWrapper(createMarkdownTokenizer(), 40)
    const streamed = wrapper.update(content)
    expect(streamed.rows).toEqual(buildMarkdownRows(content, 40).rows)
    void layoutLineSegments
    void ({} as Segment)
  })
})
