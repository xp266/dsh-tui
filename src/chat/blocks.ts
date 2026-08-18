import type { ContentBlock } from '@deepseek-ai/dsh-llm'

export function textFromBlocks(blocks: readonly ContentBlock[]): string {
  let text = ''
  for (const block of blocks) {
    if (block.type === 'text') text += block.text
    else if (block.type === 'tool-result') text += textFromBlocks(block.content)
  }
  return text
}
