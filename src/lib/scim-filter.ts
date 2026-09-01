/** RFC 7644 §3.4.2.2 filter parser/evaluator.
 *
 * The parser deliberately produces a small data-only AST.  No input is ever
 * interpolated into a query or evaluated as JavaScript.  Limits are applied
 * before parsing so an untrusted `filter` parameter cannot exhaust the stack.
 */
export type ScimLiteral = string | number | boolean | null
export type ScimAttr = {
  kind: 'attr'
  path: string[]
  op: 'eq' | 'ne' | 'co' | 'sw' | 'ew' | 'gt' | 'ge' | 'lt' | 'le' | 'pr'
  value?: ScimLiteral
}
export type ScimFilter =
  | ScimAttr
  | { kind: 'and' | 'or'; left: ScimFilter; right: ScimFilter }
  | { kind: 'not'; child: ScimFilter }
  | { kind: 'valuePath'; path: string[]; child: ScimFilter }

type Token = { kind: 'atom' | 'string' | 'number' | 'punct'; value: string; pos: number }
const MAX_INPUT = 8192
const MAX_TOKENS = 1024
const MAX_DEPTH = 64
const ATTR_RE = /^[A-Za-z][A-Za-z0-9_-]*$/
const OP_RE = /^(eq|ne|co|sw|ew|gt|ge|lt|le|pr)$/i

function error(message = 'Invalid SCIM filter syntax'): never {
  throw new Error(message)
}

function lex(input: string): Token[] {
  if (input.length > MAX_INPUT) error('SCIM filter is too long')
  const out: Token[] = []
  let i = 0
  while (i < input.length) {
    if (/\s/.test(input[i])) { i++; continue }
    const pos = i
    const c = input[i]
    if ('()[].'.includes(c)) { out.push({ kind: 'punct', value: c, pos }); i++; continue }
    if (c === '"') {
      i++
      let value = ''
      while (i < input.length && input[i] !== '"') {
        const ch = input[i++]
        if (ch !== '\\') { value += ch; continue }
        if (i >= input.length) error('Unterminated SCIM string')
        const esc = input[i++]
        if ('"\\/'.includes(esc)) value += esc
        else if (esc === 'b') value += '\b'
        else if (esc === 'f') value += '\f'
        else if (esc === 'n') value += '\n'
        else if (esc === 'r') value += '\r'
        else if (esc === 't') value += '\t'
        else if (esc === 'u') {
          const hex = input.slice(i, i + 4)
          if (!/^[0-9A-Fa-f]{4}$/.test(hex)) error('Invalid SCIM unicode escape')
          value += String.fromCharCode(parseInt(hex, 16)); i += 4
        } else error('Invalid SCIM string escape')
      }
      if (input[i] !== '"') error('Unterminated SCIM string')
      i++
      out.push({ kind: 'string', value, pos })
    } else {
      // Attribute names may be schema-qualified by a URI (which can contain
      // '/', ':', and '.').  Keep the whole atom and split the attrPath later.
      let j = i
      while (j < input.length && !/\s/.test(input[j]) && !'()[]"'.includes(input[j])) j++
      if (j === i) error(`Invalid SCIM filter at ${i}`)
      const value = input.slice(i, j)
      if (/^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?$/.test(value)) {
        out.push({ kind: 'number', value, pos })
      } else out.push({ kind: 'atom', value, pos })
      i = j
    }
    if (out.length > MAX_TOKENS) error('SCIM filter has too many tokens')
  }
  return out
}

function attrPathFromAtom(raw: string): string[] {
  // For a schema-qualified path, the final ':' separates URI from ATTRNAME.
  // Dots in the URI itself are not sub-attribute separators.
  const colon = raw.lastIndexOf(':')
  const suffix = colon >= 0 ? raw.slice(colon + 1) : raw
  if (colon >= 0 && !raw.slice(0, colon)) error('Invalid SCIM schema URI')
  const parts = suffix.split('.')
  if (parts.some(p => !ATTR_RE.test(p))) error('Invalid SCIM attribute path')
  return parts
}

