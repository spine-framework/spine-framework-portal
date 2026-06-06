/**
 * Test script for the adaptive article chunker.
 *
 * Run: npx tsx v2-custom/tests/custom_kb-chunker.test.ts
 */
import { readFileSync } from 'fs'
import { chunkArticle, estimateTokens, htmlToPlainText } from '../functions/custom_kb-chunker'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let passed = 0
let failed = 0

function assert(condition: boolean, message: string) {
  if (condition) {
    passed++
    console.log(`  ✅ ${message}`)
  } else {
    failed++
    console.log(`  ❌ ${message}`)
  }
}

function section(name: string) {
  console.log(`\n── ${name} ──`)
}

// ---------------------------------------------------------------------------
// Test 1: Short article — single chunk, no splitting
// ---------------------------------------------------------------------------

section('Test 1: Short article (< 600 tokens)')

const shortArticle = `This is a short support article about resetting passwords.

If you forgot your password, click the "Forgot Password" link on the login page.
You will receive an email with a reset link. The link expires in 24 hours.

If you don't receive the email, check your spam folder or contact support.`

const shortChunks = chunkArticle(shortArticle, {
  articleTitle: 'How to Reset Your Password',
})

assert(shortChunks.length === 1, `Single chunk produced (got ${shortChunks.length})`)
assert(shortChunks[0].content.startsWith('How to Reset Your Password'), 'Prefixed with article title')
assert(shortChunks[0].sectionPath === null, 'No section path for short article')
assert(shortChunks[0].chunkIndex === 0, 'chunkIndex is 0')
assert(shortChunks[0].chunkTotal === 1, 'chunkTotal is 1')

// ---------------------------------------------------------------------------
// Test 2: Structured markdown with headings — heading-based split
// ---------------------------------------------------------------------------

section('Test 2: Structured markdown with headings')

const structuredArticle = `# Getting Started Guide

Welcome to our platform. This guide will walk you through the complete process of setting up, configuring, and using the Spine SDK in your application. By the end, you will have a fully working integration.

## Installation

Run the following command to install the SDK and its peer dependencies:

\`\`\`bash
npm install @spine/sdk @spine/auth @spine/utils
\`\`\`

Then configure your environment variables. Make sure you have Node.js 18 or later installed. The SDK uses native fetch and ES modules, so older Node versions are not supported.

After installation, verify the package is available by running \`npx spine-check\`. This will confirm the SDK is correctly installed and your environment meets all requirements.

## Configuration

Create a \`.env\` file in your project root with the following variables:

\`\`\`
SPINE_API_KEY=your-key-here
SPINE_URL=https://api.spine.dev
SPINE_ACCOUNT_ID=your-account-uuid
\`\`\`

### Required Variables

- \`SPINE_API_KEY\` — your API key from the admin dashboard. Navigate to Settings > API Keys to generate one. Each key is scoped to a specific account and set of permissions.
- \`SPINE_URL\` — the API endpoint for your region. Use \`https://api.spine.dev\` for US, \`https://api.eu.spine.dev\` for EU.
- \`SPINE_ACCOUNT_ID\` — your account UUID, found on the Settings page.

### Optional Variables

- \`SPINE_TIMEOUT\` — request timeout in milliseconds (default: 30000). Increase this for large batch operations.
- \`SPINE_RETRY\` — number of automatic retries for transient failures (default: 3). Set to 0 to disable.
- \`SPINE_LOG_LEVEL\` — logging verbosity: \`debug\`, \`info\`, \`warn\`, \`error\` (default: \`info\`).
- \`SPINE_PROXY\` — HTTP proxy URL for corporate network environments.

## Usage

Import the SDK and create a client instance. The client handles authentication, retries, and connection pooling automatically:

\`\`\`typescript
import { SpineClient } from '@spine/sdk'

const client = new SpineClient({
  apiKey: process.env.SPINE_API_KEY,
  url: process.env.SPINE_URL,
  accountId: process.env.SPINE_ACCOUNT_ID,
})

// List all accounts
const accounts = await client.accounts.list()

// Get a specific item
const item = await client.items.get('uuid-here')

// Create a new item
const newItem = await client.items.create({
  title: 'My New Item',
  type_slug: 'task',
  data: { priority: 'high' },
})
\`\`\`

The client is thread-safe and can be shared across your application. Create one instance at startup and reuse it.

## Error Handling

The SDK throws typed errors for different failure modes. Always wrap API calls in try-catch blocks:

\`\`\`typescript
try {
  const result = await client.items.get('invalid-uuid')
} catch (err) {
  if (err instanceof SpineAuthError) {
    console.error('Authentication failed:', err.message)
  } else if (err instanceof SpineNotFoundError) {
    console.error('Item not found')
  } else if (err instanceof SpineRateLimitError) {
    console.error('Rate limited, retry after:', err.retryAfter)
  }
}
\`\`\`

## Troubleshooting

### Error: Invalid API Key

Make sure your API key is correct and has not expired. API keys can be rotated from the admin dashboard under Settings > API Keys. If you recently rotated your key, update your \`.env\` file with the new value.

### Error: Connection Timeout

Check that your \`SPINE_URL\` is correct and the server is reachable. Common causes include firewall rules blocking outbound HTTPS traffic, incorrect proxy configuration, or DNS resolution failures. Try running \`curl -v https://api.spine.dev/health\` to verify connectivity.

### Error: Rate Limited

The API enforces rate limits per API key. Default limits are 100 requests per second for read operations and 20 per second for write operations. If you need higher limits, contact support to discuss your use case.`

