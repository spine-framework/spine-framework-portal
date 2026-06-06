#!/usr/bin/env deno run --allow-read --allow-write

import { walk } from 'https://deno.land/std@0.168.0/fs/mod.ts'
import { readAll } from 'https://deno.land/std@0.168.0/streams/mod.ts'

interface ChunkMetadata {
  chunk_id: string
  file_path: string
  line_start: number
  line_end: number
  chunk_type: 'function' | 'class' | 'interface' | 'config' | 'object'
  purpose: string
  hash: string
  dependencies: string[]
  dependents: string[]
  source: {
    source_type: 'core'
    ref: string
    line_start: number
    line_end: number
  }
}

interface ParsedChunk {
  identifier: string
  chunk_id: string
  version: string
  hash: string
  macro: string
  micro: string
  inputs: Record<string, string>
  outputs: string
  depends_on: string[]
  depended_by: string[]
  side_effects: string[]
  tags: string[]
  code: string
  metadata: ChunkMetadata
}

class KBChunkParser {
  private chunks: ParsedChunk[] = []
  private currentChunk: Partial<ParsedChunk> = {}
  private inChunk = false
  private currentFile = ''
  private currentLine = 0

  async parseDirectory(dirPath: string): Promise<ParsedChunk[]> {
    this.chunks = []
    
    for await (const entry of walk(dirPath, {
      includeDirs: false,
      exts: ['.ts', '.tsx', '.js', '.jsx'],
      skip: [/node_modules/, /\.git/, /dist/, /src\/v2-assembled/]
    })) {
      if (entry.isFile) {
        await this.parseFile(entry.path)
      }
    }
    
    return this.chunks
  }

  async parseFile(filePath: string): Promise<void> {
    this.currentFile = filePath
    this.currentLine = 0
    this.inChunk = false
    this.currentChunk = {}

    try {
      const content = await Deno.readTextFile(filePath)
      const lines = content.split('\n')
      
      for (let i = 0; i < lines.length; i++) {
        this.currentLine = i + 1
        const line = lines[i]
        
        if (line.includes('CHUNK_START:')) {
          this.handleChunkStart(line)
        } else if (line.includes('CHUNK_END:')) {
          this.handleChunkEnd()
        } else if (this.inChunk && this.currentChunk.code !== undefined) {
          this.currentChunk.code += line + '\n'
        }
      }
    } catch (error) {
      console.error(`Error parsing file ${filePath}:`, error.message)
    }
  }

  private handleChunkStart(line: string): void {
    const match = line.match(/CHUNK_START:\s*(.+?)\s*─/)
    if (!match) {
      console.warn(`Invalid CHUNK_START format at line ${this.currentLine}: ${line}`)
      return
    }

    const identifier = match[1].trim()
    this.inChunk = true
    this.currentChunk = {
      identifier,
      code: '',
      metadata: {
        chunk_id: '',
        file_path: this.currentFile,
        line_start: this.currentLine,
        line_end: 0,
        chunk_type: 'function',
        purpose: '',
        hash: '',
        dependencies: [],
        dependents: [],
        source: {
          source_type: 'core',
          ref: this.currentFile,
          line_start: this.currentLine,
          line_end: 0
        }
      }
    }
  }

  private handleChunkEnd(): void {
    if (!this.inChunk) {
      console.warn(`CHUNK_END without CHUNK_START at line ${this.currentLine}`)
      return
    }

    const match = this.currentChunk.code?.match(/@chunk-id\s+(.+)/)
    if (!match) {
      console.warn(`Missing @chunk-id in chunk ${this.currentChunk.identifier}`)
      this.inChunk = false
      return
    }

    const chunkId = match[1].trim()
    const hash = this.generateHash(this.currentChunk.code || '')
    
    // Parse JSDoc-style comments
    const parsed = this.parseChunkDoc(this.currentChunk.code || '')
    
    const chunk: ParsedChunk = {
      identifier: this.currentChunk.identifier!,
      chunk_id: chunkId,
      version: '1.0.0',
      hash,
      macro: parsed.macro || '',
      micro: parsed.micro || '',
      inputs: parsed.inputs || {},
      outputs: parsed.outputs || '',
      depends_on: parsed.depends_on || [],
      depended_by: parsed.depended_by || [],
      side_effects: parsed.side_effects || [],
      tags: parsed.tags || [],
      code: (this.currentChunk.code || '').trim(),
      metadata: {
        ...this.currentChunk.metadata!,
        chunk_id: chunkId,
        hash,
        line_end: this.currentLine,
        source: {
          ...this.currentChunk.metadata!.source,
          line_end: this.currentLine
        }
      }
    }

    this.chunks.push(chunk)
    this.inChunk = false
    this.currentChunk = {}
  }

