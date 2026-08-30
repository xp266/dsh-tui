import { Console } from 'node:console'

process.env.FORCE_COLOR = '2'
process.env.TERM = 'xterm-256color'
process.env.LANG = 'en_US.UTF-8'

const consoleObject = globalThis.console as unknown as Record<string, unknown>
if (typeof consoleObject.Console !== 'function') {
  consoleObject.Console = Console
}
