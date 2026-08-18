import { render } from 'ink'
import type { Context } from '@deepseek-ai/cordis'
import { App } from './ui/app.tsx'
import { createChatBridge } from './chat/bridge.ts'
import { createScreenCapture } from './terminal/screen.ts'

export const name = 'dsh-tui'

export const inject = ['agentLoop', 'agents', 'sessions', 'workspaceRegistry', 'llm', 'settings', 'credentials', 'agentDefaultModel']

export function apply(ctx: Context) {
  ctx.effect(() => {
    const capture = createScreenCapture()
    const app = render(<App screen={capture} />, {
      stdout: capture.stream,
      alternateScreen: true,
      exitOnCtrlC: false,
      incrementalRendering: false,
      maxFps: 60,
    })
    void createChatBridge(ctx)
      .then(bridge => app.rerender(<App bridge={bridge} screen={capture} />))
      .catch(error => console.error('chat bridge init failed', error))
    return () => {
      process.stdout.write('\x1b[0 q')
      app.unmount()
    }
  })
}