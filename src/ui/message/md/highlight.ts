import { createRequire } from 'node:module'
import { performance } from 'node:perf_hooks'
import Prism from 'prismjs'
import { COLORS } from '../../../theme.ts'
import type { MarkStyle, Segment } from '../../../core/segments.ts'
import { pluginGrammarOf } from './extensions.ts'
import { registerSurfaceCacheClear } from '../../../kernel/surface.ts'

type CodeRole =
  | 'comment'
  | 'string'
  | 'number'
  | 'constant'
  | 'keyword'
  | 'function'
  | 'type'
  | 'variable'
  | 'operator'
  | 'added'
  | 'removed'
  | 'boldFlag'
  | 'italicFlag'
  | 'strikeFlag'

const TOKEN_ROLES: Record<string, CodeRole> = {
  comment: 'comment',
  shebang: 'comment',
  hashbang: 'comment',
  prolog: 'comment',
  doctype: 'comment',
  cdata: 'comment',
  'included-cdata': 'comment',
  'internal-subset': 'comment',
  doc: 'comment',
  'front-matter': 'comment',
  'multiline-comment': 'comment',
  'comment-block': 'comment',

  string: 'string',
  char: 'string',
  regex: 'string',
  url: 'string',
  scalar: 'string',
  heredoc: 'string',
  'raw-string': 'string',
  'multiline-string': 'string',
  'string-literal': 'string',
  pystring: 'string',
  quoted: 'string',
  value: 'string',
  'template-string': 'string',
  'triple-quoted-string': 'string',
  'interpolation-string': 'string',
  'string-interpolation': 'string',
  'attr-value': 'string',
  'regex-source': 'string',
  'header-value': 'string',
  'reason-phrase': 'string',
  'url-reference': 'string',
  'template-punctuation': 'string',

  number: 'number',
  literal: 'number',
  datetime: 'number',
  date: 'number',
  time: 'number',
  version: 'number',
  'status-code': 'number',
  'http-version': 'number',
  'quoted-number': 'number',

  boolean: 'constant',
  symbol: 'constant',
  constant: 'constant',
  null: 'constant',
  escape: 'constant',
  'special-escape': 'constant',
  nil: 'constant',
  color: 'constant',
  'format-spec': 'constant',
  'conversion-option': 'constant',
  'regex-flags': 'constant',
  'file-descriptor': 'constant',
  'special-attr': 'constant',
  options: 'constant',
  'command-line-option': 'constant',

  keyword: 'keyword',
  atrule: 'keyword',
  rule: 'keyword',
  directive: 'keyword',
  preprocessor: 'keyword',
  import: 'keyword',
  'module-declaration': 'keyword',
  module: 'keyword',
  package: 'keyword',
  namespace: 'keyword',
  attribute: 'keyword',
  instruction: 'keyword',
  target: 'keyword',
  declare: 'keyword',
  statement: 'keyword',
  feature: 'keyword',
  scenario: 'keyword',
  section: 'keyword',
  'section-name': 'keyword',
  heading: 'keyword',
  title: 'keyword',
  diff: 'keyword',

  annotation: 'function',
  decorator: 'function',
  function: 'function',
  'function-variable': 'function',
  'function-name': 'function',
  macro: 'function',
  'macro-name': 'function',
  mixin: 'function',
  'mixin-usage': 'function',
  method: 'function',
  'c-style-function': 'function',
  'generic-function': 'function',
  'function-definition': 'function',
  'method-definition': 'function',
  'constructor-invocation': 'function',
  'generic-method': 'function',
  'selector-function-argument': 'function',
  lambda: 'function',
  defun: 'function',
  'quoted-function': 'function',
  command: 'function',

  'class-name': 'type',
  type: 'type',
  generics: 'type',
  generic: 'type',
  'builtin-type': 'type',
  'type-definition': 'type',
  'type-expression': 'type',
  'type-list': 'type',
  'return-type': 'type',
  'fragment-specifier': 'type',
  'class-name-definition': 'type',

  variable: 'variable',
  parameter: 'variable',
  property: 'variable',
  key: 'variable',
  identifier: 'variable',
  environment: 'variable',
  field: 'variable',
  argument: 'variable',
  args: 'variable',
  arguments: 'variable',
  'argument-name': 'variable',
  'named-parameter': 'variable',
  'literal-property': 'variable',
  'string-property': 'variable',
  'attr-name': 'variable',
  'assign-left': 'variable',
  'closure-params': 'variable',
  'lambda-parameter': 'variable',
  interpolation: 'variable',
  hvariable: 'variable',
  'property-literal': 'variable',
  'property-declaration': 'variable',
  'variable-declaration': 'variable',
  'variable-line': 'variable',
  'header-name': 'variable',
  label: 'variable',
  user: 'variable',
  keys: 'variable',
  placeholder: 'variable',

  operator: 'operator',
  punctuation: 'operator',
  name: 'operator',
  selector: 'operator',
  entity: 'operator',
  important: 'operator',
  script: 'operator',
  style: 'operator',
  at: 'operator',
  arrow: 'operator',
  spread: 'operator',
  ellipsis: 'operator',
  range: 'operator',
  delimiter: 'operator',
  dot: 'operator',
  'double-colon': 'operator',
  'percent-operator': 'operator',
  brackets: 'operator',
  tag: 'operator',
  'tag-name': 'operator',
  'closure-punctuation': 'operator',
  'interpolation-punctuation': 'operator',
  'range-punctuation': 'operator',
  'script-punctuation': 'operator',
  'flow-punctuation': 'operator',
  'operator-like-punctuation': 'operator',
  'regex-delimiter': 'operator',
  'record-arguments': 'operator',
  'attribute-arguments': 'operator',
  'deleted-arrow': 'removed',
  'inserted-arrow': 'added',

  insertion: 'added',
  inserted: 'added',
  'inserted-sign': 'added',
  deleted: 'removed',
  'deleted-sign': 'removed',

  bold: 'boldFlag',
  italic: 'italicFlag',
  strike: 'strikeFlag',
  blockquote: 'italicFlag',
  code: 'string',

  coord: 'comment',
}

