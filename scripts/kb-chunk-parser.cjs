#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

class KBChunkParser {
  constructor() {
    this.chunks = [];
    this.currentChunk = {};
    this.inChunk = false;
    this.currentFile = '';
    this.currentLine = 0;
  }

  async parseDirectory(dirPath) {
    this.chunks = [];
    
    const walkDir = (dir, fileList = []) => {
      const files = fs.readdirSync(dir);
      
      for (const file of files) {
        const filePath = path.join(dir, file);
        const stat = fs.statSync(filePath);
        
        if (stat.isDirectory()) {
          // Skip certain directories
          if (!['node_modules', '.git', 'dist', 'src/v2-assembled'].includes(file)) {
            walkDir(filePath, fileList);
          }
        } else if (file.match(/\.(ts|js|tsx|jsx)$/)) {
          fileList.push(filePath);
        }
      }
      
      return fileList;
    };
    
    const files = walkDir(dirPath);
    
    for (const filePath of files) {
      await this.parseFile(filePath);
    }
    
    return this.chunks;
  }

  async parseFile(filePath) {
    this.currentFile = filePath;
    this.currentLine = 0;
    this.inChunk = false;
    this.currentChunk = {};

    try {
      const content = fs.readFileSync(filePath, 'utf8');
      const lines = content.split('\n');
      
      for (let i = 0; i < lines.length; i++) {
        this.currentLine = i + 1;
        const line = lines[i];
        
        if (line.includes('CHUNK_START:')) {
          this.handleChunkStart(line);
        } else if (line.includes('CHUNK_END:')) {
          this.handleChunkEnd();
        } else if (this.inChunk && this.currentChunk.code !== undefined) {
          this.currentChunk.code += line + '\n';
        }
      }
    } catch (error) {
      console.error(`Error parsing file ${filePath}:`, error.message);
    }
  }

