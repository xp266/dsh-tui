import { render } from 'ink'
import type { Context } from '@deepseek-ai/cordis'
import { App } from './ui/app.tsx'
import { createChatBridge } from './chat/bridge.ts'
import type { ChatBridge } from './chat/bridge.ts'
import { createScreenCapture } from './terminal/screen.ts'
import { startHotTheme } from './hot-theme.ts'

export const name = 'dsh-tui'

export const inject = ['agentLoop', 'agents', 'sessions', 'workspaceRegistry', 'llm', 'settings', 'credentials', 'agentDefaultModel']

export function apply(ctx: Context) {
  ctx.effect(() => {
    const capture = createScreenCapture()
    let bridge: ChatBridge | undefined
    let themeTick = 0
    let appNode = <App screen={capture} />
    const app = render(appNode, {
      stdout: capture.stream,
      alternateScreen: true,
      exitOnCtrlC: false,
      incrementalRendering: true,
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
      .then(loaded => {
        bridge = loaded
        appNode = <App bridge={loaded} screen={capture} />
        app.rerender(appNode)
      })
      .catch(error => console.error('chat bridge init failed', error))
    const hotTheme = startHotTheme(() => {
      themeTick += 1
      appNode = <App bridge={bridge} screen={capture} themeTick={themeTick} />
      app.rerender(appNode)
    })
    return () => {
      clearInterval(sizePoll)
      hotTheme?.stop()
      capture.stream.off('resize', onResize)
      process.stdout.write('\x1b[0 q')
      app.unmount()
    }
  })
}