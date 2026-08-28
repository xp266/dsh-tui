import { registerWindowService } from './window-services.ts'
import type { ChatBridge } from '../chat/bridge.ts'
import type { TodoItemLike } from '../chat/todo-view.ts'

export function registerWindowServices(bridge: ChatBridge): () => void {
  const disposers = [
    registerWindowService('models', {
      listModels: bridge.listModels,
      selectModel: bridge.selectModel,
      addDeepSeekKey: bridge.addDeepSeekKey,
      fetchCustomModels: bridge.fetchCustomModels,
      saveCustomProvider: bridge.saveCustomProvider,
      listProviderDirectory: bridge.listProviderDirectory,
      fetchProviderModels: bridge.fetchProviderModels,
      saveBuiltinProvider: bridge.saveBuiltinProvider,
      readModelEntries: bridge.readModelEntries,
      saveModelEntry: bridge.saveModelEntry,
      deleteModelEntry: bridge.deleteModelEntry,
    }),
    registerWindowService('sessions', {
      listSessions: bridge.listSessions,
      openSession: bridge.openSession,
      newSession: bridge.newSession,
      archiveSession: bridge.archiveSession,
      activeSessionId: bridge.activeSessionId,
    }),
    registerWindowService('presets', {
      listPresets: bridge.listPresets,
      currentPreset: bridge.currentPreset,
      selectPreset: bridge.selectPreset,
    }),
    registerWindowService('efforts', {
      listEfforts: bridge.listEfforts,
      currentEffort: bridge.currentEffort,
      selectEffort: bridge.selectEffort,
    }),
    registerWindowService('defaults', {
      listPresets: bridge.listPresets,
      defaultPresetId: bridge.defaultPresetId,
      setDefaultPreset: bridge.setDefaultPreset,
      listPermissionPresets: bridge.listPermissionPresets,
      defaultPermission: bridge.defaultPermission,
      setDefaultPermission: bridge.setDefaultPermission,
    }),
  ]
  return () => {
    for (const dispose of disposers) dispose()
  }
}

export function registerTodosService(todos: readonly TodoItemLike[]): () => void {
  return registerWindowService('todos', todos)
}
