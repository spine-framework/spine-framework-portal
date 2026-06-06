import { createHandler } from './_shared/middleware'
import { adminDb } from './_shared/db'

export const handler = createHandler(async (ctx, body) => {
  const { action } = ctx.query || {}
  const method = ctx.query?.method || 'GET'

  switch (action) {
    case 'list':
      if (method === 'GET') {
        try {
          // Read chunks from the project root directory
          const fs = require('fs')
          const path = require('path')
          const chunksPath = path.join(process.cwd(), 'chunks.json')
          const fileContent = fs.readFileSync(chunksPath, 'utf8')
          const data = JSON.parse(fileContent)
          
          return {
            chunks: data.chunks || [],
            total: data.chunks?.length || 0,
            loaded_at: new Date().toISOString()
          }
        } catch (error) {
          throw new Error(`Failed to load chunks: ${error instanceof Error ? error.message : 'Unknown error'}`)
        }
      }
      break
    
    default:
      if (method === 'GET') {
        try {
          // Read chunks from the project root directory
          const fs = require('fs')
          const path = require('path')
          const chunksPath = path.join(process.cwd(), 'chunks.json')
          const fileContent = fs.readFileSync(chunksPath, 'utf8')
          const data = JSON.parse(fileContent)
          
          return {
            chunks: data.chunks || [],
            total: data.chunks?.length || 0,
            loaded_at: new Date().toISOString()
          }
        } catch (error) {
          throw new Error(`Failed to load chunks: ${error instanceof Error ? error.message : 'Unknown error'}`)
        }
      }
  }

  throw new Error('Invalid action or method')
})
