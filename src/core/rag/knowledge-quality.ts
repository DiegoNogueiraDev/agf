/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * Knowledge Quality Engine — scores, decays, and tracks knowledge relevance.
 *
 * Quality score is a composite (0–1) based on:
 * - Freshness (0.3): exponential decay from created_at, half-life 30 days
 * - Source reliability (0.3): static weight per source_type
 * - Usage frequency (0.2): normalized usage_count (log scale)
 * - Content richness (0.2): content length relative to average
 */

import type Database from 'better-sqlite3'
import type { KnowledgeDocument, KnowledgeSourceType } from '../../schemas/knowledge.schema.js'
import { now } from '../utils/time.js'
import { createLogger } from '../utils/logger.js'
import { findDuplicates, findContradictions } from './knowledge-dedup.js'
import { applyFeedback } from './knowledge-feedback.js'

const log = createLogger({ layer: 'rag', source: 'knowledge-quality.ts' })

const FRESHNESS_WEIGHT = 0.3
const RELIABILITY_WEIGHT = 0.3
const USAGE_WEIGHT = 0.2
const RICHNESS_WEIGHT = 0.2

/** Half-life in days for freshness decay */
const FRESHNESS_HALF_LIFE_DAYS = 30

/** Average content length baseline (chars) for richness scoring */
const AVG_CONTENT_LENGTH = 500

const SOURCE_RELIABILITY: Record<string, number> = {
  docs: 0.9,
  prd: 0.85,
  memory: 0.8,
  skill: 0.75,
  web_capture: 0.7,
  sprint_plan: 0.7,
  code_context: 0.65,
  ai_decision: 0.6,
  validation_result: 0.6,
  synthesis: 0.55,
  phase_summary: 0.5,
}

/**
 * Get the reliability weight for a knowledge source type.
 */
export function getSourceReliabilityWeight(sourceType: KnowledgeSourceType): number {
  return SOURCE_RELIABILITY[sourceType] ?? 0.5
}

/**
 * Calculate a composite quality score (0–1) for a knowledge document.
 */
export function calculateQualityScore(doc: KnowledgeDocument): number {
  const freshness = calculateFreshness(doc.createdAt)
  const reliability = getSourceReliabilityWeight(doc.sourceType)
  const usage = calculateUsageScore(doc.usageCount ?? 0)
  const richness = calculateRichness(doc.content)

  const score =
    FRESHNESS_WEIGHT * freshness + RELIABILITY_WEIGHT * reliability + USAGE_WEIGHT * usage + RICHNESS_WEIGHT * richness

  return Math.max(0, Math.min(1, score))
}

/**
 * Freshness score: exponential decay with 30-day half-life.
 * Returns 1.0 for brand-new docs, 0.5 at 30 days, ~0.25 at 60 days.
 */
function calculateFreshness(createdAt: string): number {
  const ageMs = Date.now() - new Date(createdAt).getTime()
  const ageDays = Math.max(0, ageMs / (24 * 60 * 60 * 1000))
  return Math.pow(0.5, ageDays / FRESHNESS_HALF_LIFE_DAYS)
}

/**
 * Usage score: logarithmic scale. More usage = higher score, with diminishing returns.
 * 0 usage → 0.0, 1 usage → 0.5, 10 usage → 0.83, 100 usage → 1.0
 */
function calculateUsageScore(usageCount: number): number {
  if (usageCount <= 0) return 0
  return Math.min(1, Math.log10(usageCount + 1) / 2)
}

/**
 * Content richness score: longer content scores higher, up to a cap.
 */
function calculateRichness(content: string): number {
  const ratio = content.length / AVG_CONTENT_LENGTH
  return Math.min(1, ratio)
}

/**
 * Calculate staleness in days from a date string.
 */
function calculateStalenessDays(createdAt: string): number {
  const ageMs = Date.now() - new Date(createdAt).getTime()
  return Math.max(0, Math.floor(ageMs / (24 * 60 * 60 * 1000)))
}

/**
 * Record a usage event for a knowledge document.
 * Inserts into knowledge_usage_log and increments usage_count + last_accessed_at.
 */
export function recordUsage(
  db: Database.Database,
  docId: string,
  query: string,
  action: string,
  context?: Record<string, unknown>,
): void {
  const timestamp = now()

  db.prepare('INSERT INTO knowledge_usage_log (doc_id, query, action, context, created_at) VALUES (?, ?, ?, ?, ?)').run(
    docId,
    query,
    action,
    context ? JSON.stringify(context) : null,
    timestamp,
  )

  db.prepare('UPDATE knowledge_documents SET usage_count = usage_count + 1, last_accessed_at = ? WHERE id = ?').run(
    timestamp,
    docId,
  )

  log.debug('Knowledge usage recorded', { docId, action })
}