  private parseChunkDoc(code: string): any {
    const doc: any = {}
    
    // Extract @chunk-id
    const chunkIdMatch = code.match(/@chunk-id\s+(.+)/)
    if (chunkIdMatch) {
      doc.chunk_id = chunkIdMatch[1].trim()
    }

    // Extract @version
    const versionMatch = code.match(/@version\s+(.+)/)
    if (versionMatch) {
      doc.version = versionMatch[1].trim()
    }

    // Extract @hash
    const hashMatch = code.match(/@hash\s+(.+)/)
    if (hashMatch) {
      doc.hash = hashMatch[1].trim()
    }

    // Extract @macro
    const macroMatch = code.match(/@macro\s+(.+)/)
    if (macroMatch) {
      doc.macro = macroMatch[1].trim()
    }

    // Extract @micro
    const microMatch = code.match(/@micro\s+(.+)/)
    if (microMatch) {
      doc.micro = microMatch[1].trim()
    }

    // Extract @inputs
    const inputsMatch = code.match(/@inputs\s+(.+)/)
    if (inputsMatch) {
      doc.inputs = this.parseKeyValuePairs(inputsMatch[1].trim())
    }

    // Extract @outputs
    const outputsMatch = code.match(/@outputs\s+(.+)/)
    if (outputsMatch) {
      doc.outputs = outputsMatch[1].trim()
    }

    // Extract @depends-on
    const dependsOnMatch = code.match(/@depends-on\s+(.+)/)
    if (dependsOnMatch) {
      doc.depends_on = this.parseList(dependsOnMatch[1].trim())
    }

    // Extract @depended-by
    const dependedByMatch = code.match(/@depended-by\s+(.+)/)
    if (dependedByMatch) {
      doc.depended_by = this.parseList(dependedByMatch[1].trim())
    }

    // Extract @side-effects
    const sideEffectsMatch = code.match(/@side-effects\s+(.+)/)
    if (sideEffectsMatch) {
      doc.side_effects = this.parseList(sideEffectsMatch[1].trim())
    }

    // Extract @tags
    const tagsMatch = code.match(/@tags\s+(.+)/)
    if (tagsMatch) {
      doc.tags = this.parseList(tagsMatch[1].trim())
    }

    return doc
  }

  private parseKeyValuePairs(str: string): Record<string, string> {
    const pairs: Record<string, string> = {}
    const regex = /(\w+):\s*([^,]+)(?:,\s*|$)/g
    let match
    
    while ((match = regex.exec(str)) !== null) {
      pairs[match[1]] = match[2].trim()
    }
    
    return pairs
  }

  private parseList(str: string): string[] {
    return str.split(',').map(s => s.trim()).filter(Boolean)
  }

  private generateHash(content: string): string {
    // Simple hash function for demonstration
    // In production, use crypto.subtle.digest
    let hash = 0
    for (let i = 0; i < content.length; i++) {
      const char = content.charCodeAt(i)
      hash = ((hash << 5) - hash) + char
      hash = hash & hash // Convert to 32-bit integer
    }
    return Math.abs(hash).toString(16)
  }

  async saveChunks(outputFile: string): Promise<void> {
    const output = {
      generated_at: new Date().toISOString(),
      total_chunks: this.chunks.length,
      chunks: this.chunks
    }
    
    await Deno.writeTextFile(outputFile, JSON.stringify(output, null, 2))
    console.log(`Saved ${this.chunks.length} chunks to ${outputFile}`)
  }
}

// CLI usage
async function main() {
  const args = Deno.args
  
  if (args.length < 2) {
    console.log('Usage: deno run --allow-read --allow-write kb-chunk-parser.ts <source-dir> <output-file>')
    console.log('Example: deno run --allow-read --allow-write kb-chunk-parser.ts v2-core/src chunks.json')
    Deno.exit(1)
  }

  const [sourceDir, outputFile] = args
  
  if (!await Deno.stat(sourceDir).catch(() => false)) {
    console.error(`Source directory not found: ${sourceDir}`)
    Deno.exit(1)
  }

  const parser = new KBChunkParser()
  
  try {
    console.log(`Parsing chunks from ${sourceDir}...`)
    const chunks = await parser.parseDirectory(sourceDir)
    
    console.log(`Found ${chunks.length} chunks`)
    
    await parser.saveChunks(outputFile)
    
    // Display summary
    console.log('\nSummary:')
    console.log(`- Functions: ${chunks.filter(c => c.metadata.chunk_type === 'function').length}`)
    console.log(`- Classes: ${chunks.filter(c => c.metadata.chunk_type === 'class').length}`)
    console.log(`- Interfaces: ${chunks.filter(c => c.metadata.chunk_type === 'interface').length}`)
    console.log(`- Configs: ${chunks.filter(c => c.metadata.chunk_type === 'config').length}`)
    console.log(`- Objects: ${chunks.filter(c => c.metadata.chunk_type === 'object').length}`)
    
  } catch (error) {
    console.error('Error:', error.message)
    Deno.exit(1)
  }
}

if (import.meta.main) {
  await main()
}

export { KBChunkParser, ParsedChunk }
