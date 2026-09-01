import fs from 'node:fs'

const spec = JSON.parse(fs.readFileSync(new URL('../openapi.json', import.meta.url), 'utf8'))
const schemas = spec.components?.schemas ?? {}

const refName = (ref) => ref?.split('/').pop()
const ts = (schema, fallback = 'unknown') => {
  if (!schema) return fallback
  if (schema.$ref) return refName(schema.$ref)
  if (schema.type === 'array') return `Array<${ts(schema.items)}>`
  if (schema.type === 'object') {
    const required = new Set(schema.required ?? [])
    return `{ ${Object.entries(schema.properties ?? {}).map(([name, value]) => `${JSON.stringify(name)}${required.has(name) ? '' : '?'}: ${ts(value)}`).join('; ')} }`
  }
  if (schema.enum) return schema.enum.map((v) => JSON.stringify(v)).join(' | ')
  if (schema.type === 'integer' || schema.type === 'number') return 'number'
  if (schema.type === 'boolean') return 'boolean'
  if (schema.type === 'string') return 'string'
  return fallback
}

const lines = ['// GENERATED FROM openapi.json - DO NOT EDIT', '' , '']
for (const [name, schema] of Object.entries(schemas)) lines.push(`export type ${name} = ${ts(schema)}`)
lines.push('', 'export type ApiError = { error: string; requestId?: string }')
lines.push('export type RequestOptions = { idempotencyKey?: string; signal?: AbortSignal }')
lines.push('export class QuickLinkError extends Error { constructor(readonly status: number, readonly body: ApiError) { super(body.error); this.name = "QuickLinkError" } }')
lines.push('')
lines.push('export class QuickLinkClient {')
lines.push('  private readonly baseUrl: string')
lines.push('  private readonly apiKey: string')
lines.push('  private readonly fetcher: typeof fetch')
lines.push('  constructor(options: { baseUrl: string; apiKey: string; fetch?: typeof fetch }) { this.baseUrl = options.baseUrl.replace(/\\/$/, ""); this.apiKey = options.apiKey; this.fetcher = options.fetch ?? fetch }')
lines.push('  private async request<T>(path: string, init: RequestInit = {}, options: RequestOptions = {}): Promise<T> {')
lines.push('    const headers = new Headers(init.headers); headers.set("accept", "application/json"); headers.set("content-type", "application/json"); headers.set("x-api-key", this.apiKey); if (options.idempotencyKey) headers.set("Idempotency-Key", options.idempotencyKey)')
lines.push('    const response = await this.fetcher(`${this.baseUrl}${path}`, { ...init, headers, signal: options.signal }); const body = await response.json().catch(() => null)')
lines.push('    if (!response.ok) throw new QuickLinkError(response.status, body && typeof body === "object" && "error" in body ? body : { error: `HTTP ${response.status}` })')
lines.push('    return body as T')
lines.push('  }')

for (const [path, methods] of Object.entries(spec.paths ?? {})) {
  for (const [method, operation] of Object.entries(methods)) {
    if (!operation.operationId) continue
    const params = operation.parameters ?? []
    const pathParams = params.filter((p) => p.in === 'path')
    const requestSchema = operation.requestBody?.content?.['application/json']?.schema
    const response = operation.responses?.['200'] ?? operation.responses?.['201'] ?? Object.values(operation.responses ?? {})[0]
    const responseSchema = response?.content?.['application/json']?.schema
    const returnType = ts(responseSchema)
    const args = pathParams.map((p) => `${p.name}: string`)
    if (requestSchema) args.push(`input: ${ts(requestSchema)}`)
    args.push('options?: RequestOptions')
    let url = path
    for (const p of pathParams) url = url.replace(`{${p.name}}`, '${encodeURIComponent(' + p.name + ')}')
    const init = method === 'get' ? '' : `{ method: "${method.toUpperCase()}", body: JSON.stringify(input) }`
    lines.push(`  ${operation.operationId}(${args.join(', ')}): Promise<${returnType}> { return this.request<${returnType}>(\`${url}\`, ${init || '{}'}, options) }`)
  }
}
lines.push('}', '')

fs.mkdirSync(new URL('../src', import.meta.url), { recursive: true })
fs.writeFileSync(new URL('../src/generated.ts', import.meta.url), `${lines.join('\n')}\n`)
