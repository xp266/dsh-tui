import { Console } from 'node:console'

process.env.FORCE_COLOR = '2'

const consoleObject = globalThis.console as unknown as Record<string, unknown>
if (typeof consoleObject.Console !== 'function') {
  consoleObject.Console = Console
}