const structuredChunks = chunkArticle(structuredArticle, {
  articleTitle: 'Getting Started Guide',
})

assert(structuredChunks.length > 1, `Multiple chunks produced (got ${structuredChunks.length})`)
assert(structuredChunks.every(c => c.content.includes('Getting Started Guide')),
  'All chunks prefixed with article title')
assert(structuredChunks.some(c => c.sectionPath?.includes('Installation')),
  'Has Installation section')
assert(structuredChunks.some(c => c.sectionPath?.includes('Configuration')),
  'Has Configuration section')
assert(structuredChunks.some(c => c.sectionPath?.includes('Usage')),
  'Has Usage section')
assert(structuredChunks.some(c => c.sectionPath?.includes('Troubleshooting')),
  'Has Troubleshooting section')
assert(structuredChunks.some(c => c.sectionPath?.includes('Error Handling')),
  'Has Error Handling section')

console.log('\n  Chunk breakdown:')
structuredChunks.forEach((c, i) => {
  console.log(`    [${i}] ~${estimateTokens(c.content)} tokens | section: ${c.sectionPath || '(preamble)'}`)
})

// ---------------------------------------------------------------------------
// Test 3: Unstructured narrative — paragraph grouping
// ---------------------------------------------------------------------------

section('Test 3: Unstructured narrative (no headings)')

const narrative = Array.from({ length: 20 }, (_, i) =>
  `Paragraph ${i + 1}: This is a block of narrative content that represents a success story or editorial piece. It describes how the customer implemented the solution and achieved measurable results in their business operations. The team worked closely with the vendor to ensure a smooth rollout across all departments.`
).join('\n\n')

const narrativeChunks = chunkArticle(narrative, {
  articleTitle: 'Acme Corp Success Story',
})

assert(narrativeChunks.length > 1, `Multiple chunks produced (got ${narrativeChunks.length})`)
assert(narrativeChunks.every(c => c.sectionPath === null), 'No section paths for unstructured content')
assert(narrativeChunks.every(c => c.content.includes('Acme Corp Success Story')), 'All prefixed with title')
assert(narrativeChunks.every(c => c.content.includes('chunk')), 'All have chunk N of M context')

console.log('\n  Chunk breakdown:')
narrativeChunks.forEach((c, i) => {
  console.log(`    [${i}] ~${estimateTokens(c.content)} tokens | ${c.chunkIndex + 1}/${c.chunkTotal}`)
})

// ---------------------------------------------------------------------------
// Test 4: Code blocks stay atomic
// ---------------------------------------------------------------------------

section('Test 4: Code blocks are atomic')

const codeArticle = `## Overview

Short intro.

## The Code

Here is a large code block:

\`\`\`typescript
${Array.from({ length: 80 }, (_, i) => `  const line${i} = 'this is line ${i} of the code block'`).join('\n')}
\`\`\`

## After the Code

Some text after.`

const codeChunks = chunkArticle(codeArticle, {
  articleTitle: 'Code Example Article',
  maxTokens: 400, // Force sub-splitting
})

// Verify no code block was split mid-way
const codeBlockContent = codeChunks.map(c => c.content)
const codeBlockChunk = codeBlockContent.find(c => c.includes("const line0 = 'this is line 0"))
assert(!!codeBlockChunk, 'Found chunk containing start of code block')
if (codeBlockChunk) {
  assert(codeBlockChunk.includes("const line79 = 'this is line 79"), 'Same chunk contains end of code block (atomic)')
}

console.log('\n  Chunk breakdown:')
codeChunks.forEach((c, i) => {
  console.log(`    [${i}] ~${estimateTokens(c.content)} tokens | section: ${c.sectionPath || '(none)'}`)
})

