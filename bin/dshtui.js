#!/usr/bin/env node
/**
 * dshtui — standalone launcher. Boots the DeepSeek Harness profile that
 * carries this TUI, equivalent to `dsh --profile <profile> [args...]`.
 *
 * The dsh CLI's subcommands are hardcoded upstream, so the command lives in
 * this package's bin. Profile resolution: the
 * `dshtui` profile when it exists; else the one profile that already mounts
 * this package (an existing profile carries the user's session history —
 * bootstrapping a fresh one would hide it); else the `dshtui` profile is
 * bootstrapped. Before an install or upgrade, the profile's
 * minimumReleaseAgeExclude gains this package's name so pnpm's
 * supply-chain age policy never rejects freshly published releases.
 *
 * What gets installed depends on where this launcher runs from: a development
 * checkout (`.git` plus `src/`) links the profile at that tree, so a rebuilt
 * `lib/` takes effect on the next boot; any other install pins the published
 * version and upgrades when the version comparison says so.
 *
 * This file must stay free of lib/ imports so it works from a global
 * install, a profile copy, and a dev checkout alike.
 */
import { spawn, spawnSync } from 'node:child_process'
import { existsSync, readFileSync, readdirSync, realpathSync, statSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const packageRoot = dirname(dirname(fileURLToPath(import.meta.url)))
const manifest = JSON.parse(readFileSync(join(packageRoot, 'package.json'), 'utf8'))
const packageName = manifest.name
const windows = process.platform === 'win32'
const dshHome = process.env.DSH_HOME ?? join(homedir(), '.dsh')
const profilesDir = join(dshHome, 'profiles')

// Resolve the tree this launcher actually lives in. A global shim may hand us
// a junction to a checkout, and the profile spec must name the real directory
// so a link written from either invocation compares equal on the next run.
// Windows resolves the same path with either separator and either case, so
// the comparison normalizes both instead of demanding a byte match.
function realRoot(dir) {
  let resolved = dir
  try {
    resolved = realpathSync(dir)
  } catch {
    // An unresolvable root falls back to the path as invoked.
  }
  const normalized = resolved.replace(/\\/g, '/').replace(/\/+$/, '')
  return windows ? normalized.toLowerCase() : normalized
}

const checkoutRoot = realRoot(packageRoot)

// A tree carrying `.git` and `src/` is a development checkout, not a registry
// install. The profile must load that tree: a rebuilt lib/ at an unchanged
// version is invisible to the version comparison below, which is how a
// freshly pulled checkout kept booting the last published copy. Linking the
// profile at the checkout's real path makes every later build live at once.
function isDevCheckout(dir) {
  return existsSync(join(dir, '.git')) && existsSync(join(dir, 'src'))
}

const devSpec = isDevCheckout(checkoutRoot) ? `link:${checkoutRoot.replace(/\\/g, '/')}` : undefined

// The published package ships a prebuilt lib/, but lib/ is gitignored, so a
// fresh checkout has none and a rebuilt src/ leaves the previous bundle in
// place. Either way the profile would load stale code at an unchanged
// version — the exact failure the link spec exists to prevent — so the
// launcher rebuilds before boot when src/ is newer than the bundle.
function newestMtime(dir) {
  let newest = 0
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name)
    try {
      newest = Math.max(newest, entry.isDirectory() ? newestMtime(path) : statSync(path).mtimeMs)
    } catch {
      // A path that vanished mid-walk cannot be the newest source.
    }
  }
  return newest
}

function buildIsStale(root) {
  let built = 0
  try {
    built = statSync(join(root, 'lib', 'index.mjs')).mtimeMs
  } catch {
    return true // no bundle at all
  }
  try {
    return newestMtime(join(root, 'src')) > built
  } catch {
    // An unreadable src/ leaves the existing bundle in place.
    return false
  }
}

function ensureBuild(root) {
  if (process.env.DSH_TUI_NO_BUILD === '1') return
  if (!buildIsStale(root)) return
  if (!existsSync(join(root, 'node_modules'))) {
    fail(`the checkout at ${root} has no node_modules; run "pnpm install" there first`)
  }
  console.error(`dshtui: building ${root} (src/ is newer than lib/)`)
  // Same spawn shape as runDsh: pnpm resolves through a .cmd shim on Windows,
  // and passing an args array alongside shell:true is deprecated (DEP0190).
  const build = windows
    ? spawnSync(['pnpm', 'build'].map(quote).join(' '), { cwd: root, stdio: 'inherit', shell: true })
    : spawnSync('pnpm', ['build'], { cwd: root, stdio: 'inherit' })
  if (build.error !== undefined && build.error.code === 'ENOENT') {
    fail(`pnpm was not found on PATH; run "pnpm build" in ${root}, or set DSH_TUI_NO_BUILD=1 to boot the existing bundle`)
  }
  if (build.status !== 0) {
    fail(`the build failed in ${root}; run "pnpm build" there to see the full output`)
  }
}

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

// The dependency spec the profile carries for this package. A `link:` entry
// names the checkout the profile currently loads; absent means the profile
// predates the spec check and must be reinstalled once.
function installedSpec(profileDir) {
  return readJson(join(profileDir, 'package.json'))?.dependencies?.[packageName]
}

// Whether the dependency spec points at this checkout. pnpm writes the link
// spec verbatim, but a hand-edited one may be relative or carry a trailing
// slash, so the comparison normalizes those instead of demanding a byte match.
function specTargets(spec, target, profileDir) {
  if (typeof spec !== 'string') return false
  const match = /^link:(.+)$/.exec(spec)
  if (match === null) return false
  const raw = match[1].replace(/[\\/]+$/, '')
  const anchored = /^([A-Za-z]:[\\/]|[\\/])/.test(raw) ? raw : join(profileDir, raw)
  return realRoot(anchored) === target
}

