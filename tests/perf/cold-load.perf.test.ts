import { describe, expect, it } from 'vitest'

describe('perf: cold module loading (isolated worker)', () => {
  it('measures cold import of each layer', async () => {
    let t0 = performance.now()
    const react = await import('react')
    const reactMs = performance.now() - t0

    t0 = performance.now()
    await import('marked')
    const markedMs = performance.now() - t0

    t0 = performance.now()
    await import('prismjs')
    const prismCoreMs = performance.now() - t0

    t0 = performance.now()
    const ink = await import('ink')
    const inkMs = performance.now() - t0

    t0 = performance.now()
    const md = await import('../../src/ui/message/md/index.ts')
    const mdStackMs = performance.now() - t0

    t0 = performance.now()
    await import('../../src/ui/message/layout.ts')
    const layoutMs = performance.now() - t0

    void react
    void ink
    void md
    console.log(`[perf] cold import react: ${reactMs.toFixed(1)}ms`)
    console.log(`[perf] cold import ink: ${inkMs.toFixed(1)}ms`)
    console.log(`[perf] cold import marked: ${markedMs.toFixed(1)}ms`)
    console.log(`[perf] cold import prismjs core: ${prismCoreMs.toFixed(1)}ms`)
    console.log(`[perf] cold import md stack total (incl prism x120 langs): ${mdStackMs.toFixed(1)}ms`)
    console.log(`[perf] cold import layout (post-md, cached deps): ${layoutMs.toFixed(1)}ms`)
    expect(mdStackMs).toBeGreaterThan(0)
  })
})