  handleChunkStart(line) {
    const match = line.match(/CHUNK_START:\s*(.+?)\s*─/);
    if (!match) {
      console.warn(`Invalid CHUNK_START format at line ${this.currentLine}: ${line}`);
      return;
    }

    const identifier = match[1].trim();
    this.inChunk = true;
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
    };
  }

  handleChunkEnd() {
    if (!this.inChunk) {
      console.warn(`CHUNK_END without CHUNK_START at line ${this.currentLine}`);
      return;
    }

    const match = this.currentChunk.code?.match(/@chunk-id\s+(.+)/);
    if (!match) {
      console.warn(`Missing @chunk-id in chunk ${this.currentChunk.identifier}`);
      this.inChunk = false;
      return;
    }

    const chunkId = match[1].trim();
    const hash = this.generateHash(this.currentChunk.code || '');
    
    // Parse JSDoc-style comments
    const parsed = this.parseChunkDoc(this.currentChunk.code || '');
    
    const chunk = {
      identifier: this.currentChunk.identifier,
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
        ...this.currentChunk.metadata,
        chunk_id: chunkId,
        hash,
        line_end: this.currentLine,
        source: {
          ...this.currentChunk.metadata.source,
          line_end: this.currentLine
        }
      }
    };

    this.chunks.push(chunk);
    this.inChunk = false;
    this.currentChunk = {};
  }

  parseChunkDoc(code) {
    const doc = {};
    
    // Extract @chunk-id
    const chunkIdMatch = code.match(/@chunk-id\s+(.+)/);
    if (chunkIdMatch) {
      doc.chunk_id = chunkIdMatch[1].trim();
    }

    // Extract @version
    const versionMatch = code.match(/@version\s+(.+)/);
    if (versionMatch) {
      doc.version = versionMatch[1].trim();
    }

    // Extract @hash
    const hashMatch = code.match(/@hash\s+(.+)/);
    if (hashMatch) {
      doc.hash = hashMatch[1].trim();
    }

    // Extract @macro
    const macroMatch = code.match(/@macro\s+(.+)/);
    if (macroMatch) {
      doc.macro = macroMatch[1].trim();
    }

    // Extract @micro
    const microMatch = code.match(/@micro\s+(.+)/);
    if (microMatch) {
      doc.micro = microMatch[1].trim();
    }

    // Extract @inputs
    const inputsMatch = code.match(/@inputs\s+(.+)/);
    if (inputsMatch) {
      doc.inputs = this.parseKeyValuePairs(inputsMatch[1].trim());
    }

    // Extract @outputs
    const outputsMatch = code.match(/@outputs\s+(.+)/);
    if (outputsMatch) {
      doc.outputs = outputsMatch[1].trim();
    }

    // Extract @depends-on
    const dependsOnMatch = code.match(/@depends-on\s+(.+)/);
    if (dependsOnMatch) {
      doc.depends_on = this.parseList(dependsOnMatch[1].trim());
    }

    // Extract @depended-by
    const dependedByMatch = code.match(/@depended-by\s+(.+)/);
    if (dependedByMatch) {
      doc.depended_by = this.parseList(dependedByMatch[1].trim());
    }

    // Extract @side-effects
    const sideEffectsMatch = code.match(/@side-effects\s+(.+)/);
    if (sideEffectsMatch) {
      doc.side_effects = this.parseList(sideEffectsMatch[1].trim());
    }

    // Extract @tags
    const tagsMatch = code.match(/@tags\s+(.+)/);
    if (tagsMatch) {
      doc.tags = this.parseList(tagsMatch[1].trim());
    }

    return doc;
  }

  parseKeyValuePairs(str) {
    const pairs = {};
    const regex = /(\w+):\s*([^,]+)(?:,\s*|$)/g;
    let match;
    
    while ((match = regex.exec(str)) !== null) {
      pairs[match[1]] = match[2].trim();
    }
    
    return pairs;
  }

  parseList(str) {
    return str.split(',').map(s => s.trim()).filter(Boolean);
  }

  generateHash(content) {
    // Simple hash function for demonstration
    let hash = 0;
    for (let i = 0; i < content.length; i++) {
      const char = content.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash).toString(16);
  }

  async saveChunks(outputFile) {
    const output = {
      generated_at: new Date().toISOString(),
      total_chunks: this.chunks.length,
      chunks: this.chunks
    };
    
    fs.writeFileSync(outputFile, JSON.stringify(output, null, 2));
    console.log(`Saved ${this.chunks.length} chunks to ${outputFile}`);
  }
}

// CLI usage
async function main() {
  const args = process.argv.slice(2);
  
  if (args.length < 2) {
    console.log('Usage: node kb-chunk-parser.js <source-dir> <output-file>');
    console.log('Example: node kb-chunk-parser.js v2-core/functions chunks.json');
    process.exit(1);
  }

  const [sourceDir, outputFile] = args;
  
  if (!fs.existsSync(sourceDir)) {
    console.error(`Source directory not found: ${sourceDir}`);
    process.exit(1);
  }

  const parser = new KBChunkParser();
  
  try {
    console.log(`Parsing chunks from ${sourceDir}...`);
    const chunks = await parser.parseDirectory(sourceDir);
    
    console.log(`Found ${chunks.length} chunks`);
    
    await parser.saveChunks(outputFile);
    
    // Display summary
    console.log('\nSummary:');
    console.log(`- Functions: ${chunks.filter(c => c.metadata.chunk_type === 'function').length}`);
    console.log(`- Classes: ${chunks.filter(c => c.metadata.chunk_type === 'class').length}`);
    console.log(`- Interfaces: ${chunks.filter(c => c.metadata.chunk_type === 'interface').length}`);
    console.log(`- Configs: ${chunks.filter(c => c.metadata.chunk_type === 'config').length}`);
    console.log(`- Objects: ${chunks.filter(c => c.metadata.chunk_type === 'object').length}`);
    
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = { KBChunkParser };
