import { keyedRegistry } from './kernel/registry.ts'

export interface BootSink {
  id: string
  write(line: string): void
}

const sinks = keyedRegistry<BootSink>()
const history: string[] = []
let open = false

export function registerBootSink(sink: BootSink): () => void {
  if (open) {
    for (const line of history) sink.write(line)
  }
  return sinks.register(sink.id, sink)
}

export function openBootLog(): void {
  open = true
  history.length = 0
}

export function emitBootLine(line: string): void {
  if (!open) return
  history.push(line)
  for (const sink of sinks.values()) sink.write(line)
}

export function closeBootLog(): void {
  if (!open) return
  open = false
  for (const sink of sinks.values()) sink.write('')
  history.length = 0
}
