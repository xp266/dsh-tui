import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

export const UPSTREAM_FLOOR_VERSION = '0.1.0-rc.6'

export const UPSTREAM_CEILING_VERSION = '0.2.0'

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

export const UPSTREAM_SUPPORTED_RANGE = `>=${UPSTREAM_FLOOR_VERSION} <${UPSTREAM_CEILING_VERSION}`

export function isCompatibleUpstreamVersion(version: string | undefined): boolean {
  const parsed = parseUpstreamVersion(version)
  const floor = parseUpstreamVersion(UPSTREAM_FLOOR_VERSION)
  const ceiling = parseUpstreamVersion(UPSTREAM_CEILING_VERSION)
  if (parsed === undefined || floor === undefined || ceiling === undefined) return false
  const exclusiveCeiling: UpstreamVersionTuple = [ceiling[0], ceiling[1], ceiling[2], 'alpha', 0]
  return compareVersions(parsed, floor) >= 0 && compareVersions(parsed, exclusiveCeiling) < 0
}

function resolvePackageJson(packageName: string): string | undefined {
  try {
    const path = import.meta.resolve(`${packageName}/package.json`)
    return path.startsWith('file:') ? fileURLToPath(path) : path
  } catch {
    // The package is not installed in this profile; it counts as missing.
    return undefined
  }
}

let cachedVersions: Record<string, string | undefined> | undefined

export function installedUpstreamVersions(): Record<string, string | undefined> {
  if (cachedVersions !== undefined) return cachedVersions
  const result: Record<string, string | undefined> = {}
  for (const packageName of UPSTREAM_BLESSED_PACKAGES) {
    let version: string | undefined
    const path = resolvePackageJson(packageName)
    if (path !== undefined) {
      try {
        version = (JSON.parse(readFileSync(path, 'utf8')) as { version?: string }).version
      } catch {
        // An unreadable package.json counts as an unknown version.
        version = undefined
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
