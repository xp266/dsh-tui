import { describe, expect, it } from 'vitest'
import { userDisplayText } from '../src/chat/blocks.ts'
import { expandFieldChars, fieldRowSegments } from '../src/core/field-view.ts'
import { wrapLines } from '../src/core/text.ts'
import type { ContentBlock } from '@deepseek-ai/dsh-llm'

function imageBlock(): ContentBlock {
  return { type: 'image', attachment: { attachmentId: 'a-1' as never, mediaType: 'image/png', bytes: 1, width: 1, height: 1 } }
}

describe('user message image chips', () => {
  it('renders one chip per text-separated image group', () => {
    const blocks: ContentBlock[] = [
      { type: 'text', text: '你看下这个图片' },
      imageBlock(),
      { type: 'text', text: '' },
      imageBlock(),
      imageBlock(),
      { type: 'text', text: '，我感觉有问题' },
    ]
    const display = userDisplayText(blocks)
    expect(expandFieldChars(display)).toBe('你看下这个图片[1 images][2 images]，我感觉有问题')
  })

  it('keeps trailing images as their own group', () => {
    const blocks: ContentBlock[] = [imageBlock(), imageBlock(), imageBlock()]
    const display = userDisplayText(blocks)
    expect(expandFieldChars(display)).toBe('[3 images]')
  })

  it('keeps chip rows styled and unsplit when wrapping', () => {
    const blocks: ContentBlock[] = [imageBlock()]
    const display = userDisplayText(blocks)
    const lines = wrapLines(display, 20)
    const segments = fieldRowSegments(lines[0]!, {})
    expect(segments).toHaveLength(1)
    expect(segments[0]!.text).toBe('[1 images]')
    expect(segments[0]!.style.background).toBeDefined()
  })
})
