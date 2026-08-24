import Prism from 'prismjs'
import { colors } from '../../theme.ts'
import type { MarkStyle, Segment } from './markdown.ts'

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
import 'prismjs/components/prism-basic.js'
import 'prismjs/components/prism-applescript.js'
import 'prismjs/components/prism-autohotkey.js'
import 'prismjs/components/prism-autoit.js'
import 'prismjs/components/prism-haxe.js'
import 'prismjs/components/prism-cobol.js'
import 'prismjs/components/prism-ada.js'
import 'prismjs/components/prism-turtle.js'
import 'prismjs/components/prism-sparql.js'
import 'prismjs/components/prism-mongodb.js'

const CODE_PLAIN: MarkStyle = {
  get color() {
    return colors.codeOperator
  },
}
const CODE_PLAIN_DARK: MarkStyle = {
  get color() {
    return colors.codeOperatorDark
  },
}

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

export const codeStyles: Record<string, MarkStyle> = {
  get comment() { return { color: colors.codeComment, italic: true } },
  get shebang() { return { color: colors.codeComment, italic: true } },
  get hashbang() { return { color: colors.codeComment, italic: true } },
  get at() { return { color: colors.codeOperator } },
  get 'generic-function'() { return { color: colors.codeFunction } },
  get 'doctype-tag'() { return { color: colors.codeKeyword } },
  get 'special-attr'() { return { color: colors.codeConstant } },
  get 'for-or-select'() { return { color: colors.codeKeyword } },
  get 'closure-punctuation'() { return { color: colors.codeOperator } },
  get target() { return { color: colors.codeKeyword } },
  get prolog() { return { color: colors.codeComment, italic: true } },
  get doctype() { return { color: colors.codeComment, italic: true } },
  get cdata() { return { color: colors.codeComment, italic: true } },
  get 'included-cdata'() { return { color: colors.codeComment, italic: true } },
  get 'internal-subset'() { return { color: colors.codeComment, italic: true } },
  get string() { return { color: colors.codeString } },
  get 'template-string'() { return { color: colors.codeString } },
  get 'triple-quoted-string'() { return { color: colors.codeString } },
  get 'interpolation-string'() { return { color: colors.codeString } },
  get 'string-interpolation'() { return { color: colors.codeString } },
  get 'attr-value'() { return { color: colors.codeString } },
  get char() { return { color: colors.codeString } },
  get regex() { return { color: colors.codeString } },
  get 'regex-source'() { return { color: colors.codeString } },
  get url() { return { color: colors.codeString } },
  get scalar() { return { color: colors.codeString } },
  get number() { return { color: colors.codeNumber } },
  get literal() { return { color: colors.codeNumber } },
  get datetime() { return { color: colors.codeNumber } },
  get boolean() { return { color: colors.codeConstant } },
  get symbol() { return { color: colors.codeConstant } },
  get constant() { return { color: colors.codeConstant } },
  get null() { return { color: colors.codeConstant } },
  get 'format-spec'() { return { color: colors.codeConstant } },
  get 'conversion-option'() { return { color: colors.codeConstant } },
  get 'regex-flags'() { return { color: colors.codeConstant } },
  get 'file-descriptor'() { return { color: colors.codeConstant } },
  get 'lifetime-annotation'() { return { color: colors.codeConstant } },
  get keyword() { return { color: colors.codeKeyword } },
  get atrule() { return { color: colors.codeKeyword } },
  get rule() { return { color: colors.codeKeyword } },
  get directive() { return { color: colors.codeKeyword } },
  get preprocessor() { return { color: colors.codeKeyword } },
  get import() { return { color: colors.codeKeyword } },
  get 'module-declaration'() { return { color: colors.codeKeyword } },
  get attribute() { return { color: colors.codeKeyword } },
  get annotation() { return { color: colors.codeFunction } },
  get decorator() { return { color: colors.codeFunction } },
  get function() { return { color: colors.codeFunction } },
  get 'function-variable'() { return { color: colors.codeFunction } },
  get 'function-name'() { return { color: colors.codeFunction } },
  get macro() { return { color: colors.codeFunction } },
  get 'function-definition'() { return { color: colors.codeFunction } },
  get 'constructor-invocation'() { return { color: colors.codeFunction } },
  get 'generic-method'() { return { color: colors.codeFunction } },
  get 'selector-function-argument'() { return { color: colors.codeFunction } },
  get 'class-name'() { return { color: colors.codeType } },
  get builtin() { return { color: colors.codeType } },
  get type() { return { color: colors.codeType } },
  get generics() { return { color: colors.codeType } },
  get generic() { return { color: colors.codeType } },
  get namespace() { return { color: colors.codeType } },
  get 'type-definition'() { return { color: colors.codeType } },
  get 'type-expression'() { return { color: colors.codeType } },
  get 'type-list'() { return { color: colors.codeType } },
  get 'return-type'() { return { color: colors.codeType } },
  get 'fragment-specifier'() { return { color: colors.codeType } },
  get variable() { return { color: colors.codeVariable } },
  get parameter() { return { color: colors.codeVariable } },
  get property() { return { color: colors.codeVariable } },
  get 'literal-property'() { return { color: colors.codeVariable } },
  get 'string-property'() { return { color: colors.codeVariable } },
  get 'attr-name'() { return { color: colors.codeVariable } },
  get key() { return { color: colors.codeVariable } },
  get identifier() { return { color: colors.codeVariable } },
  get environment() { return { color: colors.codeVariable } },
  get 'assign-left'() { return { color: colors.codeVariable } },
  get 'named-parameter'() { return { color: colors.codeVariable } },
  get 'closure-params'() { return { color: colors.codeVariable } },
  get interpolation() { return { color: colors.codeVariable } },
  get operator() { return { color: colors.codeOperator } },
  get punctuation() { return { color: colors.codeOperator } },
  get tag() { return { color: colors.codeOperator } },
  get name() { return { color: colors.codeOperator } },
  get selector() { return { color: colors.codeOperator } },
  get entity() { return { color: colors.codeOperator } },
  get important() { return { color: colors.codeOperator } },
  get script() { return { color: colors.codeOperator } },
  get style() { return { color: colors.codeOperator } },
  get 'regex-delimiter'() { return { color: colors.codeOperator } },
  get 'template-punctuation'() { return { color: colors.codeString } },
  get 'interpolation-punctuation'() { return { color: colors.codeOperator } },
  get range() { return { color: colors.codeOperator } },
  get 'record-arguments'() { return { color: colors.codeOperator } },
  get 'attribute-arguments'() { return { color: colors.codeOperator } },
  get instruction() { return { color: colors.codeKeyword } },
  get options() { return { color: colors.codeConstant } },
  get insertion() { return { color: colors.success } },
  get deleted() { return { color: colors.errorText } },
  get diff() { return { color: colors.codeKeyword } },
  get coord() { return { color: colors.codeComment, italic: true } },
}

