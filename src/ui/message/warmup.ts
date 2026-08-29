import { renderMarkdown } from './md/index.ts'
import { buildRowIndex } from './layout.ts'
import type { Message } from '../../model/message.ts'

const MARKDOWN_FIXTURE = [
  '# Heading',
  '',
  'Paragraph with **bold**, *italic*, `inline code` and a [link](https://example.com).',
  '',
  '- list item one',
  '- list item two',
  '',
  '```ts',
  'export function warm(input: string): number {',
  '  return input.length + 1',
  '}',
  '```',
  '',
  '> quoted text',
].join('\n')

/**
 * Run the markdown and row-layout pipeline once on a small fixture so the
 * first real message does not pay one-time lexer, highlighter, and JIT
 * initialization. Call during idle after the syntax languages finish warming.
 */
export function warmRenderPipeline(): void {
  renderMarkdown(MARKDOWN_FIXTURE, 96)
  renderMarkdown(MARKDOWN_FIXTURE, 72)
  const messages: Message[] = [
    { kind: 'bubble', id: 'warm-user', role: 'user', content: 'warm up the render pipeline' },
    { kind: 'bubble', id: 'warm-ai', role: 'assistant', content: MARKDOWN_FIXTURE },
    { kind: 'collapsible', id: 'warm-think', label: 'Thinking', body: 'thinking fixture body', running: false, collapsed: false, thinking: true },
    { kind: 'tool-diff', id: 'warm-diff', tool: 'edit', path: 'src/warm.ts', hunks: [[{ kind: 'ctx', text: 'const keep = 1' }, { kind: 'add', text: 'const added = 2' }]] },
    { kind: 'bubble', id: 'warm-cmd', role: 'assistant', content: 'command output', origin: 'command' },
  ]
  const index = buildRowIndex(messages, 96)
  for (let row = 0; row < index.total; row++) index.rowAt(row)
}
