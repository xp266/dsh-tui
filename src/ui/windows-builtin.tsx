import { ModelsWindow } from './windows/models-window.tsx'
import { ProvidersWindow } from './windows/providers-window.tsx'
import { SessionsWindow } from './windows/sessions-window.tsx'
import { PresetsDialog } from './dialog/presets-dialog.tsx'
import { EffortDialog } from './dialog/effort-dialog.tsx'
import { DefaultsDialog } from './dialog/defaults-dialog.tsx'
import { TodoDialog } from './dialog/todo-dialog.tsx'
import { createServiceWindow } from './windows/service-window.tsx'
import { registerWindow } from './windows.ts'

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
      order: 10,
      required: ['models'],
      component: props => <ModelsWindow {...props} onModelSelected={deps.onModelSelected} onAddProvider={deps.onAddProvider} />,
      command: { name: 'models', description: 'Open model selection' },
    }),
    registerWindow({
      id: 'providers',
      title: 'providers',
      order: 15,
      required: ['models'],
      component: props => <ProvidersWindow {...props} onModelSelected={deps.onModelSelected} />,
      command: { name: 'providers', description: 'Open provider selection' },
    }),
    registerWindow({
      id: 'sessions',
      title: 'sessions',
      order: 20,
      required: ['sessions'],
      component: props => (
        <SessionsWindow
          {...props}
          onBeforeSessionSelected={deps.onBeforeSessionSelected}
          onSessionSelected={deps.onSessionSelected}
          onNewSession={deps.onNewSession}
        />
      ),
      command: { name: 'sessions', description: 'Open session picker' },
    }),
    registerWindow({
      id: 'preset',
      title: 'preset',
      order: 30,
      required: ['presets'],
      component: createServiceWindow('presets', PresetsDialog),
      command: { name: 'preset', description: 'Select agent preset' },
    }),
    registerWindow({
      id: 'effort',
      title: 'reasoning effort',
      order: 40,
      required: ['efforts'],
      component: createServiceWindow('efforts', EffortDialog),
      command: { name: 'reasoning-effort', description: "Select the current model's reasoning effort" },
    }),
    registerWindow({
      id: 'defaults',
      title: 'defaults',
      order: 50,
      required: ['defaults'],
      component: createServiceWindow('defaults', DefaultsDialog),
      command: { name: 'defaults', description: 'Set default permission and agent preset' },
    }),
    registerWindow({
      id: 'todo',
      title: 'todo',
      order: 60,
      required: ['todos'],
      component: createServiceWindow('todos', TodoDialog),
    }),
  ]
  return () => {
    for (const dispose of disposers) dispose()
  }
}
