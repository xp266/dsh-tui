import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { classifyPaste, summarizePaste } from '../src/core/paste.ts'

function makeImageDir(): { png: (name: string) => string } {
  const dir = mkdtempSync(join(tmpdir(), 'dsh-tui-paste-'))
  return {
    png(name: string): string {
      const path = join(dir, name)
      writeFileSync(path, 'png')
      return path
    },
  }
}

describe('paste classification', () => {
  it('requires at least 4 lines to summarize a multi-line paste', () => {
    expect(summarizePaste('a\nb\nc')).toBeNull()
    expect(summarizePaste('a\nb\nc\nd')).toEqual({ lines: 4, characters: 7 })
  })

  it('requires more than 600 characters for a single line', () => {
    expect(summarizePaste('a'.repeat(600))).toBeNull()
    expect(summarizePaste('a'.repeat(601))).toEqual({ lines: 1, characters: 601 })
    expect(summarizePaste('a\nb')).toBeNull()
  })

  it('counts astral characters as single code points', () => {
    expect(summarizePaste('😀'.repeat(601))).toEqual({ lines: 1, characters: 601 })
  })

  it('groups adjacent image file lines and keeps text between groups', () => {
    const files = makeImageDir()
    const a = files.png('a.png')
    const b = files.png('b.png')
    const c = files.png('c.jpg')
    const segments = classifyPaste(`${a}\n${b}\nlook at these\n${c}`)
    expect(segments).toEqual([
      { type: 'images', paths: [a, b] },
      { type: 'text', text: 'look at these' },
      { type: 'images', paths: [c] },
    ])
  })

  it('ignores image-like tokens whose files do not exist', () => {
    const segments = classifyPaste('/definitely/not/here.png')
    expect(segments).toEqual([{ type: 'text', text: '/definitely/not/here.png' }])
  })
})
