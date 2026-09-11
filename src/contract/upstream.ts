import { readFileSync, realpathSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

/**
 * Upstream compatibility contract.
 *
 * The supported set is evidence-based, not guessed:
 *
 * - `TESTED_VERSIONS` lists every harness line this build was verified
 *   against (the CI dev pins plus any older line covered by the contract
 *   tests). The floor is the oldest TESTED version, never an assumption.
 * - The ceiling has a hard cap (next minor) because semver does not
 *   guarantee prerelease-line compatibility, but a version above the cap
 *   still boots: the guard checks the *calling conventions* dshtui actually
 *   relies on (see `probeHostContract`) and only treats a mismatch as fatal.
 *
 * Adding support for a new harness line means: bump the dev pins + peer
 * branches in package.json, add the line to TESTED_VERSIONS, and extend
 * probeHostContract when a calling convention changed.
 */

/** Every harness line this build was verified against, sorted ascending. */
export const TESTED_VERSIONS: readonly string[] = [
  '0.1.2-rc.1',
  '0.1.2-rc.2',
]

/**
 * Hard ceiling: the next minor after the newest tested line. Beyond it the
 * surface area may have moved in ways the contract probes cannot express;
 * the drift report says "untested" rather than "incompatible" there.
 */
export const UPSTREAM_CEILING_VERSION = '0.2.0'

/** Oldest harness line known to work; identical to TESTED_VERSIONS[0]. */
export const UPSTREAM_FLOOR_VERSION: string = TESTED_VERSIONS[0]!

export const UPSTREAM_FRAMEWORK_MAJORS: Record<string, number> = {
  '@deepseek-ai/cordis': 4,
  '@deepseek-ai/schemastery': 3,
}

export const UPSTREAM_BLESSED_PACKAGES = [
  '@deepseek-ai/cordis',
  '@deepseek-ai/schemastery',
  '@deepseek-ai/dsh-agent',
  '@deepseek-ai/dsh-agent-default-model',
  '@deepseek-ai/dsh-agent-loop',
  '@deepseek-ai/dsh-agent-presets',
  '@deepseek-ai/dsh-attachment',
  '@deepseek-ai/dsh-credentials',
  '@deepseek-ai/dsh-llm',
  '@deepseek-ai/dsh-session',
  '@deepseek-ai/dsh-settings',
] as const

export interface UpstreamDriftEntry {
  package: string
  installed: string | undefined
  expected: string
}

export type UpstreamChannel = 'alpha' | 'beta' | 'rc' | 'stable'

export type UpstreamVersionTuple = readonly [number, number, number, UpstreamChannel, number]

export function parseUpstreamVersion(version: string | undefined): UpstreamVersionTuple | undefined {
  const match = /^(\d+)\.(\d+)\.(\d+)(?:-(alpha|beta|rc)\.(\d+))?$/u.exec(version ?? '')
  if (match === null) return undefined
  const channel = (match[4] ?? 'stable') as UpstreamChannel
  const revision = match[5] === undefined ? 0 : Number(match[5])
  return [Number(match[1]), Number(match[2]), Number(match[3]), channel, revision]
}

export function compareVersions(a: UpstreamVersionTuple, b: UpstreamVersionTuple): number {
  for (const index of [0, 1, 2] as const) {
    if (a[index] > b[index]) return 1
    if (a[index] < b[index]) return -1
  }
  const channelRank = { alpha: 0, beta: 1, rc: 2, stable: 3 } as const
  const channelOrder = channelRank[a[3]] - channelRank[b[3]]
  return channelOrder !== 0 ? channelOrder : a[4] - b[4]
}

/**
 * A version is inside the tested window when it is >= the oldest tested
 * line and < the hard ceiling. Versions inside the window but above every
 * tested line are "supported, untested" — the boot guard treats them by
 * their contract-probe result, not by number alone.
 */
export function isCompatibleUpstreamVersion(version: string | undefined): boolean {
  const parsed = parseUpstreamVersion(version)
  const floor = parseUpstreamVersion(UPSTREAM_FLOOR_VERSION)
  const ceiling = parseUpstreamVersion(UPSTREAM_CEILING_VERSION)
  if (parsed === undefined || floor === undefined || ceiling === undefined) return false
  const exclusiveCeiling: UpstreamVersionTuple = [ceiling[0], ceiling[1], ceiling[2], 'alpha', 0]
  return compareVersions(parsed, floor) >= 0 && compareVersions(parsed, exclusiveCeiling) < 0
}

export const UPSTREAM_SUPPORTED_RANGE = `>=${UPSTREAM_FLOOR_VERSION} <${UPSTREAM_CEILING_VERSION}`

function resolvePackageJson(packageName: string): string | undefined {
  try {
    const path = import.meta.resolve(`${packageName}/package.json`)
    return path.startsWith('file:') ? fileURLToPath(path) : path
  } catch {
    // The package is not installed in this profile; it counts as missing.
    return undefined
  }
}

/**
 * The host CLI root: the package directory of the `dsh` entry the user
 * actually launched (`process.argv[1]`, e.g. `…/@deepseek-ai/dsh/lib/bin.js`
 * → `…/@deepseek-ai/dsh`). Version checks must read packages from there,
 * not from `import.meta.resolve`, which in a dev checkout resolves to the
 * devDependencies pins instead of the live host — that is how a
 * 0.1.5-rc.2 host once masqueraded as 0.1.2-rc.1.
 *
 * `argv[1]` often arrives as the PATH symlink (`…/bin/dsh`), which Node
 * does not resolve, so the walk-up runs on the realpath first; both the
 * symlink target and the raw path are candidates in case either layout is
 * in play.
 */
function hostRoot(): string | undefined {
  const entry = process.argv[1]
  if (entry === undefined) return undefined
  const candidates = new Set<string>()
  try {
    candidates.add(realpathSync(entry))
  } catch {
    // Broken symlink or unreadable path; the raw entry is still a candidate.
  }
  candidates.add(entry)
  for (const start of candidates) {
    let current = dirname(start)
    for (let depth = 0; depth < 8; depth++) {
      try {
        if ((JSON.parse(readFileSync(join(current, 'package.json'), 'utf8')) as { name?: string }).name === '@deepseek-ai/dsh') {
          return current
        }
      } catch {
        // Not a package root; keep walking up.
      }
      const parent = dirname(current)
      if (parent === current) break
      current = parent
    }
  }
  return undefined
}

function readVersionAt(base: string, packageName: string): string | undefined {
  const path = join(base, 'node_modules', packageName, 'package.json')
  try {
    const parsed = JSON.parse(readFileSync(path, 'utf8')) as { version?: string }
    return typeof parsed.version === 'string' ? parsed.version : undefined
  } catch {
    return undefined
  }
}

let cachedVersions: Record<string, string | undefined> | undefined

/**
 * Installed harness versions, resolved against the live host first: the
 * tree the running dsh CLI actually loads. Falls back to the module
 * resolution path (a dshtui-embedded tree) only when no host CLI is on
 * argv — the case when dshtui is imported as a library without the CLI.
 */
export function installedUpstreamVersions(): Record<string, string | undefined> {
  if (cachedVersions !== undefined) return cachedVersions
  const result: Record<string, string | undefined> = {}
  const root = hostRoot()
  for (const packageName of UPSTREAM_BLESSED_PACKAGES) {
    let version: string | undefined
    if (root !== undefined) {
      version = readVersionAt(root, packageName)
    }
    if (version === undefined) {
      const path = resolvePackageJson(packageName)
      if (path !== undefined) {
        try {
          version = (JSON.parse(readFileSync(path, 'utf8')) as { version?: string }).version
        } catch {
          // An unreadable package.json counts as an unknown version.
          version = undefined
        }
      }
    }
    result[packageName] = version
  }
  cachedVersions = Object.freeze(result)
  return cachedVersions
}

export function installedUpstreamLines(
  installedVersions: Readonly<Record<string, string | undefined>> = installedUpstreamVersions(),
): string[] {
  const lines = new Set<string>()
  for (const packageName of UPSTREAM_BLESSED_PACKAGES) {
    if (UPSTREAM_FRAMEWORK_MAJORS[packageName] !== undefined) continue
    const version = installedVersions[packageName]
    if (version !== undefined && parseUpstreamVersion(version) !== undefined) lines.add(version)
  }
  return [...lines].sort((a, b) => compareVersions(parseUpstreamVersion(a)!, parseUpstreamVersion(b)!))
}

export function upstreamDrift(
  installedVersions: Readonly<Record<string, string | undefined>> = installedUpstreamVersions(),
): UpstreamDriftEntry[] {
  const drift: UpstreamDriftEntry[] = []
  for (const [packageName, installed] of Object.entries(installedVersions)) {
    const frameworkMajor = UPSTREAM_FRAMEWORK_MAJORS[packageName]
    const matches = frameworkMajor !== undefined
      ? Number((installed ?? '').split('.')[0]) === frameworkMajor
      : isCompatibleUpstreamVersion(installed)
    if (!matches) {
      drift.push({
        package: packageName,
        installed,
        expected: frameworkMajor !== undefined ? `major ${frameworkMajor}` : UPSTREAM_SUPPORTED_RANGE,
      })
    }
  }
  return drift
}

export type UpstreamDriftKind = 'newer' | 'older' | 'mixed' | 'broken'

export interface UpstreamDriftSummary {
  kind: UpstreamDriftKind
  versions: string[]
}

export function upstreamDriftSummary(
  installedVersions: Readonly<Record<string, string | undefined>> = installedUpstreamVersions(),
): UpstreamDriftSummary | undefined {
  const drift = upstreamDrift(installedVersions)
  if (drift.length === 0) return undefined
  const harness = drift.filter(entry => UPSTREAM_FRAMEWORK_MAJORS[entry.package] === undefined)
  const versions = [...new Set(drift.map(entry => entry.installed ?? 'missing'))]
  let kind: UpstreamDriftKind
  if (harness.length === 0) {
    kind = 'broken'
  } else {
    const parsed = harness
      .map(entry => parseUpstreamVersion(entry.installed))
      .filter((entry): entry is UpstreamVersionTuple => entry !== undefined)
    if (parsed.length !== harness.length) {
      kind = 'broken'
    } else {
      const floor = parseUpstreamVersion(UPSTREAM_FLOOR_VERSION)!
      const ceiling = parseUpstreamVersion(UPSTREAM_CEILING_VERSION)!
      const exclusiveCeiling: UpstreamVersionTuple = [ceiling[0], ceiling[1], ceiling[2], 'alpha', 0]
      const allNewer = parsed.every(entry => compareVersions(entry, exclusiveCeiling) >= 0)
      const allOlder = parsed.every(entry => compareVersions(entry, floor) < 0)
      if (allNewer) kind = 'newer'
      else if (allOlder) kind = 'older'
      else kind = 'mixed'
    }
  }
  return { kind, versions }
}

/**
 * Calling conventions dshtui relies on, probed against the live host at
 * boot. A version number can sit inside the supported range while the host
 * moved its internal contract (that is exactly what 0.1.5-rc.2 did to the
 * agent-loop setup callback); the probes catch that directly.
 *
 * Each probe throws a `ProbeFailure` describing what is missing so the boot
 * screen can tell the user precisely which dshtui/host pair to install.
 */
export interface HostContractProbe {
  id: string
  probe(ctx: unknown): void
}

export class ProbeFailure extends Error {}

function requireObject(ctx: unknown, what: string): Record<string, unknown> {
  if (ctx === null || typeof ctx !== 'object') throw new ProbeFailure(`${what} is unavailable`)
  return ctx as Record<string, unknown>
}

function requireFunction(owner: Record<string, unknown>, path: string): (...args: never[]) => unknown {
  const [head, ...rest] = path.split('.')
  let value: unknown = owner[head!]
  for (const part of rest) {
    if (value === null || typeof value !== 'object') throw new ProbeFailure(`host is missing ${path}`)
    value = (value as Record<string, unknown>)[part!]
  }
  if (typeof value !== 'function') throw new ProbeFailure(`host is missing ${path}`)
  return value as (...args: never[]) => unknown
}

/**
 * The live-contract probes. They run before any UI mounts and stay in lockstep
 * with what src/chat/bridge.ts actually calls:
 * - agentLoop.createAgent: the async createAgent path used by the bridge;
 * - agents/session registries: the services the bridge resolves at boot;
 * - llm/agentDefaultModel/settings: injected services read during bridge setup.
 */
export const HOST_CONTRACT_PROBES: readonly HostContractProbe[] = [
  {
    id: 'agent-loop',
    probe(ctx) {
      const loop = requireObject(ctx, 'host context').agentLoop
      if (loop === undefined || typeof loop !== 'object') throw new ProbeFailure('host is missing the agentLoop service')
      const loopRecord = loop as Record<string, unknown>
      // dshtui uses the async createAgent(ctx, options) form; hosts without it
      // fall back to the sync create() path, so either must exist.
      if (typeof loopRecord.createAgent !== 'function' && typeof loopRecord.create !== 'function') {
        throw new ProbeFailure('host agentLoop exposes neither createAgent() nor create()')
      }
    },
  },
  {
    id: 'session-services',
    probe(ctx) {
      const record = requireObject(ctx, 'host context')
      for (const service of ['agents', 'sessions', 'llm', 'settings', 'credentials', 'agentDefaultModel'] as const) {
        if (record[service] === undefined) throw new ProbeFailure(`host is missing the ${service} service`)
      }
    },
  },
]

/**
 * Run every contract probe against the live host context. Returns the first
 * failure, or undefined when the host satisfies the contract.
 */
export function probeHostContract(ctx: unknown): ProbeFailure | undefined {
  for (const contract of HOST_CONTRACT_PROBES) {
    try {
      contract.probe(ctx)
    } catch (cause) {
      if (cause instanceof ProbeFailure) return cause
      return new ProbeFailure(cause instanceof Error ? cause.message : String(cause))
    }
  }
  return undefined
}

/** Where the installed host sits relative to the lines this build was tested on. */
export type HostPosition = 'older' | 'matched' | 'newer' | 'unknown'

/**
 * Compare the highest installed harness line against TESTED_VERSIONS. The
 * direction decides the fix text: an older host means "upgrade the CLI",
 * while a newer host means "update dshtui (or downgrade the CLI)" — the
 * latter must never point the user at @latest, which would move them even
 * further from the compatible pair.
 */
export function hostVersusTested(
  installedVersions: Readonly<Record<string, string | undefined>> = installedUpstreamVersions(),
): HostPosition {
  const lines = installedUpstreamLines(installedVersions)
  if (lines.length === 0) return 'unknown'
  const newest = parseUpstreamVersion(lines[lines.length - 1])
  if (newest === undefined) return 'unknown'
  const newestTested = parseUpstreamVersion(TESTED_VERSIONS[TESTED_VERSIONS.length - 1])
  const oldestTested = parseUpstreamVersion(TESTED_VERSIONS[0])
  if (newestTested === undefined || oldestTested === undefined) return 'unknown'
  if (compareVersions(newest, oldestTested) < 0) return 'older'
  if (compareVersions(newest, newestTested) > 0) return 'newer'
  return 'matched'
}