const ROLE_STYLE_LIGHT: Record<CodeRole, () => MarkStyle> = {
  comment: () => ({ color: COLORS.codeComment, italic: true }),
  string: () => ({ color: COLORS.codeString }),
  number: () => ({ color: COLORS.codeNumber }),
  constant: () => ({ color: COLORS.codeConstant }),
  keyword: () => ({ color: COLORS.codeKeyword }),
  function: () => ({ color: COLORS.codeFunction }),
  type: () => ({ color: COLORS.codeType }),
  variable: () => ({ color: COLORS.codeVariable }),
  operator: () => ({ color: COLORS.codeOperator }),
  added: () => ({ color: COLORS.diffAdded }),
  removed: () => ({ color: COLORS.diffRemoved }),
  boldFlag: () => ({ bold: true }),
  italicFlag: () => ({ italic: true }),
  strikeFlag: () => ({ strike: true }),
}

const ROLE_STYLE_THINKING: Record<CodeRole, () => MarkStyle> = {
  comment: () => ({ color: COLORS.thinkCodeComment, italic: true }),
  string: () => ({ color: COLORS.thinkCodeString }),
  number: () => ({ color: COLORS.thinkCodeNumber }),
  constant: () => ({ color: COLORS.thinkCodeConstant }),
  keyword: () => ({ color: COLORS.thinkCodeKeyword }),
  function: () => ({ color: COLORS.thinkCodeFunction }),
  type: () => ({ color: COLORS.thinkCodeType }),
  variable: () => ({ color: COLORS.thinkCodeVariable }),
  operator: () => ({ color: COLORS.thinkCodePlain }),
  added: () => ({ color: COLORS.diffAdded }),
  removed: () => ({ color: COLORS.diffRemoved }),
  boldFlag: () => ({ bold: true }),
  italicFlag: () => ({ italic: true }),
  strikeFlag: () => ({ strike: true }),
}

function buildStyles(roleFns: Record<CodeRole, () => MarkStyle>): Record<string, MarkStyle> {
  const out: Record<string, MarkStyle> = {}
  for (const [token, role] of Object.entries(TOKEN_ROLES)) {
    Object.defineProperty(out, token, {
      enumerable: true,
      get: roleFns[role],
    })
  }
  return out
}

export const codeStyles = buildStyles(ROLE_STYLE_LIGHT)
export const codeStylesThinking = buildStyles(ROLE_STYLE_THINKING)

