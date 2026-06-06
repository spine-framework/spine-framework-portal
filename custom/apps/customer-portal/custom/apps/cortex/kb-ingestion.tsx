import React, { useState } from 'react'
import { useApi } from '../../../v2-core/src/hooks/useApi'
import { Button } from '../../../v2-core/src/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../../v2-core/src/components/ui/card'
import { Progress } from '../../../v2-core/src/components/ui/progress'
import { Alert, AlertDescription } from '../../../v2-core/src/components/ui/alert'
import { Badge } from '../../../v2-core/src/components/ui/badge'

interface IngestionResponse {
  success: boolean
  items_created: number
  items_updated: number
  embeddings_generated: number
  errors: string[]
  skipped: string[]
}

interface IngestionStats {
  total: number
  processed: number
  created: number
  updated: number
  errors: number
}

export default function KBIngestion() {
  const [isIngesting, setIsIngesting] = useState(false)
  const [stats, setStats] = useState<IngestionStats | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [logs, setLogs] = useState<string[]>([])
  const apiFetch = useApi()

  const addLog = (message: string) => {
    const timestamp = new Date().toLocaleTimeString()
    setLogs(prev => [...prev, `[${timestamp}] ${message}`])
  }

  const loadChunks = async (): Promise<any[]> => {
    try {
      const response = await fetch('/chunks.json')
      if (!response.ok) {
        throw new Error('Failed to load chunks file')
      }
      const data = await response.json()
      return data.chunks || []
    } catch (err) {
      throw new Error(`Could not load chunks: ${err instanceof Error ? err.message : 'Unknown error'}`)
    }
  }

  const ingestBatch = async (chunks: any[], batchSize = 10): Promise<IngestionResponse> => {
    const response = await apiFetch('/.netlify/functions/custom_kb-ingestion', {
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
      throw new Error(`Batch failed: ${errorData.error || response.statusText}`)
    }

    return await response.json()
  }

  const startIngestion = async () => {
    setIsIngesting(true)
    setError(null)
    setStats(null)
    setLogs([])

    try {
      addLog('Loading chunks from file...')
      const chunks = await loadChunks()
      addLog(`Loaded ${chunks.length} chunks`)

      if (chunks.length === 0) {
        throw new Error('No chunks found to ingest')
      }

      const results: IngestionStats = {
        total: chunks.length,
        processed: 0,
        created: 0,
        updated: 0,
        errors: 0
      }

      const batchSize = 10
      const totalBatches = Math.ceil(chunks.length / batchSize)

      for (let i = 0; i < chunks.length; i += batchSize) {
        const batch = chunks.slice(i, i + batchSize)
        const batchNum = Math.floor(i / batchSize) + 1

        addLog(`Processing batch ${batchNum}/${totalBatches} (${batch.length} chunks)...`)

        try {
          const response = await ingestBatch(batch)
          
          results.processed += batch.length
          results.created += response.items_created || 0
          results.updated += response.items_updated || 0

          if (response.errors && response.errors.length > 0) {
            results.errors += response.errors.length
            addLog(`Batch ${batchNum} had ${response.errors.length} errors`)
          }

          if (response.skipped && response.skipped.length > 0) {
            addLog(`Batch ${batchNum} skipped ${response.skipped.length} chunks`)
          }

          addLog(`Batch ${batchNum} complete: ${response.items_created || 0} created, ${response.items_updated || 0} updated`)

          // Update progress
          setStats({ ...results })
          
          // Small delay to prevent overwhelming the server
          await new Promise(resolve => setTimeout(resolve, 500))

        } catch (batchError) {
          results.errors += batch.length
          addLog(`Batch ${batchNum} failed: ${batchError instanceof Error ? batchError.message : 'Unknown error'}`)
        }
      }

      addLog(`Ingestion complete! Created: ${results.created}, Updated: ${results.updated}, Errors: ${results.errors}`)
      setStats(results)

    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error occurred'
      setError(errorMessage)
      addLog(`ERROR: ${errorMessage}`)
    } finally {
      setIsIngesting(false)
    }
  }

  const progress = stats ? (stats.processed / stats.total) * 100 : 0

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>KB Code Chunk Ingestion</CardTitle>
          <CardDescription>
            Ingest parsed code chunks from v2-core functions into the Knowledge Base system.
            This creates KB articles and embeddings for each code chunk.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-4">
            <Button 
              onClick={startIngestion} 
              disabled={isIngesting}
              size="lg"
            >
              {isIngesting ? 'Ingesting...' : 'Start Ingestion'}
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
          </div>

          {isIngesting && (
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span>Progress</span>
                <span>{stats ? `${stats.processed}/${stats.total}` : 'Starting...'}</span>
              </div>
              <Progress value={progress} className="w-full" />
            </div>
          )}

          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {logs.length > 0 && (
            <div className="space-y-2">
              <h4 className="font-medium">Activity Log</h4>
              <div className="bg-gray-50 dark:bg-gray-900 p-4 rounded-lg max-h-64 overflow-y-auto">
                <pre className="text-xs font-mono whitespace-pre-wrap">
                  {logs.join('\n')}
                </pre>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
