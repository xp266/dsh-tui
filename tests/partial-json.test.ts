import { describe, expect, it } from 'vitest'
import { extractPartialJsonFields, unescapePartial } from '../src/chat/partial-json.ts'

describe('partial json extraction', () => {
  it('returns no fields before the object opens', () => {
    expect(extractPartialJsonFields('')).toEqual({})
    expect(extractPartialJsonFields('{"fi')).toEqual({})
  })

  it('extracts complete and partial string fields', () => {
    const fields = extractPartialJsonFields('{"file_path":"/w/a.ts","content":"const x')
    expect(fields.file_path).toEqual({ value: '/w/a.ts', complete: true })
    expect(fields.content).toEqual({ value: 'const x', complete: false })
  })

  it('parses a fully closed object like plain JSON', () => {
    const fields = extractPartialJsonFields('{"file_path":"/w/a.ts","content":"done"}')
    expect(fields.file_path).toEqual({ value: '/w/a.ts', complete: true })
    expect(fields.content).toEqual({ value: 'done', complete: true })
  })

  it('decodes escape sequences inside partially streamed strings', () => {
    const fields = extractPartialJsonFields('{"content":"a\\nb\\"c\\\\d\\u4e16"}')
    expect(fields.content).toEqual({ value: 'a\nb"c\\d世', complete: true })
  })

  it('tolerates a trailing lone backslash and truncated unicode escape', () => {
    const fields = extractPartialJsonFields('{"content":"x\\')
    expect(fields.content?.value).toBe('x')
    expect(fields.content?.complete).toBe(false)
    const partial = extractPartialJsonFields('{"content":"\\u4e1')
    expect(partial.content?.value).toBe('')
    expect(partial.content?.complete).toBe(false)
  })

  it('keeps escaped quotes from terminating the value early', () => {
    const fields = extractPartialJsonFields('{"content":"say \\"hi\\" now","next":')
    expect(fields.content?.value).toBe('say "hi" now')
    expect(fields.content?.complete).toBe(true)
    expect(fields.next?.complete).toBe(false)
  })

  it('handles keys that have not finished streaming', () => {
    expect(extractPartialJsonFields('{"file_pa')).toEqual({})
    const fields = extractPartialJsonFields('{"file_path":')
    expect(fields.file_path).toEqual({ value: '', complete: false })
  })

  it('captures primitive values and stops at delimiters', () => {
    const fields = extractPartialJsonFields('{"replace_all":true,"old_string":"a"}')
    expect(fields.replace_all).toEqual({ value: 'true', complete: true })
    expect(fields.old_string).toEqual({ value: 'a', complete: true })
  })

  it('unescapes partial text directly', () => {
    expect(unescapePartial('plain')).toBe('plain')
    expect(unescapePartial('tab\\there')).toBe('tab\there')
    expect(unescapePartial('cut\\')).toBe('cut')
  })
})
