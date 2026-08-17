import { render } from 'ink'
import type { Context } from '@deepseek-ai/cordis'
import { App } from './ui/app.tsx'
import { createChatBridge } from './chat/bridge.ts'

export const name = 'dsh-tui'

export const inject = ['agentLoop', 'llm', 'settings', 'credentials', 'agentDefaultModel']

export function apply(ctx: Context) {
  ctx.effect(() => {
    const app = render(<App />, { alternateScreen: true, exitOnCtrlC: false, incrementalRendering: true, maxFps: 60 })
    void createChatBridge(ctx)
      .then(bridge => app.rerender(<App bridge={bridge} />))
      .catch(error => console.error('chat bridge init failed', error))
    return () => {
      process.stdout.write('\x1b[0 q')
      app.unmount()
    }
  })
}