import { Context } from '@deepseek-ai/cordis'
import type { Fiber, Plugin } from '@deepseek-ai/cordis'

export function createTestContext(): Context {
  return new Context()
}

export async function mountPlugin(ctx: Context, plugin: Plugin): Promise<Fiber> {
  return ctx.plugin(plugin)
}
