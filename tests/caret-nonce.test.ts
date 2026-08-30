import { describe, expect, it } from 'vitest'
import { caretNonceBold, caretNonceColor, caretNonceText } from '../src/core/caret-nonce.ts'

function nonceState(cursor: number): string {
  return `${caretNonceText(cursor)}|${caretNonceColor(cursor)}|${caretNonceBold(cursor)}`
}

describe('caret nonce', () => {
  it('emits exact ansi256 index colors inside the 16..255 range', () => {
    for (let cursor = 0; cursor < 960; cursor += 7) {
      const index = Number(caretNonceColor(cursor).slice('ansi256('.length, -1))
      expect(index).toBeGreaterThanOrEqual(16)
      expect(index).toBeLessThanOrEqual(255)
    }
  })

  it('changes bytes across representative caret displacements', () => {
    for (const base of [0, 1, 240, 480, 959]) {
      for (const delta of [1, 2, 7, 239, 240, 241, 480, 959]) {
        expect(nonceState(base), `base ${base} delta ${delta}`).not.toBe(nonceState(base + delta))
      }
    }
  })
})
