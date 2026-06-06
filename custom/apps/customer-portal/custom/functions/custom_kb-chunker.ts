/**
 * Adaptive Article Chunker for KB Embeddings
 *
 * Strategy 5 (Recursive/Hierarchical) as the framework:
 *   - Strategy 1 (Heading-Based) for structured docs
 *   - Strategy 3 (Heading + Size Guards) for oversized sections
 *   - Strategy 4 (Paragraph Grouping) for unstructured prose
 *   - Strategy 2 (Fixed Window) deliberately excluded
 *
 * Hard rules:
 *   - Never split a code block or table
 *   - Never split mid-paragraph
 *   - Merge tiny chunks (<100 tokens) into neighbor
 *   - Prefix every chunk with context
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface Chunk {
  /** The text content to embed */
  content: string
  /** Section path for heading-based chunks, e.g. "Fields > data_type reference" */
  sectionPath: string | null
  /** 0-based index within the article */
  chunkIndex: number
  /** Total chunks for this article */
  chunkTotal: number
}

export interface ChunkerOptions {
  /** Article title — used as prefix context for every chunk */
  articleTitle: string
  /** Max tokens per chunk before sub-splitting. Default 800. */
  maxTokens?: number
  /** Min tokens per chunk before merging with neighbor. Default 100. */
  minTokens?: number
  /** Token count below which the entire article is a single chunk. Default 600. */
  singleChunkThreshold?: number
}

// ---------------------------------------------------------------------------
// Token estimation
// ---------------------------------------------------------------------------

/**
 * Rough token estimate: ~4 chars per token for English text.
 * Good enough for chunking decisions — actual tokenization happens at OpenAI.
 */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4)
}

// ---------------------------------------------------------------------------
// HTML → plain text
// ---------------------------------------------------------------------------

/**
 * Strip HTML tags to plain text, preserving structure via newlines.
 * Headings, paragraphs, divs get newlines. Inline tags are stripped.
 */
