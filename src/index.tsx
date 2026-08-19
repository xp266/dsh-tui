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
    let appNode = <App screen={capture} />
    const app = render(appNode, {
      stdout: capture.stream,
      alternateScreen: true,
      exitOnCtrlC: false,
      incrementalRendering: false,
      maxFps: 60,
    })
    capture.stream.write('\x1b[?25h')
    let lastColumns = capture.stream.columns
    let lastRows = capture.stream.rows
    const onResize = () => {
      lastColumns = capture.stream.columns
      lastRows = capture.stream.rows
      capture.stream.write('\x1b[2J\x1b[3J\x1b[H')
      app.clear()
      app.rerender(appNode)
    }
    capture.stream.on('resize', onResize)
    const sizePoll = setInterval(() => {
      if (capture.stream.columns !== lastColumns || capture.stream.rows !== lastRows) onResize()
    }, 1000)
    sizePoll.unref()
    void createChatBridge(ctx)
      .then(bridge => {
        appNode = <App bridge={bridge} screen={capture} />
        app.rerender(appNode)
      })
      .catch(error => console.error('chat bridge init failed', error))
    return () => {
      clearInterval(sizePoll)
      capture.stream.off('resize', onResize)
      process.stdout.write('\x1b[0 q')
      app.unmount()
    }
  })
}