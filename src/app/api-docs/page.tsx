'use client'

import { useMemo } from 'react'
import { Toaster } from 'react-hot-toast'
import { API_CATALOG, groupCatalog } from '@/app/api-docs/components/apiCatalog'
import AuthSection from '@/app/api-docs/components/AuthSection'
import CodeSamples from '@/app/api-docs/components/CodeSamples'
import EndpointHeader from '@/app/api-docs/components/EndpointHeader'
import EndpointList from '@/app/api-docs/components/EndpointList'
import RequestBuilder from '@/app/api-docs/components/RequestBuilder'
import ResponseViewer from '@/app/api-docs/components/ResponseViewer'
import { useApiPlayground } from '@/app/api-docs/components/hooks/useApiPlayground'

export default function ApiDocsPage() {
  const playground = useApiPlayground()
  const groups = useMemo(() => groupCatalog(API_CATALOG), [])

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 pb-20">
      <Toaster position="top-right" />

      <AuthSection
        apiKey={playground.apiKey}
        apiKeyVisible={playground.apiKeyVisible}
        onApiKeyChange={playground.setApiKey}
        onToggleVisibility={() => playground.setApiKeyVisible(!playground.apiKeyVisible)}
      />

      <main className="mx-auto max-w-7xl px-6 py-8">
        <div className="grid gap-8 lg:grid-cols-[280px_1fr]">
          <EndpointList
            groups={groups}
            selectedId={playground.selectedEndpoint.id}
            onSelect={playground.selectEndpoint}
          />

          <div className="space-y-6">
            <EndpointHeader endpoint={playground.selectedEndpoint} />

            <RequestBuilder
              endpoint={playground.selectedEndpoint}
              resolvedPath={playground.resolvedPath}
              pathParamValues={playground.pathParamValues}
              queryParamValues={playground.queryParamValues}
              requestBodyText={playground.requestBodyText}
              pathErrors={playground.pathErrors}
              bodyError={playground.bodyError}
              executing={playground.executing}
              onPathParamChange={(name, value) =>
                playground.setPathParamValues({ ...playground.pathParamValues, [name]: value })
              }
              onQueryParamChange={(name, value) =>
                playground.setQueryParamValues({ ...playground.queryParamValues, [name]: value })
              }
              onBodyChange={playground.setRequestBodyText}
              onResetBody={playground.resetBodyToDefault}
              onExecute={() => void playground.executeRequest()}
            />

            <ResponseViewer
              result={playground.responseResult}
              onCopy={(text) => void playground.copyText(text, 'Response copied to clipboard')}
            />

            <CodeSamples
              snippet={playground.codeSnippet}
              langTab={playground.langTab}
              onTabChange={playground.setLangTab}
              onCopy={(text) => void playground.copyText(text, 'Code copied to clipboard')}
            />
          </div>
        </div>
      </main>
    </div>
  )
}