export const LANGUAGE_ALIASES: Record<string, string> = {
  py: 'python',
  python3: 'python',
  js: 'javascript',
  node: 'javascript',
  nodejs: 'javascript',
  mjs: 'javascript',
  cjs: 'javascript',
  jsx: 'javascript',
  ts: 'typescript',
  tsx: 'typescript',
  sh: 'bash',
  shell: 'bash',
  zsh: 'bash',
  ksh: 'bash',
  rb: 'ruby',
  rs: 'rust',
  golang: 'go',
  kt: 'kotlin',
  kts: 'kotlin',
  'c++': 'cpp',
  c: 'c',
  h: 'c',
  cpp: 'cpp',
  cc: 'cpp',
  cxx: 'cpp',
  hpp: 'cpp',
  cs: 'csharp',
  'c#': 'csharp',
  objc: 'objectivec',
  'objective-c': 'objectivec',
  vb: 'vbnet',
  'visual-basic': 'vbnet',
  fs: 'fsharp',
  pl: 'perl',
  pm: 'perl',
  ps1: 'powershell',
  pwsh: 'powershell',
  bat: 'batch',
  cmd: 'batch',
  htm: 'markup',
  html: 'markup',
  xhtml: 'markup',
  svg: 'markup',
  xml: 'markup',
  vue: 'markup',
  xsl: 'markup',
  plist: 'markup',
  styl: 'stylus',
  yml: 'yaml',
  cfg: 'ini',
  tsv: 'csv',
  mysql: 'sql',
  pgsql: 'sql',
  sqlite: 'sql',
  sql: 'sql',
  gql: 'graphql',
  md: 'markdown',
  mdwn: 'markdown',
  patch: 'diff',
  dockerfile: 'docker',
  containerfile: 'docker',
  make: 'makefile',
  mk: 'makefile',
  gitignore: 'ignore',
  terraform: 'hcl',
  tf: 'hcl',
  apache: 'apacheconf',
  ex: 'elixir',
  exs: 'elixir',
  erl: 'erlang',
  hs: 'haskell',
  ml: 'ocaml',
  pas: 'pascal',
  f90: 'fortran',
  clj: 'clojure',
  scm: 'scheme',
  el: 'lisp',
  tex: 'latex',
  rst: 'rest',
  adoc: 'asciidoc',
  viml: 'vim',
  sol: 'solidity',
  feature: 'gherkin',
  plantuml: 'plant-uml',
  console: 'shell-session',
  jade: 'pug',
  hbs: 'handlebars',
  mustache: 'handlebars',
  jinja: 'django',
  jinja2: 'django',
  coffee: 'coffeescript',
  json: 'json',
  jsonc: 'json',
  java: 'java',
  swift: 'swift',
  php: 'php',
  lua: 'lua',
  toml: 'toml',
  css: 'css',
  scss: 'scss',
  less: 'less',
}

const LANGUAGE_COMPONENTS: string[] = [
  'clike', 'markup', 'css', 'markup-templating', 'javascript', 'json', 'ruby', 'c', 'bash',
  'python', 'typescript', 'jsx', 'tsx', 'coffeescript', 'flow', 'json5', 'jsonp', 'cpp',
  'objectivec', 'hlsl', 'php', 'handlebars', 'django', 'ejs', 'crystal', 'haml', 'gradle',
  'markdown', 'go', 'rust', 'java', 'csharp', 'kotlin', 'scala', 'swift', 'dart', 'lua',
  'perl', 'r', 'groovy', 'powershell', 'sql', 'yaml', 'toml', 'ini', 'properties', 'csv',
  'docker', 'makefile', 'git', 'diff', 'regex', 'graphql', 'http', 'protobuf', 'elixir',
  'erlang', 'haskell', 'ocaml', 'pascal', 'basic', 'vbnet', 'fsharp', 'clojure', 'scheme',
  'lisp', 'julia', 'matlab', 'fortran', 'latex', 'rest', 'asciidoc', 'vim', 'wasm', 'zig',
  'nim', 'nix', 'v', 'd', 'qml', 'glsl', 'elm', 'solidity', 'verilog', 'vhdl', 'nginx',
  'apacheconf', 'hcl', 'cmake', 'systemd', 'editorconfig', 'ignore', 'gherkin', 'mermaid',
  'plant-uml', 'shell-session', 'batch', 'sass', 'scss', 'less', 'stylus', 'twig', 'liquid',
  'pug', 'awk', 'jq', 'applescript', 'autohotkey', 'autoit', 'haxe', 'cobol', 'ada',
  'turtle', 'sparql', 'mongodb',
]

let ensured = false

export function ensureGrammars(): void {
  if (ensured) return
  ensured = true
  try {
    const req = createRequire(import.meta.url)
    for (const name of LANGUAGE_COMPONENTS) {
      try {
        req(`prismjs/components/prism-${name}.js`)
      } catch {
        // A grammar that is not shipped in this prismjs build is skipped silently.
      }
    }
  } catch {
    // Bundled prismjs without component files: highlighting falls back to plain text.
  }
}

