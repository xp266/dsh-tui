import { homedir } from 'node:os'
import { join, resolve } from 'node:path'

export const DSH_HOME_DIR_NAME = '.dsh'
export const DSH_HOME_ENV = 'DSH_HOME'

function expandHomePath(path: string): string {
  if (path === '~') return homedir()
  if (path.startsWith('~/') || path.startsWith('~\\')) return join(homedir(), path.slice(2))
  return path
}

/**
 * Resolve the DeepSeek Harness home the same way the harness does:
 * `$DSH_HOME` when set (blank counts as unset), otherwise `~/.dsh`.
 * Mirrors @deepseek-ai/dsh-home-paths without depending on it.
 */
export function resolveDshHome(env: Record<string, string | undefined> = process.env): string {
  const fromEnv = env[DSH_HOME_ENV]
  const selected = fromEnv !== undefined && fromEnv.trim().length > 0 ? fromEnv : join(homedir(), DSH_HOME_DIR_NAME)
  return resolve(expandHomePath(selected))
}
