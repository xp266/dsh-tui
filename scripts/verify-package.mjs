/**
 * CI gate for package integrity: every `exports` target must exist in the
 * built `lib/` directory, and the runtime entry points must import without
 * throwing. Run after `pnpm build`.
 */
import { accessSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const root = fileURLToPath(new URL('..', import.meta.url))
const manifest = JSON.parse(readFileSync(`${root}package.json`, 'utf8'))

function checkFile(path, label) {
  try {
    accessSync(resolve(root, path))
  } catch {
    console.error(`package target missing: ${label} -> ${path}`)
    process.exit(1)
  }
}

const targets = []
if (manifest.main !== undefined) targets.push({ path: manifest.main, label: 'main' })
if (manifest.types !== undefined) targets.push({ path: manifest.types, label: 'types' })
for (const [name, spec] of Object.entries(manifest.exports ?? {})) {
  if (name === './package.json') continue
  if (typeof spec === 'string') {
    targets.push({ path: spec, label: `exports.${name}` })
  } else {
    if (spec.types !== undefined) targets.push({ path: spec.types, label: `exports.${name}.types` })
    if (spec.default !== undefined) targets.push({ path: spec.default, label: `exports.${name}.default` })
  }
}

for (const target of targets) checkFile(target.path, target.label)

const mainDefault = manifest.exports?.['.']
const entryPath = typeof mainDefault === 'object' && mainDefault !== null && 'default' in mainDefault
  ? mainDefault.default
  : manifest.main
if (entryPath === undefined) {
  console.error('package entry point not found')
  process.exit(1)
}
for (const entry of [...new Set([manifest.main, entryPath].filter(Boolean))]) {
  const entryUrl = pathToFileURL(resolve(root, entry))
  entryUrl.searchParams.set('t', String(Date.now()))
  try {
    await import(entryUrl.href)
  } catch (cause) {
    console.error(`entry import failed: ${entry}`)
    console.error(cause)
    process.exit(1)
  }
}

console.log(`package OK (${targets.length} targets, entry ${entryPath})`)
