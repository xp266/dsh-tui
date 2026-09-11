/**
 * Classify a boot-stopping failure for plain-text reporting: the boot phase
 * runs before any UI mounts, so every message here must be terminal text.
 */
import { hostVersusTested, TESTED_VERSIONS, type HostPosition } from './contract/upstream.ts'

export interface BootFatal {
  kind: 'host' | 'bridge' | 'internal'
  /** Headline of the failure, already formatted. */
  title: string
  /** Body lines: cause, impact, and actionable fixes. */
  detail: readonly string[]
}

/**
 * Map a thrown cause to a boot-failure report. Host-contract problems get
 * the actionable CLI fix; everything else is an internal failure.
 */
export function fatalFromCause(cause: unknown): BootFatal {
  const message = cause instanceof Error ? cause.message : String(cause)
  const stack = cause instanceof Error ? cause.stack : undefined
  const hostShaped = message.includes('without inject')
    || message.includes('harness packages in')
    || message.includes('dsh-agent')
    || message.includes('agentLoop')
    || message.includes('host is missing')
    || message.includes('agentLoop exposes neither')
  const stackLines = stack === undefined ? [] : [stack.split('\n').slice(1, 4).join('\n')]
  if (hostShaped) {
    return {
      kind: 'host',
      title: 'The installed dsh CLI is not compatible with this dshtui build',
      detail: [`Reason: ${message}`, ...stackLines],
    }
  }
  return {
    kind: 'bridge',
    title: 'Chat bridge initialization failed',
    detail: [`Reason: ${message}`, ...stackLines],
  }
}

/**
 * The remedy line for a host/bridge failure. The direction matters: a host
 * older than every tested line needs a CLI upgrade, but a host newer than
 * the tested lines needs a dshtui update — pointing that user at
 * `@deepseek-ai/dsh@latest` would move the pair further apart.
 */
export function hostFixLine(position: HostPosition = hostVersusTested()): string {
  const tested = TESTED_VERSIONS.join(', ')
  switch (position) {
    case 'older':
      return 'Fix: npm install -g @deepseek-ai/dsh@latest   (the installed CLI is older than any line this dshtui build was tested on)'
    case 'newer':
      return `Fix: npm install -g @xp266/dshtui@latest   (this dshtui build has not been adapted to your CLI yet; tested lines: ${tested})`
    case 'matched':
    case 'unknown':
    default:
      return `Fix: update @xp266/dshtui, or reinstall the dsh CLI over a tested line (${tested})`
  }
}

/** Render a boot failure as the exact terminal text block to print. */
export function formatBootFatal(fatal: BootFatal, logPath: string): string {
  const lines = [
    `dshtui: ${fatal.title}`,
    ...fatal.detail.map(line => `  ${line}`),
  ]
  // Host and bridge failures are version-pairing problems by definition;
  // internal failures keep only the log pointer.
  if (fatal.kind === 'host' || fatal.kind === 'bridge') {
    lines.push(`  ${hostFixLine()}`)
  }
  lines.push(`  Full log: ${logPath}`)
  return lines.join('\n')
}
