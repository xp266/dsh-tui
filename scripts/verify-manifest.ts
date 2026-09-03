/**
 * CI gate for dependency manifest consistency: every upstream package the
 * plugin imports at runtime or as types must be declared as both an optional
 * peer dependency (the harness provides it) and a dev dependency (so this
 * project type-checks against it). Runtime-only imports must not leak into
 * `dependencies`, and every peer-range branch must sit inside the supported
 * upstream range owned by `src/contract/upstream.ts`.
 *
 * Run via `node --import tsx/esm scripts/verify-manifest.ts`.
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { isCompatibleUpstreamVersion, UPSTREAM_BLESSED_PACKAGES, UPSTREAM_FRAMEWORK_MAJORS, UPSTREAM_SUPPORTED_RANGE } from '../src/contract/upstream.ts'

const root = fileURLToPath(new URL('..', import.meta.url))
const manifest = JSON.parse(readFileSync(`${root}package.json`, 'utf8')) as {
  peerDependencies?: Record<string, string>
  peerDependenciesMeta?: Record<string, { optional?: boolean }>
  devDependencies?: Record<string, string>
  dependencies?: Record<string, string>
}

const peer = new Set(Object.keys(manifest.peerDependencies ?? {}))
const dev = new Set(Object.keys(manifest.devDependencies ?? {}))
const runtime = new Set(Object.keys(manifest.dependencies ?? {}))
const blessed = new Set<string>(UPSTREAM_BLESSED_PACKAGES)
const optional = new Set(
  Object.entries(manifest.peerDependenciesMeta ?? {})
    .filter(([, meta]) => meta.optional === true)
    .map(([name]) => name),
)

const failures: string[] = []

for (const packageName of UPSTREAM_BLESSED_PACKAGES) {
  if (!peer.has(packageName)) failures.push(`${packageName}: blessed upstream package must be a peer dependency`)
  if (!dev.has(packageName)) failures.push(`${packageName}: upstream package must be a dev dependency for type-checking`)
  if (runtime.has(packageName)) failures.push(`${packageName}: upstream package must not be a runtime dependency (harness provides it)`)
  if (!optional.has(packageName)) failures.push(`${packageName}: peer dependency must be marked optional in peerDependenciesMeta`)
}

const PEER_BRANCH_PATTERN = /\^(\d+\.\d+\.\d+-(?:alpha|beta|rc)\.\d+)/g
for (const packageName of UPSTREAM_BLESSED_PACKAGES) {
  if (UPSTREAM_FRAMEWORK_MAJORS[packageName] !== undefined) continue
  const range = manifest.peerDependencies?.[packageName]
  if (range === undefined) continue
  const branches = [...range.matchAll(PEER_BRANCH_PATTERN)].map(match => match[1])
  if (branches.length === 0) {
    failures.push(`${packageName}: peer range must list one caret prerelease branch per shipped upstream line`)
    continue
  }
  for (const branch of branches) {
    if (!isCompatibleUpstreamVersion(branch)) {
      failures.push(`${packageName}: peer branch ${branch} is outside the supported upstream range (${UPSTREAM_SUPPORTED_RANGE}); move the floor/ceiling first`)
    }
  }
}

for (const [packageName, pin] of Object.entries(manifest.devDependencies ?? {})) {
  if (!blessed.has(packageName) || UPSTREAM_FRAMEWORK_MAJORS[packageName] !== undefined) continue
  if (!/^\d+\.\d+\.\d+-(?:alpha|beta|rc)\.\d+$/.test(pin)) {
    failures.push(`${packageName}: dev dependency must be an exact prerelease pin for type-checking (got ${pin})`)
  } else if (!isCompatibleUpstreamVersion(pin)) {
    failures.push(`${packageName}: dev pin ${pin} is outside the supported upstream range (${UPSTREAM_SUPPORTED_RANGE})`)
  }
}

for (const packageName of peer) {
  if (!blessed.has(packageName)) {
    failures.push(`${packageName}: peer dependency not in the blessed upstream set`)
  }
}

if (failures.length > 0) {
  console.error('manifest-deps violations:')
  for (const failure of failures) console.error(`  - ${failure}`)
  process.exit(1)
}
console.log(`manifest-deps OK (${UPSTREAM_BLESSED_PACKAGES.length} blessed upstream packages, supported range ${UPSTREAM_SUPPORTED_RANGE})`)
