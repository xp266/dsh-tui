import { registerWindowService } from './window-services.ts'
import type { ChatBridge } from '../chat/bridge.ts'
import type { ModelApi } from './dialog/models-dialog.tsx'
import type { SessionsApi } from './dialog/sessions-dialog.tsx'
import type { PresetsApi } from './dialog/presets-dialog.tsx'
import type { EffortsApi } from './dialog/effort-dialog.tsx'
import type { DefaultsApi } from './dialog/defaults-dialog.tsx'
import type { TodoItemLike } from '../chat/todo-view.ts'

export function registerWindowServices(bridge: ChatBridge): () => void {
  const models: ModelApi = {
    listModels: bridge.listModels,
    selectModel: bridge.selectModel,
    fetchCustomModels: bridge.fetchCustomModels,
    saveCustomProvider: bridge.saveCustomProvider,
    listProviderDirectory: bridge.listProviderDirectory,
    fetchProviderModels: bridge.fetchProviderModels,
    saveProviderKey: bridge.saveProviderKey,
    saveProviderModels: bridge.saveProviderModels,
    readModelEntries: bridge.readModelEntries,
    saveModelEntry: bridge.saveModelEntry,
    deleteModelEntry: bridge.deleteModelEntry,
  }
  const sessions: SessionsApi = {
    listSessions: bridge.listSessions,
    openSession: bridge.openSession,
    newSession: bridge.newSession,
    archiveSession: bridge.archiveSession,
    activeSessionId: bridge.activeSessionId,
  }
  const presets: PresetsApi = {
    listPresets: bridge.listPresets,
    currentPreset: bridge.currentPreset,
    selectPreset: bridge.selectPreset,
  }
  const efforts: EffortsApi = {
    listEfforts: bridge.listEfforts,
    currentEffort: bridge.currentEffort,
    selectEffort: bridge.selectEffort,
  }
  const defaults: DefaultsApi = {
    listPresets: bridge.listPresets,
    defaultPresetId: bridge.defaultPresetId,
    setDefaultPreset: bridge.setDefaultPreset,
    listPermissionPresets: bridge.listPermissionPresets,
    defaultPermission: bridge.defaultPermission,
    setDefaultPermission: bridge.setDefaultPermission,
  }
  const disposers = [
    registerWindowService('models', models),
    registerWindowService('sessions', sessions),
    registerWindowService('presets', presets),
    registerWindowService('efforts', efforts),
    registerWindowService('defaults', defaults),
  ]
  return () => {
    for (const dispose of disposers) dispose()
  }
}

export function registerTodosService(todos: readonly TodoItemLike[]): () => void {
  return registerWindowService('todos', todos)
}
