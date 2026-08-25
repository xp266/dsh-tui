import './terminal/truecolor.ts'
import { render } from 'ink'
import type { Context } from '@deepseek-ai/cordis'
import { App } from './ui/app.tsx'
import { createChatBridge } from './chat/bridge.ts'
import type { ChatBridge } from './chat/bridge.ts'
import { createScreenCapture } from './terminal/screen.ts'
import { writeCursorShape } from './terminal/cursor-shape.ts'
import { startHotTheme } from './hot-theme.ts'
import { warmLanguages, onLanguagesWarm, clearHighlightCache } from './ui/message/md/highlight.ts'
import { clearMarkdownBlockCache } from './ui/message/md/engine.ts'
import { clearWrapCache } from './ui/message/layout.ts'

export const name = 'dsh-tui'

export const inject = ['agentLoop', 'agents', 'sessions', 'workspaceRegistry', 'llm', 'settings', 'credentials', 'agentDefaultModel']

export function apply(ctx: Context) {
  ctx.effect(() => {
    warmLanguages()
    onLanguagesWarm(() => {
      clearHighlightCache()
      clearMarkdownBlockCache()
      clearWrapCache()
    })
    const capture = createScreenCapture()
    let bridge: ChatBridge | undefined
    let themeTick = 0
    const buildAppNode = () => <App bridge={bridge} screen={capture} themeTick={themeTick} />
    const app = render(buildAppNode(), {
      stdout: capture.stream,
      alternateScreen: true,
      exitOnCtrlC: false,
      incrementalRendering: false,
      maxFps: 240,
    })
    let lastColumns = capture.stream.columns
    let lastRows = capture.stream.rows
    const onResize = () => {
      lastColumns = capture.stream.columns
      lastRows = capture.stream.rows
      capture.stream.write('\x1b[2J\x1b[3J\x1b[H')
      app.clear()
      app.rerender(buildAppNode())
    }
    capture.stream.on('resize', onResize)
    const sizePoll = setInterval(() => {
      if (capture.stream.columns !== lastColumns || capture.stream.rows !== lastRows) onResize()
    }, 1000)
    sizePoll.unref()
    void createChatBridge(ctx)
      .then(loaded => {
        bridge = loaded
        app.rerender(buildAppNode())
      })
      .catch(error => console.error('chat bridge init failed', error))
    const hotTheme = startHotTheme(() => {
      themeTick += 1
      app.rerender(buildAppNode())
    })
    return () => {
      clearInterval(sizePoll)
      hotTheme?.stop()
      capture.stream.off('resize', onResize)
      writeCursorShape('reset')
      app.unmount()
    }
  })
}