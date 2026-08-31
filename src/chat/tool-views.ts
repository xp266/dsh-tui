import { keyedRegistry } from '../kernel/registry.ts'
import type { ToolViewContribution } from '../contract/index.ts'
import type { ChatToolPresenter } from './bridge.ts'

const contributions = keyedRegistry<ToolViewContribution>()

export function registerToolView(contribution: ToolViewContribution): () => void {
  return contributions.register(contribution.tool, contribution, { order: contribution.order })
}

export function toolViewOf(tool: string): ToolViewContribution | undefined {
  return contributions.get(tool)
}

export function subscribeToolViews(listener: () => void): () => void {
  return contributions.subscribe(listener)
}

const MAX_TOOL_CALLS = 1000

export function createToolViewPresenter(
  inner: ChatToolPresenter,
  options: { resolve(tool: string): ToolViewContribution | undefined; cwd(): string },
): ChatToolPresenter {
  const calls = new Map<string, { name: string; args: unknown }>()
  const rememberToolCall = (callId: string, name: string, args: unknown): void => {
    if (!calls.has(callId) && calls.size >= MAX_TOOL_CALLS) {
      const oldest = calls.keys().next()
      if (!oldest.done) calls.delete(oldest.value)
    }
    calls.set(callId, { name, args })
  }
  const argsJson = (callId: string): string | undefined => {
    const call = calls.get(callId)
    if (call === undefined) return undefined
    try {
      return JSON.stringify(call.args, null, 2)
    } catch {
      return undefined
    }
  }
  return {
    call(name, callId, argumentsRaw) {
      let args: unknown
      try {
        args = JSON.parse(argumentsRaw)
      } catch {
        // Remember the call even when arguments are not valid JSON so the
        // result phase can still route through contributed views.
        args = argumentsRaw
      }
      rememberToolCall(callId, name, args)
      const contribution = options.resolve(name)
      const contributed = contribution?.call
      if (contributed !== undefined) {
        const presented = contributed({ tool: name, callId, args, argumentsRaw, cwd: options.cwd() })
        if (presented !== undefined) {
          return {
            label: presented.label ?? name,
            body: presented.body ?? '',
            ...(presented.bodyCol === undefined ? {} : { bodyCol: presented.bodyCol }),
            ...(presented.diff === undefined ? {} : { diff: presented.diff }),
          }
        }
        if (contribution?.takeover === true) return { label: name, body: '' }
      }
      return inner.call(name, callId, argumentsRaw)
    },
    result(callId, result) {
      const call = calls.get(callId)
      if (call !== undefined) {
        const contribution = options.resolve(call.name)
        const contributed = contribution?.result
        if (contributed !== undefined) {
          const presented = contributed({ tool: call.name, callId, args: call.args, result, cwd: options.cwd() })
          if (presented !== undefined) return presented
          if (contribution?.takeover === true) return { kind: 'replace', text: '' }
        }
      }
      return inner.result(callId, result)
    },
    argsJson,
  }
}
