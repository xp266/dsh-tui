#!/usr/bin/env node
/**
 * dshtui — standalone launcher. Boots the DeepSeek Harness profile that
 * carries this TUI, equivalent to `dsh --profile <profile> [args...]`.
 *
 * The dsh CLI's subcommands are hardcoded upstream, so the command lives in
 * this package's bin. Profile resolution: DSH_TUI_PROFILE overrides; else the
 * `dshtui` profile when it exists; else the one profile that already mounts
 * this package (an existing profile carries the user's session history —
 * bootstrapping a fresh one would hide it); else the `dshtui` profile is
 * bootstrapped. Before an install or upgrade, the profile's
 * minimumReleaseAgeExclude gains this package's name so pnpm's
 * supply-chain age policy never rejects freshly published releases.
 *
 * This file must stay free of lib/ imports so it works from a global
 * install, a profile copy, and a dev checkout alike.
 */
import { spawn, spawnSync } from 'node:child_process'
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const packageRoot = dirname(dirname(fileURLToPath(import.meta.url)))
const manifest = JSON.parse(readFileSync(join(packageRoot, 'package.json'), 'utf8'))
const packageName = manifest.name
const windows = process.platform === 'win32'
const dshHome = process.env.DSH_HOME ?? join(homedir(), '.dsh')
const profilesDir = join(dshHome, 'profiles')

function fail(message) {
  console.error(`dshtui: ${message}`)
  process.exit(1)
}