const WARM_SLICE_MS = 6

let warmStarted = false
const warmListeners: Array<() => void> = []

const warmState = { done: false, remaining: LANGUAGE_COMPONENTS.length }

function loadNext(names: string[]): void {
  const t0 = performance.now()
  while (names.length > 0) {
    const name = names.shift()!
    try {
      createRequireOnce()(loadSpec(name))
    } catch {
      // A grammar that is not shipped in this prismjs build is skipped silently.
    }
    warmState.remaining = names.length
    if (performance.now() - t0 >= WARM_SLICE_MS) break
  }
  if (names.length > 0) {
    setTimeout(() => loadNext(names), 0)
    return
  }
  warmState.done = true
  for (const cb of warmListeners.splice(0)) cb()
}

let requireFn: ReturnType<typeof createRequire> | undefined

function createRequireOnce(): ReturnType<typeof createRequire> {
  if (requireFn === undefined) requireFn = createRequire(import.meta.url)
  return requireFn
}

function loadSpec(name: string): string {
  return `prismjs/components/prism-${name}.js`
}

export function warmLanguages(): void {
  // Must not bail out when ensureGrammars() already ran synchronously: the
  // async warm loop is what flips warmState.done and fires onLanguagesWarm.
  if (warmStarted) return
  warmStarted = true
  const queue = [...LANGUAGE_COMPONENTS]
  setTimeout(() => loadNext(queue), 0)
}

export function onLanguagesWarm(cb: () => void): void {
  if (warmState.done) cb()
  else warmListeners.push(cb)
}

const HIGHLIGHT_CACHE_MAX = 4000
const HIGHLIGHT_CACHE_MAX_BYTES = 16 * 1024 * 1024
// Segment objects cost far more heap than their text; the constant keeps the
// byte accounting within ~2x of actual heap usage.
const SEGMENT_HEAP_BYTES = 128

function segmentsHeapBytes(segments: Segment[] | null): number {
  if (segments === null) return 0
  let bytes = 0
  for (const segment of segments) bytes += SEGMENT_HEAP_BYTES + segment.text.length
  return bytes
}

interface HighlightCacheEntry {
  segments: Segment[] | null
  bytes: number
}

// Two-level layout: the outer key is the small (thinking/lang/streamId)
// prefix, the inner key is the text itself. A Map key holds a reference, so a
// cache hit allocates nothing — a flat key would rebuild a block-sized
// string on every lookup, including hits.
const highlightCache = new Map<string, Map<string, HighlightCacheEntry>>()
let highlightCacheEntries = 0
let highlightCacheBytes = 0

// Streaming states retain the full source plus one segment per token, so a
// long session would otherwise pin every streamed code block forever. Both
// caps evict oldest-first; the entry count keeps small states from pinning
// slots indefinitely.
const STREAM_STATE_MAX = 64
const STREAM_STATE_MAX_BYTES = 8 * 1024 * 1024

interface StreamState {
  source: string
  segments: Segment[]
  bytes: number
}

const streamStates = new Map<string, StreamState>()
let streamStateBytes = 0

export function clearHighlightCache(): void {
  highlightCache.clear()
  highlightCacheEntries = 0
  highlightCacheBytes = 0
  streamStates.clear()
  streamStateBytes = 0
}

registerSurfaceCacheClear(clearHighlightCache)

function trackStreamState(stateKey: string, state: StreamState): void {
  const existing = streamStates.get(stateKey)
  if (existing !== undefined) streamStateBytes -= existing.bytes
  streamStates.delete(stateKey)
  streamStates.set(stateKey, state)
  streamStateBytes += state.bytes
  while (streamStates.size > 1 && (streamStates.size > STREAM_STATE_MAX || streamStateBytes > STREAM_STATE_MAX_BYTES)) {
    const oldest = streamStates.keys().next()
    if (oldest.done) break
    const evicted = streamStates.get(oldest.value)
    if (evicted !== undefined) streamStateBytes -= evicted.bytes
    streamStates.delete(oldest.value)
  }
}

function resolveGrammar(lang: string): Prism.Grammar | undefined {
  const plugin = pluginGrammarOf(lang.toLowerCase())
  if (plugin !== undefined) return plugin
  const name = LANGUAGE_ALIASES[lang.toLowerCase()] ?? lang.toLowerCase()
  return Prism.languages[name] as Prism.Grammar | undefined
}

