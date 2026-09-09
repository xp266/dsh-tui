import { ModelsWindow } from './windows/models-window.tsx'
import { ProvidersWindow } from './windows/providers-window.tsx'
import { SessionsWindow } from './windows/sessions-window.tsx'
import { PresetsDialog } from './dialog/presets-dialog.tsx'
import { EffortDialog } from './dialog/effort-dialog.tsx'
import { DefaultsDialog } from './dialog/defaults-dialog.tsx'
import { TodoDialog } from './dialog/todo-dialog.tsx'
import { createServiceWindow } from './windows/service-window.tsx'
import { registerWindow } from './windows.ts'

/**
 * Builtin windows register as high-order fallback layers: a plugin
 * contribution for the same id (default order 100) always wins regardless of
 * registration timing, and disposing the plugin restores the builtin.
 */
export const BUILTIN_WINDOW_ORDER = 500

export interface BuiltinWindowDeps {
  onModelSelected(provider: string, model: string): void
  onAddProvider(): void
  onBeforeSessionSelected(): void
  onSessionSelected(): void
  onNewSession(): void
}

export function registerBuiltinWindows(deps: BuiltinWindowDeps): () => void {
  const disposers = [
    registerWindow({
      id: 'models',
      title: 'models',
      order: BUILTIN_WINDOW_ORDER + 0,
      required: ['models'],
      component: props => <ModelsWindow {...props} onModelSelected={deps.onModelSelected} onAddProvider={deps.onAddProvider} />,
      command: { name: 'models', description: 'Switch the active model' },
    }),
    registerWindow({
      id: 'providers',
      title: 'providers',
      order: BUILTIN_WINDOW_ORDER + 5,
      required: ['models'],
      component: props => <ProvidersWindow {...props} onModelSelected={deps.onModelSelected} />,
      command: { name: 'providers', description: 'Manage providers and API keys' },
    }),
    registerWindow({
      id: 'sessions',
      title: 'sessions',
      order: BUILTIN_WINDOW_ORDER + 10,
      required: ['sessions'],
      component: props => (
        <SessionsWindow
          {...props}
          onBeforeSessionSelected={deps.onBeforeSessionSelected}
          onSessionSelected={deps.onSessionSelected}
          onNewSession={deps.onNewSession}
        />
      ),
      command: { name: 'sessions', description: 'Resume a previous session' },
    }),
    registerWindow({
      id: 'preset',
      title: 'preset',
      order: BUILTIN_WINDOW_ORDER + 20,
      required: ['presets'],
      component: createServiceWindow('presets', PresetsDialog),
      command: { name: 'preset', description: 'Select agent preset' },
    }),
    registerWindow({
      id: 'effort',
      title: 'reasoning effort',
      order: BUILTIN_WINDOW_ORDER + 30,
      required: ['efforts'],
      component: createServiceWindow('efforts', EffortDialog),
      command: { name: 'effort', description: "Select the current model's reasoning effort" },
    }),
    registerWindow({
      id: 'defaults',
      title: 'defaults',
      order: BUILTIN_WINDOW_ORDER + 40,
      required: ['defaults'],
      component: createServiceWindow('defaults', DefaultsDialog),
      command: { name: 'defaults', description: 'Set default permission and agent preset' },
    }),
    registerWindow({
      id: 'todo',
      title: 'todo',
      order: BUILTIN_WINDOW_ORDER + 50,
      required: ['todos'],
      component: createServiceWindow('todos', TodoDialog),
    }),
  ]
  return () => {
    for (const dispose of disposers) dispose()
  }
}
