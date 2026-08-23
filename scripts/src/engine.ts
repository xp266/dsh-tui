import { createElement } from 'react'
import chalk from 'chalk'
import { render } from 'ink'
import { App } from '../../src/ui/app.tsx'
import { VirtualStdout, VirtualStdin } from './virtual-terminal.ts'
import { createMockBridge } from './mock-bridge.ts'
import type { MockBridgeOptions } from './mock-bridge.ts'
import type { Scenario } from './scenarios.ts'

export interface CaptureOptions {
  columns: number
  rows: number
  settleMs: number
  maxWaitMs: number
  bridge?: MockBridgeOptions
}

export interface CaptureResult {
  plain: string
  ansi: string
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

async function waitForQuiet(terminal: VirtualStdout['terminal'], settleMs: number, maxWaitMs: number): Promise<void> {
  const start = Date.now()
  let lastWrite = -1
  while (Date.now() - start < maxWaitMs) {
    await sleep(40)
    if (terminal.lastWriteAt === lastWrite && Date.now() - terminal.lastWriteAt >= settleMs) return
    lastWrite = terminal.lastWriteAt
  }
}

const REAL_STDOUT_NOISE = /\x1b\[\??[0-9;]*(?: [q]|[hlqu])/g

function silenceRealStdoutNoise(): () => void {
  const original = process.stdout.write
  process.stdout.write = function patchedWrite(
    this: typeof process.stdout,
    chunk: Uint8Array | string,
    ...rest: unknown[]
  ): boolean {
    if (typeof chunk === 'string') {
      const cleaned = chunk.replace(REAL_STDOUT_NOISE, '')
      if (cleaned === '') return true
      return original.call(this, cleaned, ...rest)
    }
    return original.call(this, chunk, ...rest)
  } as typeof process.stdout.write
  return () => {
    process.stdout.write = original
  }
}

export async function captureScenario(scenario: Scenario, options: CaptureOptions): Promise<CaptureResult> {
  chalk.level = 3
  const restoreStdout = silenceRealStdoutNoise()
  const stdout = new VirtualStdout(options.columns, options.rows)
  const stdin = new VirtualStdin()
  const bridge = createMockBridge(options.bridge)
  const app = render(createElement(App, { bridge, screen: undefined }), {
    stdout: stdout as unknown as NodeJS.WriteStream,
    stdin: stdin as unknown as NodeJS.ReadStream,
    exitOnCtrlC: false,
    alternateScreen: true,
    incrementalRendering: false,
    maxFps: 60,
  })
  try {
    await waitForQuiet(stdout.terminal, options.settleMs, options.maxWaitMs)
    await scenario.run({
      bridge,
      type: keys => {
        if (keys !== '') stdin.sendKeys(keys)
      },
      sleep,
    })
    await waitForQuiet(stdout.terminal, options.settleMs, options.maxWaitMs)
    return { plain: stdout.terminal.snapshotPlain(), ansi: stdout.terminal.snapshotAnsi() }
  } finally {
    app.unmount()
    restoreStdout()
  }
}