export function highlightCodeBlock(text: string, lang: string, thinking = false, streamId = ''): Segment[] | null {
  if (text === '') return []
  const partitionKey = `${thinking ? 'd' : 'l'}\x00${lang}\x00${streamId}`
  let partition = highlightCache.get(partitionKey)
  const cached = partition?.get(text)
  if (cached !== undefined) return cached.segments
  let grammar = resolveGrammar(lang)
  if (grammar === undefined && lang !== '') {
    ensureGrammars()
    grammar = resolveGrammar(lang)
  }
  let result: Segment[] | null
  let incremental = false
  if (grammar === undefined) {
    result = null
  } else {
    const stateKey = `${thinking ? 'd' : 'l'}\x00${streamId}\x00${lang}`
    const state = streamStates.get(stateKey)
    incremental = state !== undefined
      && text.length > state.source.length
      && text.startsWith(state.source)
      && state.source.endsWith('\n')
    try {
      const styles = thinking ? codeStylesThinking : codeStyles
      const plain: MarkStyle = { color: thinking ? COLORS.thinkCodePlain : COLORS.mdCodePlain }
      if (incremental) {
        // The state's segment array is appended in place and shared with the
        // current frame's render result; per-frame cache entries for every
        // snapshot would retain the whole history, so incremental frames
        // skip the cache and only the stream state holds the segments.
        const segments = state!.segments
        appendTokens(segments, Prism.tokenize(text.slice(state!.source.length), grammar!), styles, plain)
        trackStreamState(stateKey, { source: text, segments, bytes: text.length + segmentsHeapBytes(segments) })
        result = segments
      } else {
        const segments: Segment[] = []
        appendTokens(segments, Prism.tokenize(text, grammar!), styles, plain)
        trackStreamState(stateKey, { source: text, segments, bytes: text.length + segmentsHeapBytes(segments) })
        result = segments
      }
    } catch {
      // Prism rejects a malformed program; the block renders as plain text
      // (result = null) and the stale stream state is dropped.
      const existing = streamStates.get(stateKey)
      if (existing !== undefined) streamStateBytes -= existing.bytes
      streamStates.delete(stateKey)
      result = null
    }
  }
  const bytes = text.length + segmentsHeapBytes(result)
  evictHighlightCacheIfNeeded()
  if (partition === undefined) {
    partition = new Map()
    highlightCache.set(partitionKey, partition)
  }
  partition.set(text, { segments: result, bytes })
  highlightCacheEntries += 1
  highlightCacheBytes += bytes
  return result
}

function evictHighlightCacheIfNeeded(): void {
  // Eviction walks partitions in creation order and drops each partition's
  // oldest entry first: an approximation of global LRU that never allocates.
  while (highlightCacheEntries > 0 && (highlightCacheEntries >= HIGHLIGHT_CACHE_MAX || highlightCacheBytes >= HIGHLIGHT_CACHE_MAX_BYTES)) {
    let evicted = false
    for (const partition of highlightCache.values()) {
      if (partition.size === 0) continue
      const oldest = partition.keys().next()
      if (oldest.done) continue
      const entry = partition.get(oldest.value)
      if (entry !== undefined) highlightCacheBytes -= entry.bytes
      partition.delete(oldest.value)
      highlightCacheEntries -= 1
      evicted = true
      break
    }
    if (!evicted) break
  }
}

function styleForToken(token: Prism.Token, styles: Record<string, MarkStyle>): MarkStyle | undefined {
  const direct = styles[token.type]
  if (direct !== undefined) return direct
  const alias = (token as unknown as { alias?: string | string[] }).alias
  if (alias !== undefined) {
    for (const name of Array.isArray(alias) ? alias : [alias]) {
      const style = styles[name]
      if (style !== undefined) return style
    }
  }
  return undefined
}

function appendTokens(segments: Segment[], tokens: Iterable<string | Prism.Token>, styles: Record<string, MarkStyle>, plain: MarkStyle): void {
  for (const token of tokens) {
    if (typeof token === 'string') {
      if (token !== '') segments.push({ text: token, style: plain })
    } else {
      appendToken(segments, token, styles, plain)
    }
  }
}

function appendToken(segments: Segment[], token: Prism.Token, styles: Record<string, MarkStyle>, plain: MarkStyle): void {
  const style = styleForToken(token, styles) ?? plain
  const content = token.content
  if (typeof content === 'string') {
    if (content !== '') segments.push({ text: content, style })
    return
  }
  for (const child of content as (string | Prism.Token)[]) {
    if (typeof child === 'string') {
      if (child !== '') segments.push({ text: child, style })
    } else {
      appendToken(segments, child, styles, plain)
    }
  }
}