export function parseScimFilter(input: string | null): ScimFilter | null {
  if (input == null || !input.trim()) return null
  const tokens = lex(input.trim())
  let i = 0
  let depth = 0
  const peek = () => tokens[i]
  const take = (kind?: Token['kind'], value?: string) => {
    const t = tokens[i]
    if (!t || (kind && t.kind !== kind) || (value !== undefined && t.value.toLowerCase() !== value.toLowerCase())) error()
    i++
    return t
  }
  const enter = () => { if (++depth > MAX_DEPTH) error('SCIM filter nesting is too deep') }
  const leave = () => { depth-- }

  const path = (): string[] => {
    const t = take('atom')
    return attrPathFromAtom(t.value)
  }
  const literal = (): ScimLiteral => {
    const t = peek()
    if (!t) error()
    if (t.kind === 'string') return take().value
    if (t.kind === 'number') return Number(take().value)
    if (t.kind === 'atom') {
      const v = take().value
      if (v === 'true') return true
      if (v === 'false') return false
      if (v === 'null') return null
    }
    error('Invalid SCIM comparison value')
  }

  const attrExp = (): ScimFilter => {
    const p = path()
    const op = take('atom').value.toLowerCase()
    if (!OP_RE.test(op)) error('Unsupported SCIM operator')
    const operator = op as ScimAttr['op']
    if (operator === 'pr') return { kind: 'attr', path: p, op: operator }
    return { kind: 'attr', path: p, op: operator, value: literal() }
  }

  // valFilter is intentionally separate from filter: RFC 7644 errata 4690
  // prevents recursive valuePaths inside valuePath filters, while errata 7322
  // still permits grouping and logical expressions over attribute expressions.
  const valFilter = (): ScimFilter => {
    enter()
    try {
      if (peek()?.kind === 'atom' && peek()!.value.toLowerCase() === 'not') {
        take('atom'); take('punct', '(')
        const child = valFilter(); take('punct', ')')
        return { kind: 'not', child }
      }
      if (peek()?.kind === 'punct' && peek()!.value === '(') {
        take('punct', '('); const x = valFilter(); take('punct', ')'); return x
      }
      let left = attrExp()
      while (peek()?.kind === 'atom' && /^(and|or)$/i.test(peek()!.value)) {
        const op = take('atom').value.toLowerCase() as 'and' | 'or'
        const right = valFilter()
        left = { kind: op, left, right }
      }
      return left
    } finally { leave() }
  }

  const primary = (): ScimFilter => {
    enter()
    try {
      if (peek()?.kind === 'atom' && peek()!.value.toLowerCase() === 'not') {
        take('atom'); take('punct', '('); const child = filter(); take('punct', ')'); return { kind: 'not', child }
      }
      if (peek()?.kind === 'punct' && peek()!.value === '(') {
        take('punct', '('); const x = filter(); take('punct', ')'); return x
      }
      const p = path()
      if (peek()?.kind === 'punct' && peek()!.value === '[') {
        take('punct', '['); const child = valFilter(); take('punct', ']')
        return { kind: 'valuePath', path: p, child }
      }
      const op = take('atom').value.toLowerCase()
      if (!OP_RE.test(op)) error('Unsupported SCIM operator')
      const operator = op as ScimAttr['op']
      if (operator === 'pr') return { kind: 'attr', path: p, op: operator }
      return { kind: 'attr', path: p, op: operator, value: literal() }
    } finally { leave() }
  }
  const andExp = (): ScimFilter => {
    let left = primary()
    while (peek()?.kind === 'atom' && peek()!.value.toLowerCase() === 'and') {
      take('atom'); left = { kind: 'and', left, right: primary() }
    }
    return left
  }
  function filter(): ScimFilter {
    let left = andExp()
    while (peek()?.kind === 'atom' && peek()!.value.toLowerCase() === 'or') {
      take('atom'); left = { kind: 'or', left, right: andExp() }
    }
    return left
  }
  const result = filter()
  if (i !== tokens.length) error('Unexpected SCIM filter tokens')
  return result
}

function valuesAt(root: unknown, path: string[]): unknown[] {
  let current: unknown[] = [root]
  for (const segment of path) {
    const next: unknown[] = []
    for (const value of current) {
      if (Array.isArray(value)) { for (const item of value) next.push(...valuesAt(item, [segment])); continue }
      if (value && typeof value === 'object') {
        const key = Object.keys(value as object).find(k => k.toLowerCase() === segment.toLowerCase())
        if (key) next.push((value as Record<string, unknown>)[key])
      }
    }
    current = next
  }
  return current.flatMap(v => Array.isArray(v) ? v : [v])
}

function compare(a: unknown, op: ScimAttr['op'], b?: ScimLiteral): boolean {
  if (a === undefined || a === null) return false
  if (op === 'pr') return a !== ''
  if (b === undefined) return false
  if (typeof a === 'string' && typeof b === 'string') {
    const x = a.toLowerCase(), y = b.toLowerCase()
    if (op === 'eq') return x === y
    if (op === 'ne') return x !== y
    if (op === 'co') return x.includes(y)
    if (op === 'sw') return x.startsWith(y)
    if (op === 'ew') return x.endsWith(y)
    if (op === 'gt') return x > y
    if (op === 'ge') return x >= y
    if (op === 'lt') return x < y
    if (op === 'le') return x <= y
  }
  if (typeof a === 'number' && typeof b === 'number' && Number.isFinite(a) && Number.isFinite(b)) {
    if (op === 'eq') return a === b; if (op === 'ne') return a !== b
    if (op === 'gt') return a > b; if (op === 'ge') return a >= b
    if (op === 'lt') return a < b; if (op === 'le') return a <= b
  }
  if (typeof a === 'boolean' && typeof b === 'boolean') return op === 'eq' ? a === b : op === 'ne' ? a !== b : false
  return false
}

export function scimFilterMatches(resource: unknown, filter: ScimFilter): boolean {
  const evalFilter = (f: ScimFilter, root: unknown): boolean => {
    if (f.kind === 'and') return evalFilter(f.left, root) && evalFilter(f.right, root)
    if (f.kind === 'or') return evalFilter(f.left, root) || evalFilter(f.right, root)
    if (f.kind === 'not') return !evalFilter(f.child, root)
    if (f.kind === 'valuePath') {
      const candidates = valuesAt(root, f.path)
      return candidates.some(v => Array.isArray(v) ? v.some(item => evalFilter(f.child, item)) : evalFilter(f.child, v))
    }
    const attr = f as ScimAttr
    return valuesAt(root, attr.path).some(v => compare(v, attr.op, attr.value))
  }
  return evalFilter(filter, resource)
}
