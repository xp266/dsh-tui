/**
 * Smoke-test the boot guard decision table without mounting ink.
 * Run: node --import tsx/esm scripts/smoke-boot-guard.ts
 */
process.env.DSH_TUI_LOG_FILE = '0' // no log writes during the smoke run

const { parseUpstreamVersion, compareVersions, isCompatibleUpstreamVersion, probeHostContract } = await import('../src/contract/upstream.ts')

const cases: Array<[string, boolean]> = [
  ['0.1.1-rc.9', false], // below floor
  ['0.1.2-rc.1', true], // floor
  ['0.1.2-rc.2', true], // tested
  ['0.1.5-rc.2', true], // inside range, above tested — the live WSL/Windows case
  ['0.2.0-rc.1', false], // ceiling
  ['1.0.0', false],
  ['garbage', false],
  [undefined as unknown as string, false],
]

let failures = 0
for (const [version, expected] of cases) {
  const actual = isCompatibleUpstreamVersion(version)
  const ok = actual === expected
  if (!ok) failures += 1
  console.log(`${ok ? 'ok' : 'FAIL'} isCompatible(${version}) = ${actual}`)
}

// Contract probe: a ctx missing agentLoop must fail the probe with a host message.
const missingLoop = probeHostContract({})
console.assert(missingLoop !== undefined, 'probe must fail on an empty ctx')
console.log(`ok probeHostContract({}) -> ${missingLoop?.message}`)

// A ctx that looks like the real host must pass.
const fakeHost = {
  agentLoop: { createAgent() {}, create() {} },
  agents: {}, sessions: {}, llm: {}, settings: {}, credentials: {}, agentDefaultModel: {},
}
const healthy = probeHostContract(fakeHost)
const ok = healthy === undefined
if (!ok) failures += 1
console.log(`${ok ? 'ok' : 'FAIL'} probeHostContract(fakeHost) = ${healthy?.message ?? 'undefined'}`)

// Ordering sanity.
const a = parseUpstreamVersion('0.1.2-rc.1')!
const b = parseUpstreamVersion('0.1.5-rc.2')!
const ordered = compareVersions(a, b) < 0
if (!ordered) failures += 1
console.log(`${ordered ? 'ok' : 'FAIL'} compare(0.1.2-rc.1 < 0.1.5-rc.2)`)

process.exit(failures === 0 ? 0 : 1)
