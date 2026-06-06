import { useState } from 'react'
import { apiFetch } from '@core/lib/api'
import { Button } from '@core/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@core/components/ui/card'
import { Progress } from '@core/components/ui/progress'
import { Alert, AlertDescription } from '@core/components/ui/alert'
import { Badge } from '@core/components/ui/badge'
import { ScrollArea } from '@core/components/ui/scroll-area'

interface IngestionResponse {
  success: boolean
  items_created: number
  items_updated: number
  embeddings_generated: number
  errors: string[]
  skipped: string[]
  item_ids?: string[]
}

interface IngestionStats {
  total: number
  processed: number
  created: number
  updated: number
  errors: number
}

type Step = 'idle' | 'chunks_loaded' | 'ingestion_complete' | 'embeddings_complete'

export default function KBIngestionPage() {
  const [currentStep, setCurrentStep] = useState<Step>('idle')
  const [isLoading, setIsLoading] = useState(false)
  const [chunks, setChunks] = useState<any[]>([])
  const [stats, setStats] = useState<IngestionStats | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [logs, setLogs] = useState<string[]>([])
  const [ingestFrom, setIngestFrom] = useState<string>('')
  const [ingestTo, setIngestTo] = useState<string>('')
  const [ingestedItemIds, setIngestedItemIds] = useState<string[]>([])

  const addLog = (message: string) => {
    const timestamp = new Date().toLocaleTimeString()
    setLogs(prev => [...prev, `[${timestamp}] ${message}`])
  }

  const loadChunks = async (): Promise<any[]> => {
    try {
      const response = await apiFetch('/.netlify/functions/custom_cortex-chunks', {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        }
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Unknown error' }))
        throw new Error(`Failed to load chunks: ${errorData.error || response.statusText}`)
      }

      const data = await response.json()
      return data.data?.chunks || []
    } catch (err) {
      throw new Error(`Could not load chunks: ${err instanceof Error ? err.message : 'Unknown error'}`)
    }
  }

  const ingestChunks = async (chunks: any[]): Promise<IngestionResponse> => {
    const response = await apiFetch('/api/custom_kb-ingestion?action=ingest', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        chunks,
        force_update: false
      })
    })

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ error: 'Unknown error' }))
      throw new Error(`Ingestion failed: ${errorData.error || response.statusText}`)
    }

    const json = await response.json()
    return json.data ?? json
  }

  const generateEmbeddings = async (itemIds: string[]): Promise<IngestionResponse> => {
    const response = await apiFetch('/api/custom_kb-embeddings?action=generate', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        item_ids: itemIds,
        vector_types: ['semantic', 'structure'],
        force_regenerate: false
      })
    })

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ error: 'Unknown error' }))
      throw new Error(`Embedding generation failed: ${errorData.error || response.statusText}`)
    }

    const json = await response.json()
    return json.data ?? json
  }

  const handleLoadChunks = async () => {
    setIsLoading(true)
    setError(null)
    setLogs([])

    try {
      addLog('Loading chunks from file...')
      const loadedChunks = await loadChunks()
      addLog(`Loaded ${loadedChunks.length} chunks`)
      setChunks(loadedChunks)
      setCurrentStep('chunks_loaded')
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error'
      setError(errorMessage)
      addLog(`Error: ${errorMessage}`)
    } finally {
      setIsLoading(false)
    }
  }

  const handleIngestChunks = async () => {
    setIsLoading(true)
    setError(null)
    setLogs([])

    try {
      // Parse range inputs
      const from = parseInt(ingestFrom) || 1
      const to = parseInt(ingestTo) || chunks.length
      
      // Validate range
      if (from < 1 || to < 1 || from > to || from > chunks.length || to > chunks.length) {
        throw new Error(`Invalid range: Please enter values between 1 and ${chunks.length}, with from ≤ to`)
      }
      
      // Get the subset of chunks (convert to 0-based index)
      const selectedChunks = chunks.slice(from - 1, to)
      const recordCount = selectedChunks.length
      
      addLog(`Starting ingestion of records ${from} through ${to} (${recordCount} records)...`)
      const response = await ingestChunks(selectedChunks)
      
      const newStats: IngestionStats = {
        total: recordCount,
        processed: recordCount,
        created: response.items_created || 0,
        updated: response.items_updated || 0,
        errors: response.errors?.length || 0
      }
      
      setStats(newStats)
      setIngestedItemIds(response.item_ids || [])
      addLog(`Ingestion complete: ${response.items_created || 0} created, ${response.items_updated || 0} updated`)
      addLog(`Captured ${(response.item_ids || []).length} item IDs for embedding generation`)
      
      if (response.errors && response.errors.length > 0) {
        addLog(`Errors: ${response.errors.join(', ')}`)
      }
      
      setCurrentStep('ingestion_complete')
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error'
      setError(errorMessage)
      addLog(`Error: ${errorMessage}`)
    } finally {
      setIsLoading(false)
    }
  }

  const handleGenerateEmbeddings = async () => {
    setIsLoading(true)
    setError(null)
    setLogs([])

    try {
      addLog('Generating embeddings for ingested items...')
      const itemIds = ingestedItemIds
      if (itemIds.length === 0) {
        throw new Error('No item IDs available — run ingestion first')
      }
      addLog(`Generating embeddings for ${itemIds.length} items...`)
      const response = await generateEmbeddings(itemIds)
      
      addLog(`Embeddings complete: ${(response as any).embeddings_created || response.embeddings_generated || 0} generated`)
      setCurrentStep('embeddings_complete')
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error'
      setError(errorMessage)
      addLog(`Error: ${errorMessage}`)
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>KB Code Chunk Ingestion</CardTitle>
          <CardDescription>
            Step-by-step ingestion of parsed code chunks from v2-core functions into the Knowledge Base system.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Step 1: Load Chunks */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Step 1: Load Chunk Data</CardTitle>
              <CardDescription>
                Load parsed code chunks from the chunks.json file
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <Button 
                onClick={handleLoadChunks}
                disabled={isLoading}
                size="lg"
              >
                {isLoading ? 'Loading...' : currentStep === 'idle' ? 'Load Chunk Data' : 'Reload Chunk Data'}
              </Button>
              
              {currentStep !== 'idle' && (
                <div className="space-y-2">
                  <Badge variant="outline">
                    Chunks Loaded: {chunks.length}
                  </Badge>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Step 2: Display Chunks */}
          {currentStep !== 'idle' && chunks.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Chunk Data Preview</CardTitle>
                <CardDescription>
                  {chunks.length} chunks loaded from file
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ScrollArea className="h-64 w-full border rounded-md p-4">
                  <div className="space-y-2">
                    {chunks.slice(0, 10).map((chunk, index) => (
                      <div key={index} className="text-sm border-b pb-2">
                        <div className="font-medium">{chunk.identifier}</div>
                        <div className="text-gray-600">{chunk.macro}: {chunk.micro}</div>
                        <div className="text-xs text-gray-500">
                          {chunk.chunk_id} • {chunk.version}
                        </div>
                      </div>
                    ))}
                    {chunks.length > 10 && (
                      <div className="text-sm text-gray-500 italic">
                        ... and {chunks.length - 10} more chunks
                      </div>
                    )}
                  </div>
                </ScrollArea>
              </CardContent>
            </Card>
          )}

          {/* Step 3: Ingest Chunks */}
          {currentStep === 'chunks_loaded' && (
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Step 2: Ingest Chunks</CardTitle>
                <CardDescription>
                  Create KB articles from the loaded chunks
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center gap-4">
                  <div className="flex items-center gap-2">
                    <label htmlFor="ingest-from" className="text-sm font-medium">Ingest records</label>
                    <input
                      id="ingest-from"
                      type="number"
                      min="1"
                      max={chunks.length}
                      value={ingestFrom}
                      onChange={(e) => setIngestFrom(e.target.value)}
                      placeholder="1"
                      className="w-20 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                    <span className="text-sm font-medium">through</span>
                    <input
                      id="ingest-to"
                      type="number"
                      min="1"
                      max={chunks.length}
                      value={ingestTo}
                      onChange={(e) => setIngestTo(e.target.value)}
                      placeholder={chunks.length.toString()}
                      className="w-20 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  
                  <div className="text-sm text-gray-600">
                    ({(() => {
                      const from = parseInt(ingestFrom) || 1
                      const to = parseInt(ingestTo) || chunks.length
                      const count = from > 0 && to > 0 && from <= to && to <= chunks.length 
                        ? to - from + 1 
                        : 0
                      return count > 0 ? `${count} records` : 'Invalid range'
                    })()})
                  </div>
                </div>
                
                <Button 
                  onClick={handleIngestChunks}
                  disabled={isLoading || !ingestFrom || !ingestTo}
                  size="lg"
                  variant="default"
                >
                  {isLoading ? 'Ingesting...' : `Ingest ${(() => {
                    const from = parseInt(ingestFrom) || 1
                    const to = parseInt(ingestTo) || chunks.length
                    const count = from > 0 && to > 0 && from <= to && to <= chunks.length 
                      ? to - from + 1 
                      : 0
                    return count
                  })()} Records`}
                </Button>
                
                {stats && (
                  <div className="flex gap-2">
                    <Badge variant="outline">
                      Total: {stats.total}
                    </Badge>
                    <Badge variant="outline">
                      Created: {stats.created}
                    </Badge>
                    <Badge variant="outline">
                      Updated: {stats.updated}
                    </Badge>
                    {stats.errors > 0 && (
                      <Badge variant="destructive">
                        Errors: {stats.errors}
                      </Badge>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Step 4: Generate Embeddings */}
          {currentStep === 'ingestion_complete' && stats && stats.created > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Step 3: Generate Embeddings</CardTitle>
                <CardDescription>
                  Generate vector embeddings for the {stats.created} created KB articles
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <Button 
                  onClick={handleGenerateEmbeddings}
                  disabled={isLoading}
                  size="lg"
                  variant="default"
                >
                  {isLoading ? 'Generating...' : 'Generate Embeddings'}
                </Button>
              </CardContent>
            </Card>
          )}

          {/* Error Display */}
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {/* Activity Log */}
          {logs.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Activity Log</CardTitle>
              </CardHeader>
              <CardContent>
                <ScrollArea className="h-64 w-full">
                  <div className="bg-gray-50 dark:bg-gray-900 p-4 rounded-lg">
                    <pre className="text-xs font-mono whitespace-pre-wrap">
                      {logs.join('\n')}
                    </pre>
                  </div>
                </ScrollArea>
              </CardContent>
            </Card>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
