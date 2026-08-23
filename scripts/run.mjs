import { spawnSync } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const projectRoot = join(here, '..')
const rolldownBin = join(projectRoot, 'node_modules', '.bin', 'rolldown')

const build = spawnSync(rolldownBin, ['-c', join(here, 'rolldown.config.mjs')], {
  stdio: ['ignore', 'pipe', 'pipe'],
  encoding: 'utf8',
})
if (build.status !== 0) {
  process.stderr.write(build.stdout ?? '')
  process.stderr.write(build.stderr ?? '')
  process.exit(build.status ?? 1)
}

await import(join(here, 'dist', 'cli.mjs'))