export function htmlToPlainText(html: string): string {
  let text = html
  // Normalize line breaks
  text = text.replace(/\r\n?/g, '\n')
  // Block-level elements → newlines
  text = text.replace(/<\/(p|div|li|tr|blockquote)>/gi, '\n')
  text = text.replace(/<br\s*\/?>/gi, '\n')
  text = text.replace(/<\/(h[1-6])>/gi, '\n')
  // Strip remaining tags
  text = text.replace(/<[^>]+>/g, '')
  // Decode common entities
  text = text.replace(/&amp;/g, '&')
  text = text.replace(/&lt;/g, '<')
  text = text.replace(/&gt;/g, '>')
  text = text.replace(/&quot;/g, '"')
  text = text.replace(/&#39;/g, "'")
  text = text.replace(/&nbsp;/g, ' ')
  // Collapse excessive newlines
  text = text.replace(/\n{3,}/g, '\n\n')
  return text.trim()
}

// ---------------------------------------------------------------------------
// Detect content format
// ---------------------------------------------------------------------------

type ContentFormat = 'markdown' | 'html'

function detectFormat(content: string): ContentFormat {
  // If it has HTML block tags, treat as HTML
  if (/<(p|div|h[1-6]|ul|ol|table|pre)\b/i.test(content)) return 'html'
  return 'markdown'
}

// ---------------------------------------------------------------------------
// Heading extraction
// ---------------------------------------------------------------------------

interface Section {
  /** Heading level: 1-6 for explicit headings, 0 for preamble */
  level: number
  /** Heading text (empty for preamble) */
  heading: string
  /** Body content below this heading (not including sub-sections) */
  body: string
}

/**
 * Parse markdown into a flat list of sections by heading.
 * Each section includes its heading text and the body up to the next heading.
 *
 * @param splitLevel - Only split on headings at this level or shallower.
 *   Deeper headings (e.g. ### when splitLevel=2) are kept as body content.
 *   Default 6 = split on all headings.
 */
function parseMarkdownSections(content: string, splitLevel: number = 6): Section[] {
  const lines = content.split('\n')
  const sections: Section[] = []
  let currentLevel = 0
  let currentHeading = ''
  let bodyLines: string[] = []

  for (const line of lines) {
    const headingMatch = line.match(/^(#{1,6})\s+(.+)$/)
    if (headingMatch && headingMatch[1].length <= splitLevel) {
      // Flush previous section
      if (bodyLines.length > 0 || currentHeading) {
        sections.push({
          level: currentLevel,
          heading: currentHeading,
          body: bodyLines.join('\n').trim()
        })
      }
      currentLevel = headingMatch[1].length
      currentHeading = headingMatch[2]
      bodyLines = []
    } else {
      bodyLines.push(line)
    }
  }

  // Flush final section
  if (bodyLines.length > 0 || currentHeading) {
    sections.push({
      level: currentLevel,
      heading: currentHeading,
      body: bodyLines.join('\n').trim()
    })
  }

  return sections
}

/**
 * Parse HTML into sections by h2/h3/h4 tags.
 * Converts to plain text first, then extracts heading structure.
 */
function parseHtmlSections(html: string, splitLevel: number = 6): Section[] {
  // Insert markdown-style headings before stripping, so we can parse them
  let marked = html.replace(/<h([1-6])[^>]*>(.*?)<\/h\1>/gi, (_, level, text) => {
    const hashes = '#'.repeat(parseInt(level))
    // Strip any HTML inside the heading text
    const cleanText = text.replace(/<[^>]+>/g, '').trim()
    return `\n${hashes} ${cleanText}\n`
  })
  // Convert the rest to plain text
  marked = htmlToPlainText(marked)
  return parseMarkdownSections(marked, splitLevel)
}

// ---------------------------------------------------------------------------
// Atomic block detection
// ---------------------------------------------------------------------------

/**
 * Check if a line is the start of a fenced code block.
 */
function isCodeFenceStart(line: string): boolean {
  return /^```/.test(line.trim())
}

/**
 * Check if a line is inside a markdown table (starts with |).
 */
function isTableRow(line: string): boolean {
  return /^\|/.test(line.trim())
}

// ---------------------------------------------------------------------------
// Paragraph-based splitting (Strategy 4)
// ---------------------------------------------------------------------------

/**
 * Split text into paragraphs, keeping code blocks and tables as atomic units.
 * Returns an array of paragraph strings.
 */
function splitIntoParagraphs(text: string): string[] {
  const lines = text.split('\n')
  const paragraphs: string[] = []
  let current: string[] = []
  let inCodeBlock = false

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]

    // Track code fence boundaries
    if (isCodeFenceStart(line)) {
      if (inCodeBlock) {
        // End of code block — include closing fence, flush as atomic unit
        current.push(line)
        paragraphs.push(current.join('\n'))
        current = []
        inCodeBlock = false
        continue
      } else {
        // Start of code block — flush what we have, start atomic unit
        if (current.length > 0 && current.some(l => l.trim())) {
          paragraphs.push(current.join('\n').trim())
        }
        current = [line]
        inCodeBlock = true
        continue
      }
    }

    if (inCodeBlock) {
      current.push(line)
      continue
    }

    // Table rows are grouped together as atomic
    if (isTableRow(line)) {
      // If previous content wasn't a table, flush it
      if (current.length > 0 && !isTableRow(current[current.length - 1])) {
        if (current.some(l => l.trim())) {
          paragraphs.push(current.join('\n').trim())
        }
        current = []
      }
      current.push(line)
      continue
    }

    // If we were in a table and hit a non-table line, flush the table
    if (current.length > 0 && isTableRow(current[current.length - 1]) && !isTableRow(line)) {
      paragraphs.push(current.join('\n').trim())
      current = []
    }

    // Empty line = paragraph boundary
    if (line.trim() === '') {
      if (current.length > 0 && current.some(l => l.trim())) {
        paragraphs.push(current.join('\n').trim())
        current = []
      }
      continue
    }

    current.push(line)
  }

  // Flush remaining
  if (inCodeBlock && current.length > 0) {
    // Unclosed code block — flush as-is
    paragraphs.push(current.join('\n').trim())
  } else if (current.length > 0 && current.some(l => l.trim())) {
    paragraphs.push(current.join('\n').trim())
  }

  return paragraphs.filter(p => p.length > 0)
}

/**
 * Group paragraphs into chunks of approximately maxTokens.
 * Never splits a paragraph — it's the atomic unit.
 */
function groupParagraphs(paragraphs: string[], maxTokens: number): string[] {
  const chunks: string[] = []
  let current: string[] = []
  let currentTokens = 0

  for (const para of paragraphs) {
    const paraTokens = estimateTokens(para)

    // If a single paragraph exceeds max, it goes as its own chunk (atomic — don't break it)
    if (paraTokens > maxTokens && current.length === 0) {
      chunks.push(para)
      continue
    }

    // Would adding this paragraph exceed the limit?
    if (currentTokens + paraTokens > maxTokens && current.length > 0) {
      chunks.push(current.join('\n\n'))
      current = [para]
      currentTokens = paraTokens
    } else {
      current.push(para)
      currentTokens += paraTokens
    }
  }

  if (current.length > 0) {
    chunks.push(current.join('\n\n'))
  }

  return chunks
}

// ---------------------------------------------------------------------------
// Section-based splitting (Strategy 1 + 3)
// ---------------------------------------------------------------------------

/**
 * Build section path from nested heading context.
 * E.g. "fields" → "Fields" or "fields > data_type reference" → "Fields > data_type reference"
 */
function buildSectionPath(headingStack: string[]): string {
  return headingStack.filter(Boolean).join(' > ')
}

/**
 * Recursively split sections that are too large.
 * Strategy 3: sub-split on sub-headings if available, else paragraph split (Strategy 4).
 */
function splitOversizedSection(
  body: string,
  currentLevel: number,
  maxTokens: number
): string[] {
  // Try to find sub-headings at the next level
  const subHeadingPattern = new RegExp(`^${'#'.repeat(currentLevel + 1)}\\s+`, 'm')

  if (subHeadingPattern.test(body)) {
    // Has sub-headings — split on them (recurse Strategy 1)
    const subSections = parseMarkdownSections(body).filter(s =>
      s.level > currentLevel || s.level === 0
    )

    // Re-parse keeping proper section boundaries
    const subLines = body.split('\n')
    const subChunks: string[] = []
    let currentChunk: string[] = []

    for (const line of subLines) {
      const subMatch = line.match(new RegExp(`^(#{${currentLevel + 1},6})\\s+(.+)$`))
      if (subMatch && currentChunk.length > 0) {
        const chunkText = currentChunk.join('\n').trim()
        if (chunkText) {
          if (estimateTokens(chunkText) > maxTokens) {
            // Still too big — go deeper
            subChunks.push(...splitOversizedSection(chunkText, currentLevel + 1, maxTokens))
          } else {
            subChunks.push(chunkText)
          }
        }
        currentChunk = [line]
      } else {
        currentChunk.push(line)
      }
    }
    if (currentChunk.length > 0) {
      const chunkText = currentChunk.join('\n').trim()
      if (chunkText) {
        if (estimateTokens(chunkText) > maxTokens) {
          subChunks.push(...splitOversizedSection(chunkText, currentLevel + 1, maxTokens))
        } else {
          subChunks.push(chunkText)
        }
      }
    }
    return subChunks
  }

  // No sub-headings — fall back to paragraph grouping (Strategy 4)
  const paragraphs = splitIntoParagraphs(body)
  return groupParagraphs(paragraphs, maxTokens)
}

// ---------------------------------------------------------------------------
// Merge tiny chunks
// ---------------------------------------------------------------------------

/**
 * Merge chunks that are below the minimum token threshold into their neighbor.
 * Prefers merging with the next chunk; if last, merges with previous.
 */
function mergeTinyChunks(chunks: string[], minTokens: number): string[] {
  if (chunks.length <= 1) return chunks

  const result: string[] = []

  for (let i = 0; i < chunks.length; i++) {
    const tokens = estimateTokens(chunks[i])

    if (tokens < minTokens && result.length > 0) {
      // Merge with previous
      result[result.length - 1] += '\n\n' + chunks[i]
    } else if (tokens < minTokens && i < chunks.length - 1) {
      // Merge with next
      chunks[i + 1] = chunks[i] + '\n\n' + chunks[i + 1]
    } else {
      result.push(chunks[i])
    }
  }

  return result
}

// ---------------------------------------------------------------------------
// Main chunker
// ---------------------------------------------------------------------------

/**
 * Chunk an article for embedding using the adaptive recursive strategy.
 *
 * Decision tree:
 *   1. ≤ singleChunkThreshold tokens → single chunk, no splitting
 *   2. Has headings → heading-based split (Strategy 1)
 *      - Oversized sections → sub-split (Strategy 3 → recurse or Strategy 4)
 *   3. No headings → paragraph grouping (Strategy 4)
 *   4. Merge tiny chunks
 *   5. Prefix every chunk with context
 */
export function chunkArticle(content: string, options: ChunkerOptions): Chunk[] {
  const {
    articleTitle,
    maxTokens = 800,
    minTokens = 100,
    singleChunkThreshold = 600,
  } = options

  if (!content || content.trim().length === 0) {
    return [{
      content: articleTitle,
      sectionPath: null,
      chunkIndex: 0,
      chunkTotal: 1,
    }]
  }

  // Detect format and normalize to plain text for token counting / splitting
  const format = detectFormat(content)
  let plainContent: string
  let sections: Section[]

  // Primary split at ## level — ### and deeper stay as body content
  // Sub-splitting (Strategy 3) will split on ### when a section is too large
  const primarySplitLevel = 2

  if (format === 'html') {
    sections = parseHtmlSections(content, primarySplitLevel)
    plainContent = htmlToPlainText(content)
  } else {
    sections = parseMarkdownSections(content, primarySplitLevel)
    plainContent = content
  }

  const totalTokens = estimateTokens(plainContent)

  // ── Step 1: Small article → single chunk ──────────────────────────
  if (totalTokens <= singleChunkThreshold) {
    const prefix = articleTitle
    return [{
      content: `${prefix}\n\n${plainContent}`,
      sectionPath: null,
      chunkIndex: 0,
      chunkTotal: 1,
    }]
  }

  // ── Step 2/3: Check for headings ──────────────────────────────────
  // h1 is treated as preamble/title — only ## and deeper count as section headings
  const hasHeadings = sections.some(s => s.level >= 2)

  let rawChunks: { text: string; sectionPath: string | null }[]

  if (hasHeadings) {
    // Strategy 1: heading-based split
    rawChunks = []
    // Track headings by level for proper nesting: level → heading text
    const headingByLevel = new Map<number, string>()

    for (const section of sections) {
      if ((section.level === 0 && !section.heading) || section.level === 1) {
        // Preamble or h1 title — treat as intro context, not a section to chunk
        if (section.body.trim()) {
          rawChunks.push({
            text: section.body,
            sectionPath: null,
          })
        }
        continue
      }

      // Clear this level and all deeper levels, then set current heading
      for (const lvl of headingByLevel.keys()) {
        if (lvl >= section.level) headingByLevel.delete(lvl)
      }
      headingByLevel.set(section.level, section.heading)

      // Build path from sorted levels: ## Parent > ### Child
      const sortedLevels = [...headingByLevel.keys()].sort((a, b) => a - b)
      const sectionPath = sortedLevels.map(l => headingByLevel.get(l)!).join(' > ')
      const fullSection = section.heading + '\n' + section.body
      const sectionTokens = estimateTokens(fullSection)

      if (sectionTokens > maxTokens) {
        // Strategy 3: sub-split oversized section
        const subChunks = splitOversizedSection(fullSection, section.level, maxTokens)
        for (let i = 0; i < subChunks.length; i++) {
          rawChunks.push({
            text: subChunks[i],
            sectionPath: subChunks.length > 1 ? `${sectionPath} (${i + 1}/${subChunks.length})` : sectionPath,
          })
        }
      } else {
        rawChunks.push({
          text: fullSection,
          sectionPath,
        })
      }
    }
  } else {
    // Strategy 4: paragraph grouping for unstructured content
    const paragraphs = splitIntoParagraphs(plainContent)
    const grouped = groupParagraphs(paragraphs, maxTokens)
    rawChunks = grouped.map(text => ({
      text,
      sectionPath: null,
    }))
  }

  // ── Step 4: Merge tiny chunks ─────────────────────────────────────
  // We need to merge while preserving sectionPath, so we work at the rawChunks level
  const mergedChunks: { text: string; sectionPath: string | null }[] = []

  for (let i = 0; i < rawChunks.length; i++) {
    const tokens = estimateTokens(rawChunks[i].text)

    if (tokens < minTokens && mergedChunks.length > 0) {
      // Merge with previous chunk
      const prev = mergedChunks[mergedChunks.length - 1]
      prev.text += '\n\n' + rawChunks[i].text
      // Keep the previous section path (the primary one)
    } else if (tokens < minTokens && i < rawChunks.length - 1) {
      // Merge with next chunk
      rawChunks[i + 1].text = rawChunks[i].text + '\n\n' + rawChunks[i + 1].text
      // Next chunk keeps its section path
    } else {
      mergedChunks.push({ ...rawChunks[i] })
    }
  }

  // ── Step 5: Prefix and build final chunks ─────────────────────────
  const total = mergedChunks.length

  return mergedChunks.map((chunk, index) => {
    let prefix: string
    if (chunk.sectionPath) {
      prefix = `${articleTitle} > ${chunk.sectionPath}`
    } else if (total > 1) {
      prefix = `${articleTitle} (chunk ${index + 1} of ${total})`
    } else {
      prefix = articleTitle
    }

    return {
      content: `${prefix}\n\n${chunk.text}`,
      sectionPath: chunk.sectionPath,
      chunkIndex: index,
      chunkTotal: total,
    }
  })
}
