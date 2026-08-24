import { describe, it } from 'vitest'
import { createElement } from 'react'
import Prism from 'prismjs'
import '../../src/ui/message/md/highlight.ts'
import { wrapSegments } from '../../src/core/segments.ts'
import { mergeRuns } from '../../src/core/segments.ts'
import { highlightCodeBlock } from '../../src/ui/message/md/highlight.ts'

const CODE = `export function debounce<T extends (...args: never[]) => void>(fn: T, ms: number): T {
  let timer: ReturnType<typeof setTimeout> | undefined
  const wrapped = (...args: never[]) => {
    if (timer !== undefined) clearTimeout(timer)
    timer = setTimeout(() => fn(...args), ms)
  }
  return wrapped as T
}
`.repeat(120)

describe('perf: code block internals', () => {
  it('prism tokenize vs wrapSegments on ~30KB ts', () => {
    console.log(`[perf] code size: ${(CODE.length / 1024).toFixed(0)}KB`)

    warm()

    let t = performance.now()
    for (let i = 0; i < 20; i++) {
      let n = 0
      for (const token of Prism.tokenize(CODE, Prism.languages.typescript)) {
        if (typeof token === 'string') n += token.length
        else n += String(token.content).length
      }
      void n
    }
    console.log(`[perf] prism tokenize x20: ${((performance.now() - t) / 20).toFixed(2)}ms/run`)

    t = performance.now()
    for (let i = 0; i < 20; i++) {
      highlightCodeBlock(CODE, 'ts', false)
    }
    console.log(`[perf] highlightCodeBlock (cache hit) x20: ${((performance.now() - t) / 20).toFixed(3)}ms/run`)

    const segs = [{ text: CODE, style: {} }]
    t = performance.now()
    for (let i = 0; i < 5; i++) {
      wrapSegments(segs, 92)
    }
    console.log(`[perf] wrapSegments plain 30KB: ${((performance.now() - t) / 5).toFixed(2)}ms/run`)

    const highlighted = highlightCodeBlock(CODE, 'ts', false)!
    const hsegs = highlighted === null ? segs : highlighted.map(s => ({ ...s }))
    t = performance.now()
    for (let i = 0; i < 5; i++) {
      wrapSegments(hsegs, 92)
    }
    console.log(`[perf] wrapSegments highlighted 30KB: ${((performance.now() - t) / 5).toFixed(2)}ms/run`)

    t = performance.now()
    for (let i = 0; i < 5; i++) {
      const rows = wrapSegments(hsegs, 92)
      rows.map(row => mergeRuns(row))
    }
    console.log(`[perf] wrapSegments + mergeRuns: ${((performance.now() - t) / 5).toFixed(2)}ms/run`)
  })

  function warm(): void {
    highlightCodeBlock(CODE, 'ts', false)
    Prism.tokenize(CODE, Prism.languages.typescript!)
    wrapSegments([{ text: CODE, style: {} }], 92)
  }
})
