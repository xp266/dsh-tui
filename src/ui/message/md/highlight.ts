import Prism from 'prismjs'
import { colors } from '../../../theme.ts'
import type { MarkStyle, Segment } from '../../../core/segments.ts'

import 'prismjs/components/prism-clike.js'
import 'prismjs/components/prism-markup.js'
import 'prismjs/components/prism-css.js'
import 'prismjs/components/prism-markup-templating.js'
import 'prismjs/components/prism-javascript.js'
import 'prismjs/components/prism-json.js'
import 'prismjs/components/prism-ruby.js'
import 'prismjs/components/prism-c.js'
import 'prismjs/components/prism-bash.js'
import 'prismjs/components/prism-python.js'
import 'prismjs/components/prism-typescript.js'
import 'prismjs/components/prism-jsx.js'
import 'prismjs/components/prism-tsx.js'
import 'prismjs/components/prism-coffeescript.js'
import 'prismjs/components/prism-flow.js'
import 'prismjs/components/prism-json5.js'
import 'prismjs/components/prism-jsonp.js'
import 'prismjs/components/prism-cpp.js'
import 'prismjs/components/prism-objectivec.js'
import 'prismjs/components/prism-hlsl.js'
import 'prismjs/components/prism-php.js'
import 'prismjs/components/prism-handlebars.js'
import 'prismjs/components/prism-django.js'
import 'prismjs/components/prism-ejs.js'
import 'prismjs/components/prism-crystal.js'
import 'prismjs/components/prism-haml.js'
import 'prismjs/components/prism-gradle.js'
import 'prismjs/components/prism-markdown.js'
import 'prismjs/components/prism-go.js'
import 'prismjs/components/prism-rust.js'
import 'prismjs/components/prism-java.js'
import 'prismjs/components/prism-csharp.js'
import 'prismjs/components/prism-kotlin.js'
import 'prismjs/components/prism-scala.js'
import 'prismjs/components/prism-swift.js'
import 'prismjs/components/prism-dart.js'
import 'prismjs/components/prism-lua.js'
import 'prismjs/components/prism-perl.js'
import 'prismjs/components/prism-r.js'
import 'prismjs/components/prism-groovy.js'
import 'prismjs/components/prism-powershell.js'
import 'prismjs/components/prism-sql.js'
import 'prismjs/components/prism-yaml.js'
import 'prismjs/components/prism-toml.js'
import 'prismjs/components/prism-ini.js'
import 'prismjs/components/prism-properties.js'
import 'prismjs/components/prism-csv.js'
import 'prismjs/components/prism-docker.js'
import 'prismjs/components/prism-makefile.js'
import 'prismjs/components/prism-git.js'
import 'prismjs/components/prism-diff.js'
import 'prismjs/components/prism-regex.js'
import 'prismjs/components/prism-graphql.js'
import 'prismjs/components/prism-http.js'
import 'prismjs/components/prism-protobuf.js'
import 'prismjs/components/prism-elixir.js'
import 'prismjs/components/prism-erlang.js'
import 'prismjs/components/prism-haskell.js'
import 'prismjs/components/prism-ocaml.js'
import 'prismjs/components/prism-pascal.js'
import 'prismjs/components/prism-basic.js'
import 'prismjs/components/prism-vbnet.js'
import 'prismjs/components/prism-fsharp.js'
import 'prismjs/components/prism-clojure.js'
import 'prismjs/components/prism-scheme.js'
import 'prismjs/components/prism-lisp.js'
import 'prismjs/components/prism-julia.js'
import 'prismjs/components/prism-matlab.js'
import 'prismjs/components/prism-fortran.js'
import 'prismjs/components/prism-latex.js'
import 'prismjs/components/prism-rest.js'
import 'prismjs/components/prism-asciidoc.js'
import 'prismjs/components/prism-vim.js'
import 'prismjs/components/prism-wasm.js'
import 'prismjs/components/prism-zig.js'
import 'prismjs/components/prism-nim.js'
import 'prismjs/components/prism-nix.js'
import 'prismjs/components/prism-v.js'
import 'prismjs/components/prism-d.js'
import 'prismjs/components/prism-qml.js'
import 'prismjs/components/prism-glsl.js'
import 'prismjs/components/prism-elm.js'
import 'prismjs/components/prism-solidity.js'
import 'prismjs/components/prism-verilog.js'
import 'prismjs/components/prism-vhdl.js'
import 'prismjs/components/prism-nginx.js'
import 'prismjs/components/prism-apacheconf.js'
import 'prismjs/components/prism-hcl.js'
import 'prismjs/components/prism-cmake.js'
import 'prismjs/components/prism-systemd.js'
import 'prismjs/components/prism-editorconfig.js'
import 'prismjs/components/prism-ignore.js'
import 'prismjs/components/prism-gherkin.js'
import 'prismjs/components/prism-mermaid.js'
import 'prismjs/components/prism-plant-uml.js'
import 'prismjs/components/prism-shell-session.js'
import 'prismjs/components/prism-batch.js'
import 'prismjs/components/prism-sass.js'
import 'prismjs/components/prism-scss.js'
import 'prismjs/components/prism-less.js'
import 'prismjs/components/prism-stylus.js'
import 'prismjs/components/prism-twig.js'
import 'prismjs/components/prism-liquid.js'
import 'prismjs/components/prism-pug.js'
import 'prismjs/components/prism-awk.js'
import 'prismjs/components/prism-jq.js'
import 'prismjs/components/prism-applescript.js'
import 'prismjs/components/prism-autohotkey.js'
import 'prismjs/components/prism-autoit.js'
import 'prismjs/components/prism-haxe.js'
import 'prismjs/components/prism-cobol.js'
import 'prismjs/components/prism-ada.js'
import 'prismjs/components/prism-turtle.js'
import 'prismjs/components/prism-sparql.js'
import 'prismjs/components/prism-mongodb.js'

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
  comment: () => ({ color: colors.codeComment, italic: true }),
  string: () => ({ color: colors.codeString }),
  number: () => ({ color: colors.codeNumber }),
  constant: () => ({ color: colors.codeConstant }),
  keyword: () => ({ color: colors.codeKeyword }),
  function: () => ({ color: colors.codeFunction }),
  type: () => ({ color: colors.codeType }),
  variable: () => ({ color: colors.codeVariable }),
  operator: () => ({ color: colors.codeOperator }),
  added: () => ({ color: colors.success }),
  removed: () => ({ color: colors.errorText }),
  boldFlag: () => ({ bold: true }),
  italicFlag: () => ({ italic: true }),
  strikeFlag: () => ({ strike: true }),
}

