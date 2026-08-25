export interface PartialField {
  value: string
  complete: boolean
}

export type PartialFields = Record<string, PartialField>

export function extractPartialJsonFields(raw: string): PartialFields {
  const out: PartialFields = {}
  const source = raw
  const end = source.length
  let i = 0
  while (i < end && source[i] !== '{') i++
  if (i >= end) return out
  i++
  while (i < end) {
    while (i < end && (source[i] === ' ' || source[i] === '\n' || source[i] === '\r' || source[i] === '\t' || source[i] === ',')) i++
    if (i < end && source[i] === '}') break
    if (i >= end || source[i] !== '"') {
      i++
      continue
    }
    i++
    const keyStart = i
    while (i < end && source[i] !== '"') {
      if (source[i] === '\\') i++
      i++
    }
    if (i >= end) break
    const key = unescapePartial(source.slice(keyStart, i))
    i++
    while (i < end && (source[i] === ' ' || source[i] === '\n' || source[i] === '\r' || source[i] === '\t')) i++
    if (i >= end || source[i] !== ':') continue
    i++
    while (i < end && (source[i] === ' ' || source[i] === '\n' || source[i] === '\r' || source[i] === '\t')) i++
    if (i >= end) {
      out[key] = { value: '', complete: false }
      break
    }
    if (source[i] === '"') {
      i++
      const valueStart = i
      let closed = false
      while (i < end) {
        const ch = source[i]
        if (ch === '\\') {
          i += 2
          continue
        }
        if (ch === '"') {
          closed = true
          break
        }
        i++
      }
      out[key] = { value: unescapePartial(source.slice(valueStart, Math.min(i, end))), complete: closed }
      i++
      continue
    }
    const valueStart = i
    let depth = 0
    while (i < end) {
      const ch = source[i]
      if (ch === '"') {
        i++
        while (i < end && source[i] !== '"') {
          if (source[i] === '\\') i++
          i++
        }
        i++
        continue
      }
      if (ch === '{' || ch === '[') depth++
      else if (ch === '}' || ch === ']') {
        if (depth === 0) break
        depth--
      } else if (ch === ',' && depth === 0) break
      i++
    }
    out[key] = { value: source.slice(valueStart, i).trim(), complete: i < end && (source[i] === ',' || source[i] === '}') }
  }
  return out
}

export function unescapePartial(text: string): string {
  if (!text.includes('\\')) return text
  let out = ''
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (ch !== '\\') {
      out += ch
      continue
    }
    const next = text[i + 1]
    if (next === undefined) break
    switch (next) {
      case 'n': out += '\n'; i++; break
      case 't': out += '\t'; i++; break
      case 'r': out += '\r'; i++; break
      case 'b': out += '\b'; i++; break
      case 'f': out += '\f'; i++; break
      case '/': out += '/'; i++; break
      case '"': out += '"'; i++; break
      case "'": out += "'"; i++; break
      case '\\': out += '\\'; i++; break
      case 'u': {
        const hex = text.slice(i + 2, i + 6)
        if (/^[0-9a-fA-F]{4}$/.test(hex)) {
          out += String.fromCharCode(Number.parseInt(hex, 16))
          i += 5
        } else if (/^[0-9a-fA-F]{0,3}$/.test(hex)) {
          return out
        } else {
          out += next
          i++
        }
        break
      }
      default:
        out += next
        i++
    }
  }
  return out
}
