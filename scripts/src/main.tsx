import { mkdirSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { buildScenarios } from './scenarios.ts'
import { captureScenario } from './engine.ts'
import type { MockBridgeOptions } from './mock-bridge.ts'

interface CliOptions {
  columns: number
  rows: number
  settleMs: number
  maxWaitMs: number
  text?: string
  bridge: MockBridgeOptions
  out?: string
  outdir: string
  print: 'plain' | 'ansi' | 'none'
  json: boolean
}

function parseArgs(argv: string[]): { positional: string[]; flags: Map<string, string | boolean> } {
  const positional: string[] = []
  const flags = new Map<string, string | boolean>()
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!
    if (arg.startsWith('--')) {
      const key = arg.slice(2)
      const next = argv[i + 1]
      if (next !== undefined && !next.startsWith('--')) {
        flags.set(key, next)
        i += 1
      } else {
        flags.set(key, true)
      }
    } else {
      positional.push(arg)
    }
  }
  return { positional, flags }
}

function numberFlag(flags: Map<string, string | boolean>, key: string, fallback: number): number {
  const raw = flags.get(key)
  if (typeof raw !== 'string') return fallback
  const value = Number(raw)
  return Number.isFinite(value) && value > 0 ? value : fallback
}

function stringFlag(flags: Map<string, string | boolean>, key: string): string | undefined {
  const raw = flags.get(key)
  return typeof raw === 'string' ? raw : undefined
}

function loadOptions(flags: Map<string, string | boolean>): CliOptions {
  const print = stringFlag(flags, 'print')
  return {
    columns: numberFlag(flags, 'cols', 100),
    rows: numberFlag(flags, 'rows', 32),
    settleMs: numberFlag(flags, 'settle', 250),
    maxWaitMs: numberFlag(flags, 'max-wait', 1500),
    text: stringFlag(flags, 'text'),
    bridge: {
      model: stringFlag(flags, 'model'),
      cwd: stringFlag(flags, 'cwd'),
      permissionMode: stringFlag(flags, 'permission'),
      preset: stringFlag(flags, 'preset'),
      effort: stringFlag(flags, 'effort'),
    },
    out: stringFlag(flags, 'out'),
    outdir: stringFlag(flags, 'outdir') ?? '/tmp/dsh-tui-snapshot/shots',
    print: print === 'ansi' || print === 'none' ? print : 'plain',
    json: flags.get('json') === true,
  }
}

function sanitizeId(id: string): string {
  return id.replaceAll('/', '-')
}

function saveOutputs(prefix: string, result: { plain: string; ansi: string }): string[] {
  const files = [`${prefix}.txt`, `${prefix}.ans`]
  mkdirSync(resolve(files[0], '..'), { recursive: true })
  writeFileSync(`${files[0]}`, `${result.plain}\n`)
  writeFileSync(`${files[1]}`, `${result.ansi}\n`)
  return files
}

const USAGE = `dsh-tui layout snapshot tool

Usage:
  cli.mjs list [--json]
      List every scenario the tool can render. Command and panel scenarios are
      discovered from project sources at bundle time, so new slash commands or
      InteractionStore panels appear automatically.

  cli.mjs shot <scenario-id> [options]
      Render one scenario and emit its full-screen text snapshot.

  cli.mjs shot-all [options]
      Render every scenario into --outdir (a temp folder by default).

Options:
  --cols N          Terminal width (default 100)
  --rows N          Terminal height (default 32)
  --text STR        Composer text for the input scenario
  --permission MODE Bridge permission mode (affects chrome color)
  --model NAME      Model name shown in the status line
  --cwd PATH        Working directory label
  --preset ID       Agent preset name
  --effort ID       Reasoning effort name
  --settle MS       Quiet period before taking a snapshot (default 250)
  --max-wait MS     Hard timeout waiting for a stable frame (default 1500)
  --out PREFIX      Write <prefix>.txt (plain) and <prefix>.ans (truecolor)
  --outdir DIR      Output directory for shot-all (default /tmp/dsh-tui-snapshot/shots)
  --print MODE      stdout output for shot: plain | ansi | none (default plain)
`

async function main(): Promise<void> {
  const { positional, flags } = parseArgs(process.argv.slice(2))
  const command = positional[0]

  if (command === undefined || command === 'help' || flags.get('help') === true) {
    process.stdout.write(USAGE)
    return
  }

  if (command === 'list') {
    const options = loadOptions(flags)
    const scenarios = buildScenarios({ inputText: options.text })
    if (options.json) {
      process.stdout.write(`${JSON.stringify(scenarios.map(s => ({ id: s.id, description: s.description, source: s.discoveredFrom })), null, 2)}\n`)
      return
    }
    for (const scenario of scenarios) {
      process.stdout.write(`${scenario.id.padEnd(24)} ${scenario.description}\n`)
    }
    return
  }

  if (command === 'shot') {
    const id = positional[1]
    if (id === undefined) {
      process.stderr.write('error: missing scenario id, run "list" to see available ids\n')
      process.exitCode = 1
      return
    }
    const options = loadOptions(flags)
    const scenario = buildScenarios({ inputText: options.text }).find(entry => entry.id === id || sanitizeId(entry.id) === id)
    if (scenario === undefined) {
      process.stderr.write(`error: unknown scenario "${id}", run "list" to see available ids\n`)
      process.exitCode = 1
      return
    }
    const result = await captureScenario(scenario, options)
    if (options.out !== undefined) saveOutputs(options.out, result)
    if (options.print === 'plain') process.stdout.write(`${result.plain}\n`)
    if (options.print === 'ansi') process.stdout.write(`${result.ansi}\n`)
    return
  }

  if (command === 'shot-all') {
    const options = loadOptions(flags)
    const dir = resolve(options.outdir)
    mkdirSync(dir, { recursive: true })
    const scenarios = buildScenarios({ inputText: options.text })
    let failed = 0
    for (const scenario of scenarios) {
      try {
        const result = await captureScenario(scenario, options)
        const files = saveOutputs(join(dir, sanitizeId(scenario.id)), result)
        process.stdout.write(`ok   ${scenario.id} -> ${files.join(', ')}\n`)
      } catch (error) {
        failed += 1
        process.stdout.write(`fail ${scenario.id}: ${(error as Error).message}\n`)
      }
    }
    process.stdout.write(`done: ${scenarios.length - failed}/${scenarios.length} snapshots in ${dir}\n`)
    process.exitCode = failed === 0 ? 0 : 1
    return
  }

  process.stderr.write(`error: unknown command "${command}"\n\n${USAGE}`)
  process.exitCode = 1
}

main()
  .then(() => process.exit(process.exitCode ?? 0))
  .catch(error => {
    console.error(error)
    process.exit(1)
  })
