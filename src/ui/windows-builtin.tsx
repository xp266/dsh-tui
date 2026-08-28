import { ModelsWindow } from './windows/models-window.tsx'
import { SessionsWindow } from './windows/sessions-window.tsx'
import { PresetsWindow } from './windows/presets-window.tsx'
import { EffortWindow } from './windows/effort-window.tsx'
import { DefaultsWindow } from './windows/defaults-window.tsx'
import { TodoWindow } from './windows/todo-window.tsx'
import { registerWindow } from './windows.ts'

export interface BuiltinWindowDeps {
  onModelSelected(provider: string, model: string): void
  onBeforeSessionSelected(): void
  onSessionSelected(): void
  onNewSession(): void
}

export function registerBuiltinWindows(deps: BuiltinWindowDeps): () => void {
  const disposers = [    registerWindow({
      id: 'models',
      title: 'models',
      order: 10,
      required: ['models'],
      component: props => <ModelsWindow {...props} onModelSelected={deps.onModelSelected} />,
      command: { name: 'models', description: 'Open model selection' },
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
      component: props => <PresetsWindow {...props} />,
      command: { name: 'preset', description: 'Select agent preset' },
    }),
    registerWindow({
      id: 'model-effort',
      title: 'model effort',
      order: 40,
      required: ['efforts'],
      component: props => <EffortWindow {...props} />,
      command: { name: 'model-effort', description: 'Select reasoning effort' },
    }),
    registerWindow({
      id: 'defaults',
      title: 'defaults',
      order: 50,
      required: ['defaults'],
      component: props => <DefaultsWindow {...props} />,
      command: { name: 'defaults', description: 'Set default permission and agent preset' },
    }),
    registerWindow({
      id: 'todo',
      title: 'todo',
      order: 60,
      required: ['todos'],
      component: props => <TodoWindow {...props} />,
    }),
  ]
  return () => {
    for (const dispose of disposers) dispose()
  }
}