/**
 * Auto-consolidate near-duplicate knowledge documents.
 *
 * Paper §5.2.1 (Memory Evolution: Consolidation) from Hu et al. (2026).
 * `findDuplicates()` already detects pairs with Jaccard similarity > threshold;
 * this function acts on the detection: keeps the newer doc as the survivor and
 * archives the older one (staleness_days = 999, quality_score = QUALITY_MIN,
 * metadata.consolidatedInto = survivorId). Survivor's metadata gains a
 * `consolidatedFrom: [docId]` audit trail.
 *
 * Non-destructive: the older row stays in the DB so future audits can replay
 * the trace. The downstream pruner (strategy: "age" or "quality") sweeps it
 * out only if the operator opts in.
 *
 * Idempotent: a second pass is a no-op because already-archived docs have
 * staleness_days = 999 and won't appear at the top of findDuplicates' window
 * with non-archived peers (mostly true under the natural workload; we also
 * skip docs whose metadata.consolidatedInto is already set).
 */
export function consolidateDuplicates(db: Database.Database): {
  consolidated: number
  pairs: Array<{ survivorId: string; archivedId: string }>
} {
  const pairs = findDuplicates(db)
  if (pairs.length === 0) {
    return { consolidated: 0, pairs: [] }
  }

  // Pre-fetch created_at + metadata for every doc id involved so we can pick
  // the survivor and update both rows in one transaction.
  const ids = Array.from(new Set(pairs.flatMap((p) => [p.docId1, p.docId2])))
  const placeholders = ids.map(() => '?').join(', ')
  const rows = db
    .prepare(`SELECT id, created_at, metadata FROM knowledge_documents WHERE id IN (${placeholders})`)
    .all(...ids) as Array<{ id: string; created_at: string; metadata: string | null }>
  const byId = new Map(rows.map((r) => [r.id, r]))

  const consolidated: Array<{ survivorId: string; archivedId: string }> = []
  const ARCHIVED_QUALITY = 0.1

  db.transaction(() => {
    for (const pair of pairs) {
      const aVar = byId.get(pair.docId1)
      const bVar = byId.get(pair.docId2)
      if (!aVar || !bVar) continue

      const aMeta = parseMetadata(aVar.metadata)
      const bMeta = parseMetadata(bVar.metadata)
      // Skip if either side is already archived in a prior pass.
      if (aMeta.consolidatedInto || bMeta.consolidatedInto) continue

      const survivor = aVar.created_at >= bVar.created_at ? aVar : bVar
      const archived = survivor === aVar ? bVar : aVar
      const survivorMeta = parseMetadata(survivor.metadata)
      const archivedMeta = parseMetadata(archived.metadata)

      // Mark archived doc.
      db.prepare(
        'UPDATE knowledge_documents SET staleness_days = 999, quality_score = ?, metadata = ? WHERE id = ?',
      ).run(ARCHIVED_QUALITY, JSON.stringify({ ...archivedMeta, consolidatedInto: survivor.id }), archived.id)

      // Update survivor's audit trail.
      const consolidatedFrom = Array.isArray(survivorMeta.consolidatedFrom)
        ? (survivorMeta.consolidatedFrom as string[])
        : []
      if (!consolidatedFrom.includes(archived.id)) consolidatedFrom.push(archived.id)
      db.prepare('UPDATE knowledge_documents SET metadata = ? WHERE id = ?').run(
        JSON.stringify({ ...survivorMeta, consolidatedFrom }),
        survivor.id,
      )

      // Keep the in-memory map fresh so subsequent pairs in the same pass see
      // the updated metadata (prevents double-archiving when 3+ near-dup chain).
      byId.set(survivor.id, { ...survivor, metadata: JSON.stringify({ ...survivorMeta, consolidatedFrom }) })
      byId.set(archived.id, {
        ...archived,
        metadata: JSON.stringify({ ...archivedMeta, consolidatedInto: survivor.id }),
      })

      consolidated.push({ survivorId: survivor.id, archivedId: archived.id })
    }
  })()

  if (consolidated.length > 0) {
    log.info('knowledge-quality:consolidated', { count: consolidated.length })
  }
  return { consolidated: consolidated.length, pairs: consolidated }
}

