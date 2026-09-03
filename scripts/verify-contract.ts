/**
 * CI gate for the upstream compatibility contract: fails when any blessed
 * official package is installed at a version outside the supported upstream
 * range, so an incompatible install breaks CI before user machines.
 *
 * Run via `node --import tsx/esm scripts/verify-contract.ts`.
 */
import assert from 'node:assert/strict'
import { compareVersions, installedUpstreamLines, isCompatibleUpstreamVersion, parseUpstreamVersion, upstreamDrift, upstreamDriftSummary, UPSTREAM_BLESSED_PACKAGES, UPSTREAM_FRAMEWORK_MAJORS, UPSTREAM_SUPPORTED_RANGE } from '../src/contract/upstream.ts'

const floor = parseUpstreamVersion('0.1.0-rc.6')!
assert.ok(compareVersions(floor, parseUpstreamVersion('0.1.0-rc.7')!) < 0)
assert.deepEqual(parseUpstreamVersion('1.2.3'), [1, 2, 3, 'stable', 0])
assert.equal(parseUpstreamVersion('garbage'), undefined)
assert.equal(parseUpstreamVersion(undefined), undefined)

assert.ok(isCompatibleUpstreamVersion('0.1.0-rc.6'))
assert.ok(isCompatibleUpstreamVersion('0.1.0-rc.7'))
assert.ok(isCompatibleUpstreamVersion('0.1.1-rc.1'))
assert.ok(isCompatibleUpstreamVersion('0.1.2-alpha.2'))
assert.ok(isCompatibleUpstreamVersion('0.1.5'))
assert.ok(!isCompatibleUpstreamVersion('0.1.0-rc.5'))
assert.ok(!isCompatibleUpstreamVersion('0.2.0-alpha.1'))
assert.ok(!isCompatibleUpstreamVersion('0.2.0'))
assert.ok(!isCompatibleUpstreamVersion('1.0.0'))
assert.ok(!isCompatibleUpstreamVersion(undefined))

function versionFor(packageName: string): string {
  const major = UPSTREAM_FRAMEWORK_MAJORS[packageName]
  if (major !== undefined) return `${major}.0.1`
  return '0.1.0-rc.6'
}

const compatibleTree = Object.fromEntries(UPSTREAM_BLESSED_PACKAGES.map(packageName => [packageName, versionFor(packageName)]))

assert.deepEqual(installedUpstreamLines(compatibleTree), ['0.1.0-rc.6'])
assert.deepEqual(upstreamDrift(compatibleTree), [])
assert.equal(upstreamDriftSummary(compatibleTree), undefined)
assert.deepEqual(upstreamDriftSummary({ '@deepseek-ai/dsh-llm': '0.2.0-rc.1' }), { kind: 'newer', versions: ['0.2.0-rc.1'] })
assert.deepEqual(upstreamDriftSummary({ '@deepseek-ai/dsh-llm': '0.1.0-rc.5' }), { kind: 'older', versions: ['0.1.0-rc.5'] })
assert.deepEqual(upstreamDriftSummary({ '@deepseek-ai/dsh-llm': '0.1.0-rc.5', '@deepseek-ai/dsh-session': '0.2.0-rc.1' }), {
  kind: 'mixed',
  versions: ['0.1.0-rc.5', '0.2.0-rc.1'],
})

const installedLines = installedUpstreamLines()
const drift = upstreamDrift()
if (installedLines.length > 1) {
  console.error(`upstream contract violated (mixed harness lines: ${installedLines.join(', ')})`)
}
if (drift.length > 0) {
  console.error(`upstream contract violated (supported: ${UPSTREAM_SUPPORTED_RANGE}):`)
  for (const entry of drift) {
    console.error(`  - ${entry.package}: installed=${entry.installed ?? 'missing'} (expected ${entry.expected})`)
  }
}
if (installedLines.length > 1 || drift.length > 0) process.exit(1)
console.log(`upstream contract OK (supported: ${UPSTREAM_SUPPORTED_RANGE})`)