// The spec to install. A dev checkout links the tree this launcher runs from
// (so a rebuild is picked up without a version bump); anything else installs
// the published version.
function desiredSpec() {
  return devSpec ?? `${packageName}@${manifest.version}`
}

// Reinstall when the profile does not load what this launcher ships: a
// checkout whose link is missing or points elsewhere, a registry install
// behind the published version, or a published launcher reclaiming a profile
// a checkout had linked.
function needsInstall(profileDir) {
  const spec = installedSpec(profileDir)
  if (devSpec !== undefined) return !specTargets(spec, checkoutRoot, profileDir)
  if (typeof spec === 'string' && spec.startsWith('link:')) return true
  const installed = installedVersion(profileDir)
  return installed !== undefined && versionLessThan(installed, manifest.version)
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
  if (profileMountsPackage(join(profilesDir, 'dshtui'))) return 'dshtui'
  const candidates = existsSync(profilesDir)
    ? readdirSync(profilesDir).filter(name => name !== 'node_modules' && profileMountsPackage(join(profilesDir, name)))
    : []
  if (candidates.length === 1) return candidates[0]
  if (candidates.length > 1) {
    fail(`multiple profiles mount ${packageName} (${candidates.join(', ')}); remove it from all but one with: dsh plugin --profile <name> remove ${packageName}`)
  }
  return 'dshtui'
}

const profile = resolveProfile()
const profileDir = join(profilesDir, profile)
const dshProbe = probeDsh()
if (dshProbe.error !== undefined || dshProbe.status !== 0) {
  fail('the dsh CLI was not found on PATH; install it with: npm install -g @deepseek-ai/dsh')
}

const spec = desiredSpec()
if (!existsSync(profileDir)) {
  console.error(`dshtui: profile "${profile}" not found under ${profilesDir}; installing ${spec} into it`)
  const bootstrap = runDsh(['plugin', '--profile', profile, 'add', spec])
  if (bootstrap.status !== 0) {
    fail(`bootstrapping the profile failed; run manually: dsh plugin --profile ${profile} add ${spec}`)
  }
} else if (needsInstall(profileDir)) {
  // The release-age exclude only guards registry installs; a checkout link
  // never consults the registry. Writing it there would also mutate a file
  // the developer may have edited by hand for no benefit.
  if (devSpec === undefined) ensureReleaseAgeExclude(profileDir)
  const installed = installedVersion(profileDir) ?? 'none'
  console.error(`dshtui: ${devSpec === undefined ? 'upgrading' : 'linking'} profile "${profile}": ${packageName} ${installed} -> ${spec}`)
  const install = runDsh(['plugin', '--profile', profile, 'add', spec])
  if (install.status !== 0) {
    fail(`the install failed; run manually: dsh plugin --profile ${profile} add ${spec}`)
  }
}

// A linked checkout is served in place, so its bundle must match its source
// before the host loads it.
if (devSpec !== undefined) ensureBuild(checkoutRoot)

const argv = process.argv.slice(2)

// The legacy conhost renders this TUI noticeably worse than Windows Terminal
// (slower frame delivery, writes lost at exit). When we would boot inside
// conhost and Windows Terminal is installed, hand the session over: the
// notice lands in the original window, the TUI opens in a new WT tab, and
// this window returns to its prompt. Detection is deliberately conservative
// — every modern-host marker must be absent. A handoff-hosted console that
// fails to inject WT_SESSION would relaunch once; the new tab runs dsh
// directly, so the relaunch cannot loop.
const wtExe = process.env.LOCALAPPDATA === undefined
  ? ''
  : join(process.env.LOCALAPPDATA, 'Microsoft', 'WindowsApps', 'wt.exe')

function wtInstalled() {
  // App execution aliases are reparse points Node cannot stat (existsSync on
  // wt.exe answers false), so Windows Terminal presence is detected through
  // its package state directory, with the alias as a secondary signal.
  if (wtExe !== '' && existsSync(wtExe)) return true
  const packagesDir = process.env.LOCALAPPDATA === undefined ? '' : join(process.env.LOCALAPPDATA, 'Packages')
  if (packagesDir === '' || !existsSync(packagesDir)) return false
  try {
    return readdirSync(packagesDir).some(name => name.startsWith('Microsoft.WindowsTerminal_'))
  } catch {
    // An unreadable Packages directory counts as not installed.
    return false
  }
}

function shouldRelaunchToWt() {
  if (!windows) return false
  if (!process.stdin.isTTY) return false
  if (process.env.WT_SESSION !== undefined || process.env.TERM_PROGRAM !== undefined) return false
  return wtInstalled()
}

function relaunchToWt(profileName, args) {
  console.error('dshtui: the legacy console host renders this TUI poorly; reopening in Windows Terminal')
  // Every token here is re-parsed by cmd inside the new tab, so the same
  // fail-closed charset rule as the direct spawn applies.
  for (const token of [profileName, ...args]) {
    if (UNSAFE_WINDOWS_ARG.test(token)) {
      fail(`argument "${token}" cannot be passed safely through cmd.exe; run the dsh command directly`)
    }
  }
  // `cmd /k` keeps the new window open after dsh exits, matching the shell
  // the user would have returned to anyway.
  const result = spawnSync(wtExe, ['new-tab', '-d', process.cwd(), 'cmd', '/k', 'dsh', '--profile', profileName, ...args], {
    stdio: 'ignore',
    timeout: 15000,
  })
  if (result.error === undefined && result.status === 0) process.exit(0)
  console.error('dshtui: could not open Windows Terminal; continuing here')
}

if (shouldRelaunchToWt()) relaunchToWt(profile, argv)

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
