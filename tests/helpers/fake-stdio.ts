import { EventEmitter } from 'node:events'

export const COLUMNS = 100
export const ROWS = 30

export class FakeStdout extends EventEmitter {
  isTTY = true
  columns = COLUMNS
  rows = ROWS
  chunks: string[] = []
  write(chunk: string | Buffer): boolean {
    this.chunks.push(typeof chunk === 'string' ? chunk : chunk.toString('utf8'))
    return true
  }
}

export class FakeStdin extends EventEmitter {
  isTTY = true
  private queue: Buffer[] = []

  // Tests feed through emit('data'): fill the readable queue for consumers
  // that pull via stdin.read() (ink), and notify 'data' listeners directly
  // (the mouse controller).
  override emit(event: string, ...args: unknown[]): boolean {
    if (event === 'data' && args[0] !== undefined) {
      const buf = typeof args[0] === 'string' ? Buffer.from(args[0]) : (args[0] as Buffer)
      this.queue.push(buf)
      super.emit('readable')
    }
    return super.emit(event, ...args)
  }

  read(): Buffer | null {
    return this.queue.shift() ?? null
  }

  setEncoding(): void {}
  setRawMode(): void {}
  ref(): void {}
  unref(): void {}
}

export function installFakeStdin(stdin: FakeStdin): PropertyDescriptor {
  const original = Object.getOwnPropertyDescriptor(process, 'stdin')
  Object.defineProperty(process, 'stdin', { value: stdin, configurable: true, writable: true })
  return original!
}

export function restoreStdin(original: PropertyDescriptor): void {
  Object.defineProperty(process, 'stdin', original)
}
