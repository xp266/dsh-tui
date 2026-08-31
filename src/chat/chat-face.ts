import type { TuiChatFace } from '../contract/index.ts'
import type { ChatBridge } from './bridge.ts'

export function createChatFace(bridge: ChatBridge): TuiChatFace {
  return {
    cwd: () => bridge.cwd(),
    activeSessionId: () => bridge.activeSessionId(),
    onEvent: listener => bridge.subscribe(listener),
    send: text => bridge.send(text),
    interrupt: () => bridge.interrupt(),
    newSession: () => bridge.newSession(),
    openSession: id => bridge.openSession(id),
    listSessions: () => bridge.listSessions(),
  }
}