// ---------------------------------------------------------------------------
// Test 5: Tiny chunks get merged
// ---------------------------------------------------------------------------

section('Test 5: Tiny chunks get merged')

const tinyArticle = `## Section A

Tiny.

## Section B

Also tiny.

## Section C

This section has enough content to be meaningful. It contains several sentences that describe the topic in detail. The reader should come away with a clear understanding of the concepts presented here. Additional context is provided to ensure the chunk meets the minimum token threshold.`

const tinyChunks = chunkArticle(tinyArticle, {
  articleTitle: 'Merge Test',
  minTokens: 100,
})

// Section A and B are tiny (~5 tokens each), should be merged
assert(tinyChunks.length < 3, `Tiny sections merged (got ${tinyChunks.length} chunks, expected < 3)`)

console.log('\n  Chunk breakdown:')
tinyChunks.forEach((c, i) => {
  console.log(`    [${i}] ~${estimateTokens(c.content)} tokens | section: ${c.sectionPath || '(none)'}`)
})

// ---------------------------------------------------------------------------
// Test 6: HTML content
// ---------------------------------------------------------------------------

section('Test 6: HTML content')

const htmlArticle = `<h2>Introduction</h2>
<p>This is an HTML article stored by the rich text editor.</p>
<p>It contains multiple paragraphs of formatted content.</p>

<h2>Details</h2>
<p>Here are the details with <strong>bold</strong> and <em>italic</em> text.</p>
<ul>
  <li>Item one</li>
  <li>Item two</li>
  <li>Item three</li>
</ul>

<h2>Conclusion</h2>
<p>Wrapping up the article with a summary of key points.</p>`

const htmlChunks = chunkArticle(htmlArticle, {
  articleTitle: 'HTML Article Test',
})

assert(htmlChunks.length >= 1, `Chunks produced from HTML (got ${htmlChunks.length})`)
assert(!htmlChunks.some(c => c.content.includes('<p>')), 'HTML tags stripped from chunk content')
assert(!htmlChunks.some(c => c.content.includes('<h2>')), 'Heading tags stripped from chunk content')

console.log('\n  Chunk breakdown:')
htmlChunks.forEach((c, i) => {
  console.log(`    [${i}] ~${estimateTokens(c.content)} tokens | section: ${c.sectionPath || '(none)'}`)
})

// ---------------------------------------------------------------------------
// Test 7: Real file — design-schema-spec.md
// ---------------------------------------------------------------------------

section('Test 7: Real file — design-schema-spec.md')

try {
  const specContent = readFileSync(
    new URL('../docs/design-schema-spec.md', import.meta.url),
    'utf-8'
  )

  const specChunks = chunkArticle(specContent, {
    articleTitle: 'Design Schema & Validation Schema Specification',
  })

  assert(specChunks.length > 5, `Multiple chunks from spec (got ${specChunks.length})`)
  assert(specChunks.length < 40, `Reasonable chunk count (got ${specChunks.length}, expected < 40)`)
  assert(specChunks.every(c => estimateTokens(c.content) >= 50),
    `All chunks have meaningful content (min ${Math.min(...specChunks.map(c => estimateTokens(c.content)))} tokens)`)

  const maxChunkTokens = Math.max(...specChunks.map(c => estimateTokens(c.content)))
  assert(maxChunkTokens < 2000, `No chunk is excessively large (max ${maxChunkTokens} tokens)`)

  console.log('\n  Chunk breakdown:')
  specChunks.forEach((c, i) => {
    console.log(`    [${i}] ~${estimateTokens(c.content)} tokens | section: ${c.sectionPath || '(preamble)'}`)
  })

  console.log(`\n  Total tokens across all chunks: ~${specChunks.reduce((sum, c) => sum + estimateTokens(c.content), 0)}`)
  console.log(`  Original doc tokens: ~${estimateTokens(specContent)}`)
} catch (err: any) {
  console.log(`  ⚠️  Skipped — could not read design-schema-spec.md: ${err.message}`)
}

// ---------------------------------------------------------------------------
// Test 8: Empty content
// ---------------------------------------------------------------------------

section('Test 8: Empty content')

const emptyChunks = chunkArticle('', { articleTitle: 'Empty Article' })
assert(emptyChunks.length === 1, `Single chunk for empty content (got ${emptyChunks.length})`)
assert(emptyChunks[0].content === 'Empty Article', 'Content is just the title')

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------

console.log(`\n${'═'.repeat(50)}`)
console.log(`Results: ${passed} passed, ${failed} failed`)
console.log(`${'═'.repeat(50)}`)

if (failed > 0) process.exit(1)
