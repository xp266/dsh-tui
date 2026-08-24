import type { Message } from '../../../src/model/message.ts'

export const WIDTH = 100
export const HEIGHT = 30

let seed = 0x2f6e2b1
export function rand(): number {
  seed ^= seed << 13
  seed ^= seed >>> 17
  seed ^= seed << 5
  return (seed >>> 0) / 0xffffffff
}

export interface FrameStats {
  frames: number
  p50: number
  p95: number
  p99: number
  max: number
  mean: number
  over16: number
  over33: number
}

export class FrameRecorder {
  private samples: number[] = []

  record(ms: number): void {
    this.samples.push(ms)
  }

  get stats(): FrameStats {
    const s = this.samples.slice().sort((a, b) => a - b)
    const at = (q: number): number => s[Math.min(s.length - 1, Math.floor(q * s.length))]!
    const mean = s.reduce((a, b) => a + b, 0) / Math.max(1, s.length)
    return {
      frames: s.length,
      p50: at(0.5),
      p95: at(0.95),
      p99: at(0.99),
      max: s[s.length - 1] ?? 0,
      mean,
      over16: this.samples.filter(x => x > 16).length,
      over33: this.samples.filter(x => x > 33).length,
    }
  }

  get count(): number {
    return this.samples.length
  }
}

export function fmtStats(label: string, stats: FrameStats): string {
  const pct = (n: number): string => `${((n / stats.frames) * 100).toFixed(1)}%`
  return [
    `[perf] ${label}`,
    `  frames=${stats.frames} mean=${stats.mean.toFixed(3)}ms`,
    `  p50=${stats.p50.toFixed(3)}ms p95=${stats.p95.toFixed(3)}ms p99=${stats.p99.toFixed(3)}ms max=${stats.max.toFixed(3)}ms`,
    `  >16ms=${stats.over16} (${pct(stats.over16)}) >33ms=${stats.over33} (${pct(stats.over33)})`,
  ].join('\n')
}

const CODE_SNIPPETS: string[] = [
  `Here is the implementation:

\`\`\`ts
export function debounce<T extends (...args: never[]) => void>(fn: T, ms: number): T {
  let timer: ReturnType<typeof setTimeout> | undefined
  return ((...args: never[]) => {
    if (timer !== undefined) clearTimeout(timer)
    timer = setTimeout(() => fn(...args), ms)
  }) as T
}
\`\`\`

The function above avoids trailing calls.`,
  `Run this to rebuild:

\`\`\`bash
pnpm install --frozen-lockfile && pnpm build 2>&1 | tail -20
for f in lib/*.mjs; do echo "built $f"; done
\`\`\`

Then verify with the test suite.`,
  `| Region | Count | Delta |
|---|---|---|
| parser | 128 | +12% |
| renderer | 64 | -3% |
| cache | 512 | +8% |

Numbers come from the profiling harness.`,
  `Key points:

- **Correctness first**: every path must stay pure
- *Latency budget*: 16ms per frame at 60fps
- \`wrapSegments\` clusters graphemes before measuring widths
- [Docs](https://example.com/guide) explain the pipeline

1. Measure
2. Optimize the hotspot
3. Re-measure`,
]

export function mdParagraph(index: number): string {
  const base = CODE_SNIPPETS[index % CODE_SNIPPETS.length]!
  return index < CODE_SNIPPETS.length ? base : `${base}\n\nVariation ${index}: lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore.`.replace('Variation', '## Variation')
}

export function userBubble(text: string): Message {
  return { kind: 'bubble', id: `u-${rand().toString(36).slice(2)}`, role: 'user', content: text }
}

export function assistantBubble(content: string): Message {
  return { kind: 'bubble', id: `a-${rand().toString(36).slice(2)}`, role: 'assistant', content }
}

export function thinkingCollapsible(body: string, collapsed = true): Message {
  return {
    kind: 'collapsible',
    id: `t-${rand().toString(36).slice(2)}`,
    label: 'Thinking',
    body,
    running: false,
    collapsed,
    thinking: true,
  }
}

export function toolCollapsible(label: string, body: string, collapsed = false): Message {
  return {
    kind: 'collapsible',
    id: `tool-${rand().toString(36).slice(2)}`,
    label,
    body,
    running: false,
    collapsed,
  }
}

export function agentTranscript(turns: number, expandedTools = false): Message[] {
  const messages: Message[] = []
  for (let i = 0; i < turns; i++) {
    messages.push(userBubble(`Please analyze module ${i} and suggest improvements. Include code and a summary table if possible.`))
    messages.push(thinkingCollapsible(mdParagraph(i % CODE_SNIPPETS.length)))
    messages.push(toolCollapsible(`Bash [run ${i}]`, `$ ls -la src\n$ wc -l src/**/*.ts\n  1204 total`, !expandedTools))
    messages.push(assistantBubble(mdParagraph(i)))
  }
  return messages
}

const STREAM_WORDS = ['the ', 'renderer ', 'batches ', 'events ', 'every ', 'frame; ', 'latency ', 'stays ', 'low ', 'while ', 'streaming ', '`code` ', '**bold** ', '- item\n', '\n\nNew paragraph with [link](https://example.com) text.\n', '> quoted line\n']

export function streamChunk(size: number): string {
  let out = ''
  while (out.length < size) {
    out += STREAM_WORDS[Math.floor(rand() * STREAM_WORDS.length)]!
  }
  return out.slice(0, size)
}
