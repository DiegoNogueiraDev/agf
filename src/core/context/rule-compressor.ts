/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * Rule-based text compression utilities.
 * Fast (<50ms) compression without LLM dependency.
 * Adapted from context-hub compression patterns for local-first usage.
 */

/**
 * Tokenize text into lowercase word tokens, filtering empty strings.
 */
function tokenize(text: string): string[] {
  return text.toLowerCase().split(/\s+/).filter(Boolean)
}

import { estimateTokens } from './token-estimator.js'

/** Compute Jaccard similarity between two token sets. */
export function jaccardSimilarity(a: string, b: string): number {
  const tokensA = tokenize(a)
  const tokensB = tokenize(b)

  if (tokensA.length === 0 && tokensB.length === 0) {
    return 0
  }

  const setA = new Set(tokensA)
  const setB = new Set(tokensB)

  let intersection = 0
  for (const token of setA) {
    if (setB.has(token)) {
      intersection++
    }
  }

  const union = new Set([...setA, ...setB]).size

  if (union === 0) {
    return 0
  }

  return intersection / union
}

const MIN_SENTENCE_LENGTH = 20
const DEDUP_THRESHOLD = 0.7

/**
 * Split text into sentences by splitting on period followed by space or end.
 */
function splitSentences(text: string): string[] {
  return text
    .split(/\.(?:\s|$)/)
    .map((s) => s.trim())
    .filter(Boolean)
}

/**
 * Compress text into deduplicated bullet list format.
 * Extracts sentences, removes duplicates (Jaccard >0.7),
 * filters short sentences (<20 chars), and formats as bullets.
 * Respects maxTokens budget.
 */
export function compressBullets(text: string, maxTokens: number): string {
  if (!text.trim()) {
    return ''
  }

  const sentences = splitSentences(text)

  // Filter short sentences
  const filtered = sentences.filter((s) => s.length >= MIN_SENTENCE_LENGTH)

  if (filtered.length === 0) {
    return ''
  }

  // Deduplicate: keep first occurrence, skip later sentences too similar to any kept
  const kept: string[] = []
  for (const sentence of filtered) {
    const isDuplicate = kept.some((existing) => jaccardSimilarity(existing, sentence) > DEDUP_THRESHOLD)
    if (!isDuplicate) {
      kept.push(sentence)
    }
  }

  // Format as bullets, respecting token budget
  const lines: string[] = []
  let totalTokens = 0

  for (const sentence of kept) {
    const line = `- ${sentence}`
    const lineTokens = estimateTokens(line + '\n')

    if (totalTokens + lineTokens > maxTokens) {
      break
    }

    lines.push(line)
    totalTokens += lineTokens
  }

  return lines.join('\n')
}

/**
 * Pattern matching numbered steps (e.g. "1. Do something") and bullet points ("- Item").
 */
const STEP_PATTERN = /^(?:\d+\.\s+|- )/

/**
 * Compress text by extracting numbered steps and bullet points.
 * Detects lines matching "N. ..." or "- ..." patterns.
 * Respects maxTokens budget.
 */
export function compressSteps(text: string, maxTokens: number): string {
  if (!text.trim()) {
    return ''
  }

  const textLines = text
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
  const steps = textLines.filter((line) => STEP_PATTERN.test(line))

  if (steps.length === 0) {
    return ''
  }

  const resultValue: string[] = []
  let totalTokens = 0

  for (const step of steps) {
    const lineTokens = estimateTokens(step + '\n')

    if (totalTokens + lineTokens > maxTokens) {
      break
    }

    resultValue.push(step)
    totalTokens += lineTokens
  }

  return resultValue.join('\n')
}

/**
 * Pattern matching markdown headers (# Title, ## Section, ### Sub).
 */
const HEADER_PATTERN = /^#{1,6}\s+(.+)$/

/**
 * Compress text into JSON format.
 * If markdown headers are present, converts to key-value object where headers are keys
 * and their content is the value. Otherwise falls back to {points:[], total_sentences:N}.
 * Respects maxTokens budget.
 */