const ROLE_STYLE_DARK: Record<CodeRole, () => MarkStyle> = {
  comment: () => ({ color: colors.codeCommentDark, italic: true }),
  string: () => ({ color: colors.codeStringDark }),
  number: () => ({ color: colors.codeNumberDark }),
  constant: () => ({ color: colors.codeConstantDark }),
  keyword: () => ({ color: colors.codeKeywordDark }),
  function: () => ({ color: colors.codeFunctionDark }),
  type: () => ({ color: colors.codeTypeDark }),
  variable: () => ({ color: colors.codeVariableDark }),
  operator: () => ({ color: colors.thinkCodePlain }),
  added: () => ({ color: colors.success }),
  removed: () => ({ color: colors.errorText }),
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
export const codeStylesDark = buildStyles(ROLE_STYLE_DARK)

const LANGUAGE_ALIASES: Record<string, string> = {
  py: 'python',
  python3: 'python',
  js: 'javascript',
  node: 'javascript',
  nodejs: 'javascript',
  mjs: 'javascript',
  cjs: 'javascript',
  ts: 'typescript',
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
  xhtml: 'markup',
  svg: 'markup',
  xml: 'markup',
  xsl: 'markup',
  plist: 'markup',
  styl: 'stylus',
  yml: 'yaml',
  cfg: 'ini',
  tsv: 'csv',
  mysql: 'sql',
  pgsql: 'sql',
  sqlite: 'sql',
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
}

const highlightCache = new Map<string, Segment[] | null>()

export function clearHighlightCache(): void {
  highlightCache.clear()
}

function resolveGrammar(lang: string): Prism.Grammar | undefined {
  const name = LANGUAGE_ALIASES[lang.toLowerCase()] ?? lang.toLowerCase()
  return Prism.languages[name]
}

export function highlightCodeBlock(text: string, lang: string, thinking = false): Segment[] | null {
  if (text === '') return []
  const key = `${thinking ? 'd' : 'l'}\x00${lang}\x00${text}`
  const cached = highlightCache.get(key)
  if (cached !== undefined) return cached
  const grammar = resolveGrammar(lang)
  let result: Segment[] | null
  if (grammar === undefined) {
    result = null
  } else {
    try {
      const styles = thinking ? codeStylesDark : codeStyles
      const plain: MarkStyle = { color: thinking ? colors.thinkCodePlain : colors.mdCodePlain }
      result = []
      for (const token of Prism.tokenize(text, grammar)) {
        if (typeof token === 'string') {
          if (token !== '') result.push({ text: token, style: plain })
        } else {
          appendToken(result, token, styles, plain)
        }
      }
    } catch {
      result = null
    }
  }
  if (highlightCache.size >= 4000) {
    const oldest = highlightCache.keys().next()
    if (!oldest.done) highlightCache.delete(oldest.value)
  }
  highlightCache.set(key, result)
  return result
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
