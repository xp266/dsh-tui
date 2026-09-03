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

export interface RememberedToolCall {
  name: string
  args: unknown
  /** Pretty JSON of the arguments; non-JSON arguments echo the raw string. */
  argsJson: string
}

/**
 * The one call ledger pairing tool/call ids with their parsed arguments.
 * Both the contribution layer and the builtin presenter read it, so a call
 * that a contribution fully takes over still resolves at result time, and
 * non-JSON arguments survive as the raw string instead of being dropped.
 */
export class ToolCallLedger {
  private readonly calls = new Map<string, RememberedToolCall>()

  remember(name: string, callId: string, argumentsRaw: string): RememberedToolCall {
    let args: unknown
    let json: string
    try {
      args = JSON.parse(argumentsRaw) as unknown
      json = JSON.stringify(args, null, 2) ?? ''
    } catch {
      // Non-JSON arguments survive verbatim as the raw string instead of being dropped.
      args = argumentsRaw
      json = argumentsRaw
    }
    if (!this.calls.has(callId) && this.calls.size >= MAX_TOOL_CALLS) {
      const oldest = this.calls.keys().next()
      if (!oldest.done) this.calls.delete(oldest.value)
    }
    const call = { name, args, argsJson: json }
    this.calls.set(callId, call)
    return call
  }

  get(callId: string): RememberedToolCall | undefined {
    return this.calls.get(callId)
  }

  argsJson(callId: string): string | undefined {
    return this.calls.get(callId)?.argsJson
  }
}

/**
 * Compose the builtin presenter under the contribution registry: a keyed hit
 * is offered the call/result first and the builtin path only runs on a miss.
 * Every call lands in the shared ledger before routing, whatever handles it.
 */
export function createToolViewPresenter(
  inner: ChatToolPresenter,
  options: { resolve(tool: string): ToolViewContribution | undefined; cwd(): string; ledger: ToolCallLedger },
): ChatToolPresenter {
  const ledger = options.ledger
  return {
    call(name, callId, argumentsRaw) {
      const call = ledger.remember(name, callId, argumentsRaw)
      const contribution = options.resolve(name)
      const contributed = contribution?.call
      if (contributed !== undefined) {
        const presented = contributed({ tool: name, callId, args: call.args, argumentsRaw, cwd: options.cwd() })
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
      return inner.call(name, callId, argumentsRaw) ?? { label: name, body: '' }
    },
    result(callId, result) {
      const call = ledger.get(callId)
      if (call !== undefined) {
        const contribution = options.resolve(call.name)
        if (contribution !== undefined) {
          const contributed = contribution.result
          if (contributed !== undefined) {
            const presented = contributed({ tool: call.name, callId, args: call.args, result, cwd: options.cwd() })
            if (presented !== undefined) return presented
          }
          if (contribution.takeover === true) return { kind: 'replace', text: '' }
        }
      } else if (result.isError !== true) {
        return { kind: 'replace', text: '' }
      }
      return inner.result(callId, result)
    },
    argsJson: callId => ledger.argsJson(callId) ?? inner.argsJson(callId),
  }
}
