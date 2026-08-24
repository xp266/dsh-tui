import { createElement } from 'react'
import { render, Box } from 'ink'
import type { RenderOptions } from 'ink'
import { PassThrough } from 'node:stream'
import { MessageList } from '../../../src/ui/message/message-list.tsx'
import type { Message } from '../../../src/model/message.ts'
import { WIDTH, HEIGHT } from './util.ts'

export type InkApp = ReturnType<typeof render>
type Stdout = PassThrough & {
  columns: number
  rows: number
  writes: number
  removeListener: RenderOptions['stdout'] extends infer S ? S extends { removeListener: infer R } ? R : never : never
}

export function fakeStdout(columns = WIDTH, rows = HEIGHT): Stdout {
  const s = new PassThrough() as unknown as Stdout
  s.columns = columns
  s.rows = rows
  s.writes = 0
  s.on('data', () => {
    s.writes += 1
  })
  return s
}

export async function settle(): Promise<void> {
  await new Promise(resolve => setImmediate(resolve))
}

export interface Stats {
  n: number
  mean: number
  p50: number
  p95: number
  max: number
  over16: number
  over33: number
}

export function statsOf(samples: number[]): Stats {
  const sorted = [...samples].sort((a, b) => a - b)
  const at = (k: number): number => sorted[Math.min(sorted.length - 1, Math.floor(k * sorted.length))]!
  return {
    n: samples.length,
    mean: samples.reduce((a, b) => a + b, 0) / Math.max(1, samples.length),
    p50: at(0.5),
    p95: at(0.95),
    max: sorted[sorted.length - 1] ?? 0,
    over16: samples.filter(x => x > 16).length,
    over33: samples.filter(x => x > 33).length,
  }
}

function pct(n: number, total: number): string {
  return `${((n / Math.max(1, total)) * 100).toFixed(1)}%`
}

export function report(label: string, s: Stats): string {
  return `${label}: n=${s.n} mean=${s.mean.toFixed(3)}ms p50=${s.p50.toFixed(3)}ms p95=${s.p95.toFixed(3)}ms max=${s.max.toFixed(3)}ms >16=${s.over16}(${pct(s.over16, s.n)}) >33=${s.over33}(${pct(s.over33, s.n)})`
}

export interface ListProps {
  messages: Message[]
  scrollTop: number
}

export function listElement({ messages, scrollTop }: ListProps) {
  return createElement(Box, { width: WIDTH, height: HEIGHT },
    createElement(MessageList, { messages, height: HEIGHT, width: WIDTH, scrollTop, onScroll: () => {} }))
}

export interface Mount {
  app: InkApp
  stdout: ReturnType<typeof fakeStdout>
}

export async function mount(props: ListProps): Promise<Mount> {
  const stdout = fakeStdout()
  const app = render(listElement(props), { stdout: stdout as never, exitOnCtrlC: false })
  await settle()
  return { app, stdout }
}
