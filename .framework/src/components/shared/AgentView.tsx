/**
 * @component AgentView
 * @audience installer
 * @layer component
 * @stability stable
 *
 * Agent View toggle component for exposing raw API data and code examples.
 * Provides agents (and developers) with:
 * - Raw JSON of current record/page data
 * - Copy-pasteable API calls (curl/fetch)
 * - Equivalent CLI commands
 *
 * **Usage:**
 * ```tsx
 * <AgentView
 *   data={recordData}
 *   endpoint="/.netlify/functions/items"
 *   method="GET"
 *   query={{ id: recordId }}
 * />
 * ```
 *
 * **Features:**
 * - Collapsible panel (closed by default)
 * - Copy to clipboard buttons
 * - Syntax highlighting for JSON
 * - Responsive layout
 *
 * @seeAlso hooks/useApi.ts (API call logging)
 * @seeAlso pages/admin/* (admin pages using this component)
 */

import React, { useState, useEffect } from 'react'
import { Code, Terminal, Copy, Check, ChevronDown, ChevronUp } from 'lucide-react'

interface AgentViewProps {
  /** The raw data object to display */
  data: any
  /** API endpoint path */
  endpoint: string
  /** HTTP method */
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE'
  /** Query parameters used */
  query?: Record<string, any>
  /** Request body (for POST/PATCH) */
  body?: any
  /** Optional title override */
  title?: string
}

export function AgentView({
  data,
  endpoint,
  method = 'GET',
  query,
  body,
  title = 'Agent View'
}: AgentViewProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [copied, setCopied] = useState<string | null>(null)

  // Build API URL
  const baseUrl = window.location.origin
  const fullUrl = `${baseUrl}${endpoint}${query ? '?' + new URLSearchParams(query).toString() : ''}`

  // Generate curl command
  const curlCmd = `curl -X ${method} \\
  ${method !== 'GET' ? `-H "Content-Type: application/json" \\
  ` : ''}${baseUrl}${endpoint}${query ? '?' + new URLSearchParams(query).toString() : ''}${method !== 'GET' && body ? ` \\
  -d '${JSON.stringify(body, null, 2)}'` : ''}`

  // Generate fetch code
  const fetchCode = `fetch('${baseUrl}${endpoint}${query ? '?' + new URLSearchParams(query).toString() : ''}', {
  method: '${method}',${method !== 'GET' ? `
  headers: { 'Content-Type': 'application/json' },` : ''}${method !== 'GET' && body ? `
  body: JSON.stringify(${JSON.stringify(body, null, 2).replace(/\n/g, '\n  ')})` : ''}
})
  .then(r => r.json())
  .then(data => console.log(data))`

  // Generate CLI command
  const cliCmd = `spine ${endpoint.replace('/.netlify/functions/', '').replace(/\//g, ' ')} ${query?.id || query?.slug || ''}${method === 'POST' && body ? ` --data '${JSON.stringify(body)}'` : ''}${method === 'PATCH' && body ? ` --update '${JSON.stringify(body)}'` : ''}${method === 'DELETE' ? ' --delete' : ''}`

  const handleCopy = (text: string, key: string) => {
    navigator.clipboard.writeText(text)
    setCopied(key)
    setTimeout(() => setCopied(null), 2000)
  }

  return (
    <div className="mt-6 border border-gray-200 rounded-lg bg-gray-50">
      {/* Header */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-gray-100 transition-colors"
      >
        <div className="flex items-center gap-2">
          <Terminal className="w-4 h-4 text-gray-600" />
          <span className="font-medium text-gray-700">{title}</span>
          <span className="text-xs text-gray-500">(for agents & developers)</span>
        </div>
        {isOpen ? (
          <ChevronUp className="w-4 h-4 text-gray-500" />
        ) : (
          <ChevronDown className="w-4 h-4 text-gray-500" />
        )}
      </button>

      {/* Content */}
      {isOpen && (
        <div className="border-t border-gray-200">
          {/* API Info */}
          <div className="px-4 py-3 bg-blue-50 border-b border-blue-100">
            <div className="flex items-center gap-2 text-sm text-blue-800">
              <span className="font-mono font-bold">{method}</span>
              <span className="font-mono">{endpoint}</span>
              {query && (
                <span className="text-blue-600">
                  with query: {JSON.stringify(query)}
                </span>
              )}
            </div>
          </div>

          <div className="p-4 space-y-4">
            {/* Raw JSON */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2 text-sm font-medium text-gray-700">
                  <Code className="w-4 h-4" />
                  Response JSON
                </div>
                <button
                  onClick={() => handleCopy(JSON.stringify(data, null, 2), 'json')}
                  className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700"
                >
                  {copied === 'json' ? (
                    <Check className="w-3 h-3" />
                  ) : (
                    <Copy className="w-3 h-3" />
                  )}
                  {copied === 'json' ? 'Copied!' : 'Copy'}
                </button>
              </div>
              <pre className="bg-gray-900 text-gray-100 p-3 rounded text-xs overflow-auto max-h-64 font-mono">
                {JSON.stringify(data, null, 2)}
              </pre>
            </div>

            {/* Code Examples */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {/* cURL */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <div className="text-sm font-medium text-gray-700">cURL</div>
                  <button
                    onClick={() => handleCopy(curlCmd, 'curl')}
                    className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700"
                  >
                    {copied === 'curl' ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                    {copied === 'curl' ? 'Copied!' : 'Copy'}
                  </button>
                </div>
                <pre className="bg-gray-800 text-gray-100 p-3 rounded text-xs overflow-auto max-h-32 font-mono">
                  {curlCmd}
                </pre>
              </div>

              {/* Fetch */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <div className="text-sm font-medium text-gray-700">JavaScript Fetch</div>
                  <button
                    onClick={() => handleCopy(fetchCode, 'fetch')}
                    className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700"
                  >
                    {copied === 'fetch' ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                    {copied === 'fetch' ? 'Copied!' : 'Copy'}
                  </button>
                </div>
                <pre className="bg-gray-800 text-gray-100 p-3 rounded text-xs overflow-auto max-h-32 font-mono">
                  {fetchCode}
                </pre>
              </div>
            </div>

            {/* CLI Command */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2 text-sm font-medium text-gray-700">
                  <Terminal className="w-4 h-4" />
                  Spine CLI
                </div>
                <button
                  onClick={() => handleCopy(cliCmd, 'cli')}
                  className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700"
                >
                  {copied === 'cli' ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                  {copied === 'cli' ? 'Copied!' : 'Copy'}
                </button>
              </div>
              <pre className="bg-green-900 text-green-100 p-3 rounded text-xs overflow-auto font-mono">
                {cliCmd}
              </pre>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default AgentView