export const codeStylesDark: Record<string, MarkStyle> = {
  get comment() { return { color: colors.codeCommentDark, italic: true } },
  get shebang() { return { color: colors.codeCommentDark, italic: true } },
  get hashbang() { return { color: colors.codeCommentDark, italic: true } },
  get at() { return { color: colors.codeOperatorDark } },
  get 'generic-function'() { return { color: colors.codeFunctionDark } },
  get 'doctype-tag'() { return { color: colors.codeKeywordDark } },
  get 'special-attr'() { return { color: colors.codeConstantDark } },
  get 'for-or-select'() { return { color: colors.codeKeywordDark } },
  get 'closure-punctuation'() { return { color: colors.codeOperatorDark } },
  get target() { return { color: colors.codeKeywordDark } },
  get prolog() { return { color: colors.codeCommentDark, italic: true } },
  get doctype() { return { color: colors.codeCommentDark, italic: true } },
  get cdata() { return { color: colors.codeCommentDark, italic: true } },
  get 'included-cdata'() { return { color: colors.codeCommentDark, italic: true } },
  get 'internal-subset'() { return { color: colors.codeCommentDark, italic: true } },
  get string() { return { color: colors.codeStringDark } },
  get 'template-string'() { return { color: colors.codeStringDark } },
  get 'triple-quoted-string'() { return { color: colors.codeStringDark } },
  get 'interpolation-string'() { return { color: colors.codeStringDark } },
  get 'string-interpolation'() { return { color: colors.codeStringDark } },
  get 'attr-value'() { return { color: colors.codeStringDark } },
  get char() { return { color: colors.codeStringDark } },
  get regex() { return { color: colors.codeStringDark } },
  get 'regex-source'() { return { color: colors.codeStringDark } },
  get url() { return { color: colors.codeStringDark } },
  get scalar() { return { color: colors.codeStringDark } },
  get number() { return { color: colors.codeNumberDark } },
  get literal() { return { color: colors.codeNumberDark } },
  get datetime() { return { color: colors.codeNumberDark } },
  get boolean() { return { color: colors.codeConstantDark } },
  get symbol() { return { color: colors.codeConstantDark } },
  get constant() { return { color: colors.codeConstantDark } },
  get null() { return { color: colors.codeConstantDark } },
  get 'format-spec'() { return { color: colors.codeConstantDark } },
  get 'conversion-option'() { return { color: colors.codeConstantDark } },
  get 'regex-flags'() { return { color: colors.codeConstantDark } },
  get 'file-descriptor'() { return { color: colors.codeConstantDark } },
  get 'lifetime-annotation'() { return { color: colors.codeConstantDark } },
  get keyword() { return { color: colors.codeKeywordDark } },
  get atrule() { return { color: colors.codeKeywordDark } },
  get rule() { return { color: colors.codeKeywordDark } },
  get directive() { return { color: colors.codeKeywordDark } },
  get preprocessor() { return { color: colors.codeKeywordDark } },
  get import() { return { color: colors.codeKeywordDark } },
  get 'module-declaration'() { return { color: colors.codeKeywordDark } },
  get attribute() { return { color: colors.codeKeywordDark } },
  get annotation() { return { color: colors.codeFunctionDark } },
  get decorator() { return { color: colors.codeFunctionDark } },
  get function() { return { color: colors.codeFunctionDark } },
  get 'function-variable'() { return { color: colors.codeFunctionDark } },
  get 'function-name'() { return { color: colors.codeFunctionDark } },
  get macro() { return { color: colors.codeFunctionDark } },
  get 'function-definition'() { return { color: colors.codeFunctionDark } },
  get 'constructor-invocation'() { return { color: colors.codeFunctionDark } },
  get 'generic-method'() { return { color: colors.codeFunctionDark } },
  get 'selector-function-argument'() { return { color: colors.codeFunctionDark } },
  get 'class-name'() { return { color: colors.codeTypeDark } },
  get builtin() { return { color: colors.codeTypeDark } },
  get type() { return { color: colors.codeTypeDark } },
  get generics() { return { color: colors.codeTypeDark } },
  get generic() { return { color: colors.codeTypeDark } },
  get namespace() { return { color: colors.codeTypeDark } },
  get 'type-definition'() { return { color: colors.codeTypeDark } },
  get 'type-expression'() { return { color: colors.codeTypeDark } },
  get 'type-list'() { return { color: colors.codeTypeDark } },
  get 'return-type'() { return { color: colors.codeTypeDark } },
  get 'fragment-specifier'() { return { color: colors.codeTypeDark } },
  get variable() { return { color: colors.codeVariableDark } },
  get parameter() { return { color: colors.codeVariableDark } },
  get property() { return { color: colors.codeVariableDark } },
  get 'literal-property'() { return { color: colors.codeVariableDark } },
  get 'string-property'() { return { color: colors.codeVariableDark } },
  get 'attr-name'() { return { color: colors.codeVariableDark } },
  get key() { return { color: colors.codeVariableDark } },
  get identifier() { return { color: colors.codeVariableDark } },
  get environment() { return { color: colors.codeVariableDark } },
  get 'assign-left'() { return { color: colors.codeVariableDark } },
  get 'named-parameter'() { return { color: colors.codeVariableDark } },
  get 'closure-params'() { return { color: colors.codeVariableDark } },
  get interpolation() { return { color: colors.codeVariableDark } },
  get operator() { return { color: colors.codeOperatorDark } },
  get punctuation() { return { color: colors.codeOperatorDark } },
  get tag() { return { color: colors.codeOperatorDark } },
  get name() { return { color: colors.codeOperatorDark } },
  get selector() { return { color: colors.codeOperatorDark } },
  get entity() { return { color: colors.codeOperatorDark } },
  get important() { return { color: colors.codeOperatorDark } },
  get script() { return { color: colors.codeOperatorDark } },
  get style() { return { color: colors.codeOperatorDark } },
  get 'regex-delimiter'() { return { color: colors.codeOperatorDark } },
  get 'template-punctuation'() { return { color: colors.codeStringDark } },
  get 'interpolation-punctuation'() { return { color: colors.codeOperatorDark } },
  get range() { return { color: colors.codeOperatorDark } },
  get 'record-arguments'() { return { color: colors.codeOperatorDark } },
  get 'attribute-arguments'() { return { color: colors.codeOperatorDark } },
  get instruction() { return { color: colors.codeKeywordDark } },
  get options() { return { color: colors.codeConstantDark } },
  get insertion() { return { color: colors.success } },
  get deleted() { return { color: colors.errorText } },
  get diff() { return { color: colors.codeKeywordDark } },
  get coord() { return { color: colors.codeCommentDark, italic: true } },
}

const highlightCache = new Map<string, Segment[] | null>()

export function clearHighlightCache(): void {
  highlightCache.clear()
}

function resolveGrammar(lang: string): Prism.Grammar | undefined {
  const name = LANGUAGE_ALIASES[lang.toLowerCase()] ?? lang.toLowerCase()
  return Prism.languages[name]
}

export function highlightCodeBlock(text: string, lang: string, dark = false): Segment[] | null {
  const key = `${dark ? 'd' : 'l'}\x00${lang}\x00${text}`
  const cached = highlightCache.get(key)
  if (cached !== undefined) return cached
  const grammar = resolveGrammar(lang)
  let result: Segment[] | null
  if (grammar === undefined) {
    result = null
  } else {
    try {
      const styles = dark ? codeStylesDark : codeStyles
      const plain = dark ? CODE_PLAIN_DARK : CODE_PLAIN
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

export function highlightCode(line: string, lang: string, dark = false): Segment[] | null {
  return highlightCodeBlock(line, lang, dark)
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
