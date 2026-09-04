'use client'

/**
 * Playground state hook: endpoint selection, request-builder form state,
 * live-request execution, and snippet generation.
 *
 * All pure decisions (URL resolution, validation, headers, samples) live in
 * sibling modules; this hook only wires them to React state + toasts.
 */

import { useMemo, useState } from 'react'
import toast from 'react-hot-toast'
import { API_CATALOG, methodHasBody } from '@/app/api-docs/components/apiCatalog'
import type { EndpointSpec, LangTab } from '@/app/api-docs/components/apiCatalog'
import { authHeaderName, buildAuthHeaders } from '@/app/api-docs/components/authHeaders'
import { copyTextWithFallback, legacyTextareaCopy } from '@/app/api-docs/components/clipboard'
import { generateCodeSample } from '@/app/api-docs/components/sampleGenerators'
import {
  getResponseErrorMessage,
  validateJsonBody,
  validatePathParams,
} from '@/app/api-docs/components/validation'
import { buildResolvedPath } from '@/app/api-docs/components/urlBuilder'

export interface PlaygroundResponse {
  status: number
  statusText: string
  latencyMs: number
  data: unknown
  headers: Record<string, string>
}

function initialPathValues(spec: EndpointSpec): Record<string, string> {
  const values: Record<string, string> = {}
  spec.pathParams?.forEach((param) => {
    values[param.name] = param.default || 'demo'
  })
  return values
}

function initialQueryValues(spec: EndpointSpec): Record<string, string> {
  const values: Record<string, string> = {}
  spec.queryParams?.forEach((param) => {
    if (param.default) values[param.name] = param.default
  })
  return values
}

function initialBodyText(spec: EndpointSpec): string {
  return spec.defaultBody ? JSON.stringify(spec.defaultBody, null, 2) : ''
}

export function useApiPlayground() {
  const [selectedEndpoint, setSelectedEndpoint] = useState<EndpointSpec>(API_CATALOG[0])
  const [apiKey, setApiKey] = useState('')
  const [apiKeyVisible, setApiKeyVisible] = useState(false)
  const [langTab, setLangTab] = useState<LangTab>('curl')

  const [pathParamValues, setPathParamValues] = useState<Record<string, string>>(() =>
    initialPathValues(API_CATALOG[0]),
  )
  const [queryParamValues, setQueryParamValues] = useState<Record<string, string>>(() =>
    initialQueryValues(API_CATALOG[0]),
  )
  const [requestBodyText, setRequestBodyText] = useState(() => initialBodyText(API_CATALOG[0]))

  const [pathErrors, setPathErrors] = useState<string[]>([])
  const [bodyError, setBodyError] = useState<string | null>(null)
  const [executing, setExecuting] = useState(false)
  const [responseResult, setResponseResult] = useState<PlaygroundResponse | null>(null)

  function selectEndpoint(spec: EndpointSpec) {
    setSelectedEndpoint(spec)
    setPathParamValues(initialPathValues(spec))
    setQueryParamValues(initialQueryValues(spec))
    setRequestBodyText(initialBodyText(spec))
    setPathErrors([])
    setBodyError(null)
    setResponseResult(null)
  }

  function resetBodyToDefault() {
    setRequestBodyText(initialBodyText(selectedEndpoint))
    setBodyError(null)
  }

  const resolvedPath = useMemo(
    () => buildResolvedPath(selectedEndpoint, pathParamValues, queryParamValues),
    [selectedEndpoint, pathParamValues, queryParamValues],
  )

  const codeSnippet = useMemo(() => {
    const origin = typeof window !== 'undefined' ? window.location.origin : 'https://quicklink.to'
    return generateCodeSample({
      lang: langTab,
      method: selectedEndpoint.method,
      fullUrl: `${origin}${resolvedPath}`,
      apiKey,
      bodyText: requestBodyText,
      authHeader: authHeaderName(selectedEndpoint),
    })
  }, [langTab, selectedEndpoint, resolvedPath, apiKey, requestBodyText])

  async function copyText(text: string, successMessage: string) {
    const ok = await copyTextWithFallback(text, {
      writeClipboard:
        typeof navigator !== 'undefined' && navigator.clipboard
          ? (value) => navigator.clipboard.writeText(value)
          : undefined,
      legacyCopy: legacyTextareaCopy,
    })
    if (ok) toast.success(successMessage)
    else toast.error('Copy failed — select the text manually.')
  }

  async function executeRequest() {
    const paths = validatePathParams(selectedEndpoint, pathParamValues)
    setPathErrors(paths.missing)

    const body = validateJsonBody(requestBodyText, false)
    setBodyError(body.ok ? null : (body.error ?? null))

    if (!paths.ok || !body.ok) {
      toast.error(
        !paths.ok
          ? `Missing path parameter: ${paths.missing.join(', ')}`
          : (body.error ?? 'Invalid request body.'),
      )
      return
    }

    setExecuting(true)
    setResponseResult(null)
    const startTime = performance.now()
    try {
      const sendsBody = methodHasBody(selectedEndpoint.method) && requestBodyText.trim().length > 0
      const init: RequestInit = {
        method: selectedEndpoint.method,
        headers: buildAuthHeaders(selectedEndpoint, apiKey, { includeContentType: sendsBody }),
      }
      if (sendsBody) init.body = requestBodyText

      const res = await fetch(resolvedPath, init)
      const latencyMs = Math.round(performance.now() - startTime)

      const headerMap: Record<string, string> = {}
      res.headers.forEach((value, key) => {
        headerMap[key] = value
      })

      const data: unknown = await res.json().catch(() => null)

      setResponseResult({ status: res.status, statusText: res.statusText, latencyMs, data, headers: headerMap })

      if (res.ok) {
        toast.success(`HTTP ${res.status} ${res.statusText} (${latencyMs}ms)`)
      } else {
        toast.error(`HTTP ${res.status}: ${getResponseErrorMessage(data, res.statusText)}`)
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Network request failed')
    } finally {
      setExecuting(false)
    }
  }

  return {
    selectedEndpoint,
    selectEndpoint,
    apiKey,
    setApiKey,
    apiKeyVisible,
    setApiKeyVisible,
    langTab,
    setLangTab,
    pathParamValues,
    setPathParamValues,
    queryParamValues,
    setQueryParamValues,
    requestBodyText,
    setRequestBodyText,
    resetBodyToDefault,
    pathErrors,
    bodyError,
    executing,
    responseResult,
    resolvedPath,
    codeSnippet,
    copyText,
    executeRequest,
  }
}

export type ApiPlayground = ReturnType<typeof useApiPlayground>
