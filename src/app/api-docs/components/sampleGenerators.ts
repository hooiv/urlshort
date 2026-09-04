/**
 * Pure multi-language sample generators for the docs playground.
 *
 * Kept separate from React so snippet output is unit-testable in the node
 * vitest environment. Fixes applied over the original inline version:
 * - Go samples now send the JSON payload instead of a `nil` body.
 * - Python samples emit valid Python literals (`True`/`False`/`None`).
 * - cURL bodies escape single quotes instead of breaking the `-d` string.
 * - Auth header matches the endpoint (`x-api-key` vs `x-management-token`).
 */

import type { HttpMethod, LangTab } from './apiCatalog'
import { methodHasBody } from './apiCatalog'
import { resolveCredential } from './authHeaders'

export interface SampleInput {
  lang: LangTab
  method: HttpMethod
  /** Fully resolved request URL (origin + path + query string). */
  fullUrl: string
  /** Raw credential field value (may be empty). */
  apiKey: string
  /** Raw JSON body text from the playground editor. */
  bodyText: string
  /** Header name override; defaults to the endpoint's auth header. */
  authHeader?: string
}

/** Escape a value for embedding inside a single-quoted shell string. */
export function escapeForCurlSingleQuotes(value: string): string {
  return value.replace(/'/g, `'\\''`)
}

/** Collapse pretty-printed JSON onto one line for `-d` payloads. */
export function collapseJsonWhitespace(bodyText: string): string {
  return bodyText.replace(/\n\s*/g, ' ')
}

/**
 * Convert a JSON document to an equivalent Python literal.
 * Returns `null` when the input is not valid JSON.
 */
export function jsonToPythonLiteral(jsonText: string): string | null {
  let parsed: unknown
  try {
    parsed = JSON.parse(jsonText) as unknown
  } catch {
    return null
  }
  return toPythonLiteral(parsed)
}

function toPythonLiteral(value: unknown): string {
  if (value === null || value === undefined) return 'None'
  if (typeof value === 'boolean') return value ? 'True' : 'False'
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : 'None'
  if (typeof value === 'string') return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map((item) => toPythonLiteral(item)).join(', ')}]`
  if (typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>).map(
      ([key, item]) => `${JSON.stringify(key)}: ${toPythonLiteral(item)}`,
    )
    return `{${entries.join(', ')}}`
  }
  return JSON.stringify(value) ?? 'None'
}

/**
 * Escape a JSON payload for a Go backtick raw string literal, which cannot
 * itself contain backticks.
 */
export function escapeForGoRawString(value: string): string {
  return value.split('`').join('` + "`" + `')
}

function curlSample(input: SampleInput, header: string, credential: string, body: string): string {
  let cmd = `curl -X ${input.method} "${input.fullUrl}" \\\n  -H "${header}: ${credential}"`
  if (methodHasBody(input.method) && body.trim()) {
    cmd += ` \\\n  -H "Content-Type: application/json" \\\n  -d '${escapeForCurlSingleQuotes(collapseJsonWhitespace(body))}'`
  }
  return cmd
}

function nodeSample(input: SampleInput, header: string, credential: string, body: string): string {
  const opts: { method: string; headers: Record<string, string>; body?: string } = {
    method: input.method,
    headers: {
      [header]: credential,
      ...(methodHasBody(input.method) ? { 'Content-Type': 'application/json' } : {}),
    },
  }
  if (methodHasBody(input.method) && body.trim()) {
    opts.body = 'PAYLOAD'
  }

  const optsStr = JSON.stringify(opts, null, 2).replace('"PAYLOAD"', body || '{}')
  return `const response = await fetch("${input.fullUrl}", ${optsStr});\n\nconst data = await response.json();\nconsole.log(data);`
}

function pythonSample(input: SampleInput, header: string, credential: string, body: string): string {
  const verb = input.method.toLowerCase()
  let py = `import requests\n\nurl = "${input.fullUrl}"\nheaders = {\n    "${header}": "${credential}"\n}`
  if (methodHasBody(input.method) && body.trim()) {
    const literal = jsonToPythonLiteral(body)
    py += literal === null
      ? `\n# NOTE: the playground body is not valid JSON — fix it before running.\n# payload = <invalid JSON>\n\nresponse = requests.${verb}(url, headers=headers)`
      : `\npayload = ${literal}\n\nresponse = requests.${verb}(url, json=payload, headers=headers)`
  } else {
    py += `\n\nresponse = requests.${verb}(url, headers=headers)`
  }
  py += '\nprint(response.status_code, response.json())'
  return py
}

function goSample(input: SampleInput, header: string, credential: string, body: string): string {
  const hasPayload = methodHasBody(input.method) && body.trim().length > 0
  const bodySetup = hasPayload
    ? `\tbody := bytes.NewBufferString(\`${escapeForGoRawString(body)}\`)\n\t`
    : ''
  const bodyArg = hasPayload ? ', body' : ', nil'
  const imports = hasPayload ? '\t"bytes"\n\t"fmt"\n\t"io"\n\t"net/http"' : '\t"fmt"\n\t"io"\n\t"net/http"'
  return `package main\n\nimport (\n${imports}\n)\n\nfunc main() {\n${bodySetup}\treq, _ := http.NewRequest("${input.method}", "${input.fullUrl}"${bodyArg})\n\treq.Header.Set("${header}", "${credential}")${hasPayload ? '\n\treq.Header.Set("Content-Type", "application/json")' : ''}\n\tclient := &http.Client{}\n\tresp, err := client.Do(req)\n\tif err != nil { panic(err) }\n\tdefer resp.Body.Close()\n\tbody, _ := io.ReadAll(resp.Body)\n\tfmt.Println(string(body))\n}`
}

export function generateCodeSample(input: SampleInput): string {
  const header = input.authHeader ?? 'x-api-key'
  const credential = resolveCredential(input.apiKey)
  switch (input.lang) {
    case 'curl':
      return curlSample(input, header, credential, input.bodyText)
    case 'node':
      return nodeSample(input, header, credential, input.bodyText)
    case 'python':
      return pythonSample(input, header, credential, input.bodyText)
    case 'go':
      return goSample(input, header, credential, input.bodyText)
  }
}