export function compressJson(text: string, maxTokens: number): string {
  if (!text.trim()) {
    return JSON.stringify({})
  }

  const textLines = text.split('\n')

  // Check if text has markdown headers
  const hasHeaders = textLines.some((line) => HEADER_PATTERN.test(line.trim()))

  if (hasHeaders) {
    return compressJsonFromHeaders(textLines, maxTokens)
  }

  return compressJsonFallback(text, maxTokens)
}

/**
 * Convert markdown-headed text into JSON {header: content, ...}.
 */
function compressJsonFromHeaders(textLines: string[], maxTokens: number): string {
  const sections: Record<string, string> = {}
  let currentHeader = ''
  let currentContent: string[] = []
  let totalTokens = 0

  for (const line of textLines) {
    const trimmed = line.trim()
    const match = HEADER_PATTERN.exec(trimmed)

    if (match) {
      // Flush previous section
      if (currentHeader) {
        const content = currentContent.join(' ').trim()
        const entryTokens = estimateTokens(`"${currentHeader}":"${content}",`)

        if (totalTokens + entryTokens > maxTokens) {
          break
        }

        sections[currentHeader] = content
        totalTokens += entryTokens
      }

      currentHeader = match[1].trim()
      currentContent = []
    } else if (trimmed) {
      currentContent.push(trimmed)
    }
  }

  // Flush last section
  if (currentHeader) {
    const content = currentContent.join(' ').trim()
    const entryTokens = estimateTokens(`"${currentHeader}":"${content}",`)

    if (totalTokens + entryTokens <= maxTokens) {
      sections[currentHeader] = content
    }
  }

  return JSON.stringify(sections)
}

/**
 * Fallback: split text into sentences and return {points: [...], total_sentences: N}.
 */
function compressJsonFallback(text: string, maxTokens: number): string {
  const sentences = splitSentences(text).filter((s) => s.length > 0)

  const points: string[] = []
  let totalTokens = estimateTokens('{"points":[],"total_sentences":0}')

  for (const sentence of sentences) {
    const entryTokens = estimateTokens(`"${sentence}",`)

    if (totalTokens + entryTokens > maxTokens) {
      break
    }

    points.push(sentence)
    totalTokens += entryTokens
  }

  return JSON.stringify({ points, total_sentences: sentences.length })
}

/**
 * Split text into paragraphs by double newline boundaries.
 */
function splitParagraphs(text: string): string[] {
  return text
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean)
}

/**
 * Extract the first sentence from a paragraph.
 * Splits on period followed by space or end-of-string.
 */
function extractTopicSentence(paragraph: string): string {
  const sentences = paragraph.split(/\.(?:\s|$)/)
  const first = sentences[0]?.trim()
  return first || ''
}

/**
 * Compress text into deduplicated summary of topic sentences.
 * Extracts the first sentence from each paragraph (topic sentence),
 * removes duplicates (Jaccard >0.7), and joins with newlines.
 * Respects maxTokens budget.
 */
export function compressSummary(text: string, maxTokens: number): string {
  if (!text.trim()) {
    return ''
  }

  const paragraphs = splitParagraphs(text)
  const topicSentences = paragraphs.map(extractTopicSentence).filter((s) => s.length > 0)

  if (topicSentences.length === 0) {
    return ''
  }

  // Deduplicate: keep first occurrence, skip later sentences too similar
  const kept: string[] = []
  for (const sentence of topicSentences) {
    const isDuplicate = kept.some((existing) => jaccardSimilarity(existing, sentence) > DEDUP_THRESHOLD)
    if (!isDuplicate) {
      kept.push(sentence)
    }
  }

  // Join respecting token budget
  const lines: string[] = []
  let totalTokens = 0

  for (const sentence of kept) {
    const lineTokens = estimateTokens(sentence + '\n')

    if (totalTokens + lineTokens > maxTokens) {
      break
    }

    lines.push(sentence)
    totalTokens += lineTokens
  }

  return lines.join('\n')
}