/**
 * Auto-forget the older side of every detected contradiction pair.
 *
 * Paper §5.2.3 (Memory Evolution: Forgetting) from Hu et al. (2026).
 * `findContradictions()` already detects pairs where two memories make
 * opposing claims (negation pattern with high content overlap). Default
 * policy: the newer memory wins; the older is marked `outdated` via the
 * existing `applyFeedback` path.
 *
 * Override: if the older memory has *more* manual `helpful` feedback than
 * the newer one, skip the auto-forget and surface a warning. The user has
 * already vouched for the older claim — let a human decide which side is
 * actually correct.
 */
export function forgetContradictions(db: Database.Database): {
  forgotten: number
  skippedHigherHelpful: number
  pairs: Array<{ olderId: string; newerId: string; action: 'forgotten' | 'skipped' }>
} {
  const pairs = findContradictions(db)
  if (pairs.length === 0) {
    return { forgotten: 0, skippedHigherHelpful: 0, pairs: [] }
  }

  const ids = Array.from(new Set(pairs.flatMap((p) => [p.docId1, p.docId2])))
  const placeholders = ids.map(() => '?').join(', ')
  const docs = db
    .prepare(`SELECT id, created_at, staleness_days FROM knowledge_documents WHERE id IN (${placeholders})`)
    .all(...ids) as Array<{ id: string; created_at: string; staleness_days: number }>
  const byId = new Map(docs.map((d) => [d.id, d]))

  const helpfulCount = (docId: string): number => {
    const row = db
      .prepare("SELECT COUNT(*) as n FROM knowledge_usage_log WHERE doc_id = ? AND action = 'helpful'")
      .get(docId) as { n: number }
    return row.n
  }

  let forgotten = 0
  let skippedHigherHelpful = 0
  const audit: Array<{ olderId: string; newerId: string; action: 'forgotten' | 'skipped' }> = []
  const seenOlder = new Set<string>()

  for (const pair of pairs) {
    const aVar = byId.get(pair.docId1)
    const bVar = byId.get(pair.docId2)
    if (!aVar || !bVar) continue

    const older = aVar.created_at <= bVar.created_at ? aVar : bVar
    const newer = older === aVar ? bVar : aVar
    if (seenOlder.has(older.id)) continue
    seenOlder.add(older.id)

    // Already forgotten in a prior pass.
    if (older.staleness_days >= 999) continue

    const olderHelpful = helpfulCount(older.id)
    const newerHelpful = helpfulCount(newer.id)
    if (olderHelpful > newerHelpful) {
      skippedHigherHelpful += 1
      audit.push({ olderId: older.id, newerId: newer.id, action: 'skipped' })
      log.warn('knowledge-quality:contradiction:skipped_human_decides', {
        olderId: older.id,
        newerId: newer.id,
        olderHelpful,
        newerHelpful,
        reason: pair.reason,
      })
      continue
    }

    applyFeedback(db, older.id, `contradiction:${pair.reason}`, 'outdated')
    forgotten += 1
    audit.push({ olderId: older.id, newerId: newer.id, action: 'forgotten' })
  }

  if (forgotten > 0 || skippedHigherHelpful > 0) {
    log.info('knowledge-quality:contradictions_processed', { forgotten, skippedHigherHelpful })
  }
  return { forgotten, skippedHigherHelpful, pairs: audit }
}

function parseMetadata(raw: string | null): Record<string, unknown> {
  if (!raw) return {}
  try {
    return JSON.parse(raw) as Record<string, unknown>
  } catch {
    return {}
  }
}

/**
 * Batch update staleness_days and quality_score for all knowledge documents.
 */
export function decayStaleKnowledge(db: Database.Database): { updated: number } {
  const rows = db
    .prepare('SELECT id, source_type, content, content_hash, created_at, usage_count FROM knowledge_documents')
    .all() as Array<{
    id: string
    source_type: string
    content: string
    content_hash: string
    created_at: string
    usage_count: number
  }>

  const update = db.prepare('UPDATE knowledge_documents SET staleness_days = ?, quality_score = ? WHERE id = ?')

  let updated = 0
  db.transaction(() => {
    for (const row of rows) {
      const stalenessDays = calculateStalenessDays(row.created_at)
      const doc: KnowledgeDocument = {
        id: row.id,
        sourceType: row.source_type as KnowledgeSourceType,
        sourceId: '',
        title: '',
        content: row.content,
        contentHash: row.content_hash,
        chunkIndex: 0,
        createdAt: row.created_at,
        updatedAt: row.created_at,
        usageCount: row.usage_count,
      }
      const qualityScore = calculateQualityScore(doc)
      update.run(stalenessDays, qualityScore, row.id)
      updated++
    }
  })()

  log.info('Knowledge staleness decay completed', { updated })
  return { updated }
}
