import { keyedRegistry } from '../../kernel/registry.ts'
import type { PointerHandlerContribution } from '../../contract/index.ts'

export type { PointerUiContext, PointerSession, PointerEventFrame, PointerHandlerContribution } from '../../contract/index.ts'

const pointerHandlers = keyedRegistry<PointerHandlerContribution>()

/**
 * Plugins observe pointer events the builtin gesture handler does not claim,
 * or preempt the builtins entirely. Default order 300 places a plugin behind
 * every builtin handler (which live at 100..190); order < 100 runs before the
 * builtins and may claim events first.
 */
export const POINTER_PLUGIN_ORDER = 300

export function registerPointerHandler(contribution: PointerHandlerContribution): () => void {
  return pointerHandlers.register(contribution.id, contribution, { order: contribution.order ?? POINTER_PLUGIN_ORDER })
}

export function pointerHandlerEntries(): Array<{ key: string; order: number; value: PointerHandlerContribution }> {
  return pointerHandlers.entries()
}

export function subscribePointerHandlers(listener: () => void): () => void {
  return pointerHandlers.subscribe(listener)
}

/** Builtin layer order constant; see pointer/builtins.ts. */
export const POINTER_BUILTIN_ORDER = 100