// cmd.exe cannot escape a double quote inside a quoted argument (a
// backslash before `"` ends the quoted region, opening an injection path),
// so arguments carrying one are refused instead of half-escaped; `%` is
// refused because cmd expands %VAR% even inside quotes. Everything else
// rides inside a quoted string, where cmd keeps metacharacters literal.
const UNSAFE_WINDOWS_ARG = /["%\r\n]/
const quote = arg => {
  if (UNSAFE_WINDOWS_ARG.test(arg)) {
    fail(`argument "${arg}" cannot be passed safely through cmd.exe; run the dsh command directly`)
  }
  return /^[A-Za-z0-9_@+=:,./-]+$/.test(arg) ? arg : `"${arg}"`
}
// Windows resolves `dsh` through a .cmd shim, which only spawns with a
// shell; the command line is one quoted string there because passing an
// args array alongside shell:true is deprecated (DEP0190).
function runDsh(args) {
  return windows
    ? spawnSync(['dsh', ...args].map(quote).join(' '), { stdio: 'inherit', shell: true })
    : spawnSync('dsh', args, { stdio: 'inherit' })
}

function probeDsh() {
  return windows
    ? spawnSync(['dsh', '--version'].map(quote).join(' '), { stdio: 'ignore', shell: true })
    : spawnSync('dsh', ['--version'], { stdio: 'ignore' })
}

function readJson(path) {
  try {
    return JSON.parse(readFileSync(path, 'utf8'))
  } catch {
    return undefined
  }
}

function profileMountsPackage(profileDir) {
  const profileManifest = readJson(join(profileDir, 'package.json'))
  if (profileManifest === undefined) return false
  const bundles = profileManifest?.dsh?.profile?.bundles ?? []
  if (bundles.includes(packageName)) return true
  return packageName in (profileManifest.dependencies ?? {})
}

function installedVersion(profileDir) {
  return readJson(join(profileDir, 'node_modules', packageName, 'package.json'))?.version
}

// Release ordering includes the prerelease channel: comparing cores only
// left a beta/rc install equal to the matching stable and permanently
// stuck on it (0.1.30-beta.1 never upgraded to 0.1.30).
const CHANNEL_RANK = { alpha: 0, beta: 1, rc: 2, stable: 3 }

function versionKey(version) {
  const [core, tag] = version.split('-')
  const match = /^(alpha|beta|rc)\.(\d+)$/.exec(tag ?? '')
  return [
    ...core.split('.').map(Number),
    match === null ? CHANNEL_RANK.stable : CHANNEL_RANK[match[1]],
    match === null ? 0 : Number(match[2]),
  ]
}

function versionLessThan(installed, wanted) {
  const a = versionKey(installed)
  const b = versionKey(wanted)
  for (let index = 0; index < 5; index++) {
    if ((a[index] ?? 0) !== (b[index] ?? 0)) return (a[index] ?? 0) < (b[index] ?? 0)
  }
  return false
}

function ensureReleaseAgeExclude(profileDir) {
  // The exclude matches the bare package name, so every version of this
  // package bypasses the age policy while the rest of the tree stays
  // protected by it.
  const workspaceFile = join(profileDir, 'pnpm-workspace.yaml')
  let content = ''
  try {
    content = readFileSync(workspaceFile, 'utf8')
  } catch {
    return
  }
  if (new RegExp(`- ['"]?${packageName.replace('/', '\\/')}['"]?\\s*$`, 'm').test(content)) return
  const line = `  - '${packageName}'`
  content = /^minimumReleaseAgeExclude:\s*$/m.test(content)
    ? content.replace(/^minimumReleaseAgeExclude:\s*$/m, `minimumReleaseAgeExclude:\n${line}`)
    : `${content.trimEnd()}\nminimumReleaseAgeExclude:\n${line}\n`
  writeFileSync(workspaceFile, content)
}

function resolveProfile() {
  const override = process.env.DSH_TUI_PROFILE
  if (override !== undefined) return override
  if (profileMountsPackage(join(profilesDir, 'dshtui'))) return 'dshtui'
  const candidates = existsSync(profilesDir)
    ? readdirSync(profilesDir).filter(name => name !== 'node_modules' && profileMountsPackage(join(profilesDir, name)))
    : []
  if (candidates.length === 1) return candidates[0]
  if (candidates.length > 1) {
    fail(`multiple profiles mount ${packageName} (${candidates.join(', ')}); pick one with DSH_TUI_PROFILE=<name>`)
  }
  return 'dshtui'
}

const profile = resolveProfile()
const profileDir = join(profilesDir, profile)
const dshProbe = probeDsh()
if (dshProbe.error !== undefined || dshProbe.status !== 0) {
  fail('the dsh CLI was not found on PATH; install it with: npm install -g @deepseek-ai/dsh')
}

if (!existsSync(profileDir)) {
  console.error(`dshtui: profile "${profile}" not found under ${profilesDir}; installing ${packageName}@${manifest.version} into it`)
  const bootstrap = runDsh(['plugin', '--profile', profile, 'add', `${packageName}@${manifest.version}`])
  if (bootstrap.status !== 0) {
    fail(`bootstrapping the profile failed; run manually: dsh plugin --profile ${profile} add ${packageName}`)
  }
} else {
  const installed = installedVersion(profileDir)
  if (installed !== undefined && versionLessThan(installed, manifest.version)) {
    ensureReleaseAgeExclude(profileDir)
    console.error(`dshtui: upgrading profile "${profile}": ${packageName} ${installed} -> ${manifest.version}`)
    const upgrade = runDsh(['plugin', '--profile', profile, 'add', `${packageName}@${manifest.version}`])
    if (upgrade.status !== 0) {
      fail(`the upgrade failed; run manually: dsh plugin --profile ${profile} add ${packageName}@${manifest.version}`)
    }
  }
}

const argv = process.argv.slice(2)
const command = ['dsh', '--profile', profile, ...argv].map(quote).join(' ')
const child = spawn(windows ? command : 'dsh', windows ? [] : ['--profile', profile, ...argv], {
  stdio: 'inherit',
  ...(windows ? { shell: true } : {}),
})
child.on('error', () => {
  fail('the dsh CLI was not found on PATH; install it with: npm install -g @deepseek-ai/dsh')
})
child.on('close', (status, signal) => {
  if (signal !== null) {
    process.kill(process.pid, signal)
    return
  }
  process.exit(status ?? 1)
})
