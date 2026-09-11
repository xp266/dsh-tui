import { registerWindowService } from './window-services.ts'
import { hasLanguage, listLanguages } from './languages.ts'
import { currentLanguage, setLanguage } from '../core/language.ts'
import { currentDeliveryMode, setDeliveryMode } from '../core/delivery.ts'
import type { ChatBridge } from '../chat/bridge.ts'
import type { ModelApi } from './dialog/models-dialog.tsx'
import type { SessionsApi } from './dialog/sessions-dialog.tsx'
import type { PresetsApi } from './dialog/presets-dialog.tsx'
import type { EffortsApi } from './dialog/effort-dialog.tsx'
import type { DefaultsApi } from './dialog/defaults-dialog.tsx'
import type { LanguageApi } from './dialog/language-dialog.tsx'
import type { TodoItemLike } from '../chat/todo-view.ts'

/** Builtin window services sit in a high-order layer; plugin services override by default. */
export const BUILTIN_SERVICE_ORDER = 500

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
    deleteProvider: bridge.deleteProvider,
    readModelEntries: bridge.readModelEntries,
    describeModel: bridge.describeModel,
    saveModelEntry: bridge.saveModelEntry,
    deleteModelEntry: bridge.deleteModelEntry,
  }
  const sessions: SessionsApi = {
    listSessions: bridge.listSessions,
    onSessionsChanged: bridge.onSessionListChanged,
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
    // The interjection preference is owned by the TUI itself, like the language
    // choice: it never reaches the harness, so it is stored by core/delivery.
    defaultDeliveryMode: currentDeliveryMode,
    setDefaultDeliveryMode: async mode => {
      setDeliveryMode(mode)
    },
  }
  const language: LanguageApi = {
    listLanguages: async () => listLanguages().map(entry => ({ id: entry.language, label: entry.label })),
    currentLanguage,
    selectLanguage: async id => {
      if (!hasLanguage(id)) throw new Error(`unknown language: ${id}`)
      setLanguage(id)
    },
  }
  const disposers = [
    registerWindowService('models', models, { order: BUILTIN_SERVICE_ORDER }),
    registerWindowService('sessions', sessions, { order: BUILTIN_SERVICE_ORDER }),
    registerWindowService('presets', presets, { order: BUILTIN_SERVICE_ORDER }),
    registerWindowService('efforts', efforts, { order: BUILTIN_SERVICE_ORDER }),
    registerWindowService('defaults', defaults, { order: BUILTIN_SERVICE_ORDER }),
    registerWindowService('language', language, { order: BUILTIN_SERVICE_ORDER }),
  ]
  return () => {
    for (const dispose of disposers) dispose()
  }
}

export function registerTodosService(todos: readonly TodoItemLike[]): () => void {
  return registerWindowService('todos', todos, { order: BUILTIN_SERVICE_ORDER })
}
