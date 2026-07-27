/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * Knowledge Dedup & Contradiction Detection.
 * Uses Jaccard similarity for near-duplicate detection
 * and negation pattern matching for contradiction detection.
 */

import type Database from 'better-sqlite3'
import { jaccardSimilarity } from '../context/rule-compressor.js'
import { createLogger } from '../utils/logger.js'

const log = createLogger({ layer: 'rag', source: 'knowledge-dedup.ts' })

const DEDUP_THRESHOLD = 0.7

export interface DuplicatePair {
  docId1: string
  docId2: string
  title1: string
  title2: string
  similarity: number
}

export interface Contradiction {
  docId1: string
  docId2: string
  title1: string
  title2: string
  reason: string
}

/** Negation patterns: "should always" vs "should never", "must" vs "must not", etc. */
const NEGATION_PAIRS = [
  { positive: /\bshould\s+always\b/i, negative: /\bshould\s+never\b/i },
  { positive: /\bmust\b/i, negative: /\bmust\s+not\b/i },
  { positive: /\bis\s+required\b/i, negative: /\bis\s+not\s+required\b/i },
  { positive: /\benable\b/i, negative: /\bdisable\b/i },
  { positive: /\btrue\b/i, negative: /\bfalse\b/i },
]

/**
 * Find near-duplicate documents using Jaccard similarity on content.
 * Compares all pairs (O(n^2) — suitable for small-medium stores).
 */
export function findDuplicates(db: Database.Database, threshold = DEDUP_THRESHOLD): DuplicatePair[] {
  const docs = db
    .prepare('SELECT id, title, content FROM knowledge_documents ORDER BY created_at DESC LIMIT 500')
    .all() as Array<{ id: string; title: string; content: string }>

  const duplicates: DuplicatePair[] = []

  for (let i = 0; i < docs.length; i++) {
    for (let j = i + 1; j < docs.length; j++) {
      const similarity = jaccardSimilarity(docs[i].content, docs[j].content)
      if (similarity > threshold) {
        duplicates.push({
          docId1: docs[i].id,
          docId2: docs[j].id,
          title1: docs[i].title,
          title2: docs[j].title,
          similarity: Math.round(similarity * 1000) / 1000,
        })
      }
    }
  }

  log.debug('knowledge-dedup:findDuplicates', { checked: docs.length, found: duplicates.length })
  return duplicates
}

/**
 * Find contradicting documents by detecting negation pattern differences
 * in documents with high content overlap (Jaccard 0.4-0.7).
 */
export function findContradictions(db: Database.Database): Contradiction[] {
  const docs = db
    .prepare('SELECT id, title, content FROM knowledge_documents ORDER BY created_at DESC LIMIT 500')
    .all() as Array<{ id: string; title: string; content: string }>

  const contradictions: Contradiction[] = []

  for (let i = 0; i < docs.length; i++) {
    for (let j = i + 1; j < docs.length; j++) {
      const similarity = jaccardSimilarity(docs[i].content, docs[j].content)

      // Only check for contradictions in documents with moderate overlap
      if (similarity < 0.3 || similarity > 0.9) continue

      for (const { positive, negative } of NEGATION_PAIRS) {
        const doc1HasPos = positive.test(docs[i].content)
        const doc1HasNeg = negative.test(docs[i].content)
        const doc2HasPos = positive.test(docs[j].content)
        const doc2HasNeg = negative.test(docs[j].content)

        if ((doc1HasPos && doc2HasNeg) || (doc1HasNeg && doc2HasPos)) {
          contradictions.push({
            docId1: docs[i].id,
            docId2: docs[j].id,
            title1: docs[i].title,
            title2: docs[j].title,
            reason: `Negation conflict: "${positive.source}" vs "${negative.source}"`,
          })
          break // One contradiction per pair is enough
        }
      }
    }
  }

  log.debug('knowledge-dedup:findContradictions', { checked: docs.length, found: contradictions.length })
  return contradictions
}
