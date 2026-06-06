#!/usr/bin/env node

const fs = require('fs');
const https = require('https');
const querystring = require('querystring');

// Configuration - use local Netlify Functions
const NETLIFY_URL = 'http://localhost:8888';
const SUPABASE_SERVICE_ROLE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InV5b2t1aWlienR3YXNkcHJzb3YiLCJyb2xlIjoic2VydmljZV9yb2xlIiwiaWF0IjoxNzM2MTY3Njk5LCJleHAiOjIwNTE3NDM2OTl9.qKqJv8N-IY9q8o_XJtq2o5s3RfD2W4x7J8L9q8o_XJt';

// Read chunks from file
function readChunks(filePath) {
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    const data = JSON.parse(content);
    return data.chunks || [];
  } catch (error) {
    console.error('Error reading chunks file:', error.message);
    process.exit(1);
  }
}

// Make HTTP request to local Netlify Function
function makeRequest(functionName, data) {
  return new Promise((resolve, reject) => {
    const postData = JSON.stringify(data);
    const url = `${NETLIFY_URL}/.netlify/functions/${functionName}`;
    
    console.log(`  🌐 Calling: ${url}`);
    console.log(`  📦 Data size: ${postData.length} bytes`);

    const options = {
      hostname: 'localhost',
      port: 8888,
      path: `/.netlify/functions/${functionName}`,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        'Content-Length': Buffer.byteLength(postData)
      }
    };

    const req = require('http').request(options, (res) => {
      let responseData = '';
      
      res.on('data', (chunk) => {
        responseData += chunk;
      });
      
      res.on('end', () => {
        console.log(`  📡 Response status: ${res.statusCode}`);
        console.log(`  📄 Response body: ${responseData.substring(0, 200)}${responseData.length > 200 ? '...' : ''}`);
        
        try {
          const parsed = JSON.parse(responseData);
          resolve({ status: res.statusCode, data: parsed });
        } catch (error) {
          resolve({ status: res.statusCode, data: responseData });
        }
      });
    });

    req.on('error', (error) => {
      console.log(`  ❌ Request error: ${error.message}`);
      reject(error);
    });

    req.write(postData);
    req.end();
  });
}

// Ingest chunks in batches to avoid timeouts
async function ingestChunks(chunks, batchSize = 10) {
  const results = {
    total: chunks.length,
    processed: 0,
    created: 0,
    updated: 0,
    errors: []
  };

  console.log(`Starting ingestion of ${chunks.length} chunks in batches of ${batchSize}...`);

  for (let i = 0; i < chunks.length; i += batchSize) {
    const batch = chunks.slice(i, i + batchSize);
    const batchNum = Math.floor(i / batchSize) + 1;
    const totalBatches = Math.ceil(chunks.length / batchSize);
    
    console.log(`Processing batch ${batchNum}/${totalBatches} (${batch.length} chunks)...`);
    
    try {
      const response = await makeRequest('custom_kb-ingestion', {
        chunks: batch,
        force_update: false
      });

      if (response.status === 200) {
        const result = response.data;
        results.processed += batch.length;
        results.created += result.items_created || 0;
        results.updated += result.items_updated || 0;
        
        if (result.errors && result.errors.length > 0) {
          results.errors.push(...result.errors);
        }
        
        if (result.skipped && result.skipped.length > 0) {
          console.log(`  Batch ${batchNum}: ${result.items_created || 0} created, ${result.items_updated || 0} updated, ${result.skipped?.length || 0} skipped`);
        } else {
          console.log(`  Batch ${batchNum}: ${result.items_created || 0} created, ${result.items_updated || 0} updated`);
        }
      } else {
        const error = `HTTP ${response.status}: ${JSON.stringify(response.data)}`;
        results.errors.push(`Batch ${batchNum}: ${error}`);
        console.error(`  Batch ${batchNum} failed: ${error}`);
      }
    } catch (error) {
      const batchError = `Batch ${batchNum}: ${error.message}`;
      results.errors.push(batchError);
      console.error(`  Batch ${batchNum} failed: ${error.message}`);
    }

    // Small delay between batches to avoid rate limiting
    if (i + batchSize < chunks.length) {
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }

  return results;
}

// Main function
async function main() {
  const args = process.argv.slice(2);
  
  if (args.length < 1) {
    console.log('Usage: node ingest-chunks.js <chunks.json>');
    console.log('Example: node ingest-chunks.js chunks.json');
    process.exit(1);
  }

  const chunksFile = args[0];
  
  if (!fs.existsSync(chunksFile)) {
    console.error(`Chunks file not found: ${chunksFile}`);
    process.exit(1);
  }

  try {
    const chunks = readChunks(chunksFile);
    console.log(`Loaded ${chunks.length} chunks from ${chunksFile}`);
    
    // Show sample chunk
    if (chunks.length > 0) {
      console.log('\nSample chunk:');
      console.log(`- ID: ${chunks[0].chunk_id}`);
      console.log(`- Macro: ${chunks[0].macro}`);
      console.log(`- Micro: ${chunks[0].micro}`);
      console.log(`- File: ${chunks[0].metadata.file_path}`);
    }

    // Ask for confirmation
    console.log('\nReady to ingest chunks into KB system.');
    console.log('This will create KB articles and embeddings for each chunk.');
    console.log('Continue? (y/N)');
    
    // For automation, we'll proceed without interactive confirmation
    console.log('Proceeding with ingestion...\n');
    
    const results = await ingestChunks(chunks);
    
    console.log('\n=== Ingestion Complete ===');
    console.log(`Total chunks: ${results.total}`);
    console.log(`Processed: ${results.processed}`);
    console.log(`Created: ${results.created}`);
    console.log(`Updated: ${results.updated}`);
    console.log(`Errors: ${results.errors.length}`);
    
    if (results.errors.length > 0) {
      console.log('\nErrors:');
      results.errors.slice(0, 10).forEach((error, i) => {
        console.log(`${i + 1}. ${error}`);
      });
      
      if (results.errors.length > 10) {
        console.log(`... and ${results.errors.length - 10} more errors`);
      }
    }
    
    console.log('\nYou can now check the KB articles in your Spine instance!');
    
  } catch (error) {
    console.error('Fatal error:', error.message);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}
