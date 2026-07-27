/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * Knowledge Packager — export/import knowledge packages for collaboration.
 *
 * Enables sharing accumulated RAG knowledge between project instances via
 * portable JSON packages containing documents, relations, memories, and
 * translation memory entries.
 */

import type Database from 'better-sqlite3'
import { readAllMemories, writeMemory, listMemories } from '../memory/memory-reader.js'
import { generateId } from '../utils/id.js'
import { now } from '../utils/time.js'
import { createLogger } from '../utils/logger.js'
import { McpGraphError } from '../utils/errors.js'
import {
  KnowledgePackageSchema,
  type KnowledgePackage,
  type KnowledgeDocumentExport,
  type KnowledgeRelationExport,
  type MemoryExport,
  type TranslationMemoryExport,
} from '../../schemas/knowledge-package.schema.js'

import { listPheromoneTrails, mergeImportedTau, type PheromoneTrailRow } from '../economy/mmas-pheromone.js'
import { queryEpisodicOutcomes, insertEpisodicOutcome, type EpisodicOutcome } from '../store/episodic-outcomes-store.js'
import { DecisionTableStore, type CompiledDecision } from '../learning/decision-table-store.js'

const log = createLogger({ layer: 'core', source: 'knowledge-packager.ts' })

// ── Types ──────────────────────────────────────────────

export interface ExportOptions {
  sources?: string[]
  minQuality?: number
  includeMemories?: boolean
  includeTranslationMemory?: boolean
  includeRelations?: boolean
}

export interface ExportResult {
  package: KnowledgePackage
  stats: {
    documents: number
    memories: number
    relations: number
    translationEntries: number
  }
}

export interface ImportResult {
  documentsImported: number
  documentsSkipped: number
  memoriesImported: number
  memoriesSkipped: number
  relationsImported: number
  translationEntriesImported: number
}

export interface ImportPreview {
  newDocuments: number
  existingDocuments: number
  newMemories: number
  existingMemories: number
  sourceTypes: string[]
}

// ── Row types for raw DB queries ───────────────────────

interface KnowledgeDocRow {
  id: string
  source_type: string
  source_id: string
  title: string
  content: string
  content_hash: string
  chunk_index: number
  metadata: string | null
  quality_score: number | null
  created_at: string
  updated_at: string
}

interface KnowledgeRelationRow {
  id: string
  from_doc_id: string
  to_doc_id: string
  relation: string
  score: number
  created_at: string
}

interface TranslationMemoryRow {
  id: string
  construct_id: string
  source_language: string
  target_language: string
  confidence_boost: number
  acceptance_count: number
  correction_count: number
  created_at: string
  updated_at: string
}

// ── Export ──────────────────────────────────────────────

/** Export knowledge documents, relations, memories, and translation memory as a portable package. */
export async function exportKnowledge(
  db: Database.Database,
  basePath: string,
  options?: ExportOptions,
): Promise<ExportResult> {
  const includeMemories = options?.includeMemories ?? true
  const includeTranslationMemory = options?.includeTranslationMemory ?? true
  const includeRelations = options?.includeRelations ?? true
  const minQuality = options?.minQuality ?? 0

  log.info('knowledge-packager:export:start', {
    sources: options?.sources?.join(','),
    minQuality,
    includeMemories,
    includeRelations,
    includeTranslationMemory,
  })

  // 1. Query knowledge_documents
  const documents = queryDocuments(db, options?.sources, minQuality)

  // 2. Query relations for exported document IDs
  let relations: KnowledgeRelationExport[] = []
  if (includeRelations && documents.length > 0) {
    relations = queryRelations(db, documents)
  }

  // 3. Read memories
  let memories: MemoryExport[] = []
  if (includeMemories) {
    const projectMemories = await readAllMemories(basePath)
    memories = projectMemories.map((m) => ({
      name: m.name,
      content: m.content,
    }))
  }

  // 4. Query translation memory
  let translationMemory: TranslationMemoryExport[] = []
  if (includeTranslationMemory) {
    translationMemory = queryTranslationMemory(db)
  }

  // 5. Build manifest
  const sourceTypes = [...new Set(documents.map((d) => d.sourceType))]
  const projectName = getProjectName(db)

  const pkg: KnowledgePackage = {
    version: '1.0',
    manifest: {
      projectName,
      exportedAt: now(),
      documentCount: documents.length,
      memoryCount: memories.length,
      sourceTypes,
      qualityThreshold: minQuality,
    },
    documents,
    relations: relations.length > 0 ? relations : undefined,
    memories: memories.length > 0 ? memories : undefined,
    translationMemory: translationMemory.length > 0 ? translationMemory : undefined,
  }

  const stats = {
    documents: documents.length,
    memories: memories.length,
    relations: relations.length,
    translationEntries: translationMemory.length,
  }

  log.info('knowledge-packager:export:done', stats)
  return { package: pkg, stats }
}

// ── Import ─────────────────────────────────────────────

/** Import a knowledge package, deduplicating documents by content hash and merging translation memory. */
export async function importKnowledge(
  db: Database.Database,
  basePath: string,
  pkg: KnowledgePackage,
): Promise<ImportResult> {
  // Validate package
  const parsed = KnowledgePackageSchema.safeParse(pkg)
  if (!parsed.success) {
    const errorMsg = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')
    throw new McpGraphError(`Invalid knowledge package: ${errorMsg}`)
  }

  log.info('knowledge-packager:import:start', {
    documentCount: pkg.manifest.documentCount,
    memoryCount: pkg.manifest.memoryCount,
    projectName: pkg.manifest.projectName,
  })

  const resultValue: ImportResult = {
    documentsImported: 0,
    documentsSkipped: 0,
    memoriesImported: 0,
    memoriesSkipped: 0,
    relationsImported: 0,
    translationEntriesImported: 0,
  }

  // 1. Import documents (dedup by content_hash)
  const hashToNewId = new Map<string, string>()

  db.transaction(() => {
    for (const doc of pkg.documents) {
      const existing = db.prepare('SELECT id FROM knowledge_documents WHERE content_hash = ?').get(doc.contentHash) as
        { id: string } | undefined

      if (existing) {
        hashToNewId.set(doc.contentHash, existing.id)
        resultValue.documentsSkipped++
        continue
      }

      const id = generateId('kdoc')
      const timestamp = now()
      hashToNewId.set(doc.contentHash, id)

      db.prepare(
        `INSERT INTO knowledge_documents
          (id, source_type, source_id, title, content, content_hash, chunk_index, metadata, quality_score, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        id,
        doc.sourceType,
        doc.sourceId,
        doc.title,
        doc.content,
        doc.contentHash,
        0,
        doc.metadata ? JSON.stringify(doc.metadata) : null,
        doc.qualityScore ?? null,
        doc.createdAt,
        timestamp,
      )

      resultValue.documentsImported++
    }
  })()

  // 2. Import relations
  const relations = pkg.relations ?? []
  if (relations.length > 0) {
    // Build a map from sourceId to new doc IDs for relation resolution
    const sourceIdToDocId = buildSourceIdToDocIdMap(db)

    db.transaction(() => {
      for (const rel of relations) {
        const fromId = sourceIdToDocId.get(rel.fromDocSourceId)
        const toId = sourceIdToDocId.get(rel.toDocSourceId)

        if (!fromId || !toId) continue

        // Check if relation already exists
        const existing = db
          .prepare('SELECT 1 FROM knowledge_relations WHERE from_doc_id = ? AND to_doc_id = ? AND relation = ?')
          .get(fromId, toId, rel.relation)

        if (existing) continue

        const id = generateId('krel')
        const timestamp = now()

        db.prepare(
          `INSERT INTO knowledge_relations (id, from_doc_id, to_doc_id, relation, score, created_at)
           VALUES (?, ?, ?, ?, ?, ?)`,
        ).run(id, fromId, toId, rel.relation, rel.score, timestamp)

        resultValue.relationsImported++
      }
    })()
  }

  // 3. Import memories
  if (pkg.memories && pkg.memories.length > 0) {
    const existingMemories = new Set(await listMemories(basePath))

    for (const mem of pkg.memories) {
      if (existingMemories.has(mem.name)) {
        resultValue.memoriesSkipped++
        continue
      }

      await writeMemory(basePath, mem.name, mem.content)
      resultValue.memoriesImported++
    }
  }

  // 4. Import translation memory
  const tmEntries = pkg.translationMemory ?? []
  if (tmEntries.length > 0) {
    db.transaction(() => {
      for (const tm of tmEntries) {
        const id = `${tm.constructId}:${tm.sourceLanguage}:${tm.targetLanguage}`
        const timestamp = now()

        db.prepare(
          `INSERT INTO translation_memory (id, construct_id, source_language, target_language, acceptance_count, correction_count, confidence_boost, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(id) DO UPDATE SET
             acceptance_count = acceptance_count + excluded.acceptance_count,
             correction_count = correction_count + excluded.correction_count,
             confidence_boost = confidence_boost + excluded.confidence_boost,
             updated_at = ?`,
        ).run(
          id,
          tm.constructId,
          tm.sourceLanguage,
          tm.targetLanguage,
          tm.acceptanceCount,
          tm.correctionCount,
          tm.confidenceBoost,
          timestamp,
          timestamp,
          timestamp,
        )

        resultValue.translationEntriesImported++
      }
    })()
  }

  log.info('knowledge-packager:import:done', {
    documentsImported: resultValue.documentsImported,
    documentsSkipped: resultValue.documentsSkipped,
    memoriesImported: resultValue.memoriesImported,
    memoriesSkipped: resultValue.memoriesSkipped,
    relationsImported: resultValue.relationsImported,
    translationEntriesImported: resultValue.translationEntriesImported,
  })

  return resultValue
}

// ── Preview ────────────────────────────────────────────

/** Preview what an import would do without applying changes. */
export async function previewImport(
  db: Database.Database,
  basePath: string,
  pkg: KnowledgePackage,
): Promise<ImportPreview> {
  const parsed = KnowledgePackageSchema.safeParse(pkg)
  if (!parsed.success) {
    const errorMsg = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')
    throw new McpGraphError(`Invalid knowledge package: ${errorMsg}`)
  }

  let newDocuments = 0
  let existingDocuments = 0

  for (const doc of pkg.documents) {
    const exists = db.prepare('SELECT 1 FROM knowledge_documents WHERE content_hash = ? LIMIT 1').get(doc.contentHash)

    if (exists) {
      existingDocuments++
    } else {
      newDocuments++
    }
  }

  let newMemories = 0
  let existingMemories = 0

  if (pkg.memories && pkg.memories.length > 0) {
    const existingNames = new Set(await listMemories(basePath))

    for (const mem of pkg.memories) {
      if (existingNames.has(mem.name)) {
        existingMemories++
      } else {
        newMemories++
      }
    }
  }

  const sourceTypes = [...new Set(pkg.documents.map((d) => d.sourceType))]

  return {
    newDocuments,
    existingDocuments,
    newMemories,
    existingMemories,
    sourceTypes,
  }
}

// ── Private helpers ────────────────────────────────────

function queryDocuments(
  db: Database.Database,
  sources: string[] | undefined,
  minQuality: number,
): KnowledgeDocumentExport[] {
  let sql = 'SELECT * FROM knowledge_documents WHERE 1=1'
  const params: unknown[] = []

  if (sources && sources.length > 0) {
    const placeholders = sources.map(() => '?').join(', ')
    sql += ` AND source_type IN (${placeholders})`
    params.push(...sources)
  }

  if (minQuality > 0) {
    sql += ' AND COALESCE(quality_score, 0) >= ?'
    params.push(minQuality)
  }

  sql += ' ORDER BY created_at DESC'

  const rows = db.prepare(sql).all(...params) as KnowledgeDocRow[]

  return rows.map((row) => ({
    sourceType: row.source_type,
    sourceId: row.source_id,
    title: row.title,
    content: row.content,
    contentHash: row.content_hash,
    metadata: row.metadata ? JSON.parse(row.metadata) : undefined,
    qualityScore: row.quality_score ?? undefined,
    createdAt: row.created_at,
  }))
}

function queryRelations(db: Database.Database, documents: KnowledgeDocumentExport[]): KnowledgeRelationExport[] {
  // Build a set of source_ids from exported docs for matching
  const sourceIds = new Set(documents.map((d) => d.sourceId))

  // Get all relations where both sides have docs in our export set
  const rows = db
    .prepare(
      `SELECT kr.*,
              kd_from.source_id as from_source_id,
              kd_to.source_id as to_source_id
       FROM knowledge_relations kr
       JOIN knowledge_documents kd_from ON kd_from.id = kr.from_doc_id
       JOIN knowledge_documents kd_to ON kd_to.id = kr.to_doc_id`,
    )
    .all() as Array<KnowledgeRelationRow & { from_source_id: string; to_source_id: string }>

  return rows
    .filter((r) => sourceIds.has(r.from_source_id) && sourceIds.has(r.to_source_id))
    .map((row) => ({
      fromDocSourceId: row.from_source_id,
      toDocSourceId: row.to_source_id,
      relation: row.relation,
      score: row.score,
    }))
}

function queryTranslationMemory(db: Database.Database): TranslationMemoryExport[] {
  try {
    const rows = db.prepare('SELECT * FROM translation_memory').all() as TranslationMemoryRow[]

    return rows.map((row) => ({
      constructId: row.construct_id,
      sourceLanguage: row.source_language,
      targetLanguage: row.target_language,
      confidenceBoost: row.confidence_boost,
      acceptanceCount: row.acceptance_count,
      correctionCount: row.correction_count,
    }))
  } catch {
    // translation_memory table may not exist
    log.debug('knowledge-packager:no-translation-memory-table')
    return []
  }
}

function getProjectName(db: Database.Database): string {
  try {
    const row = db.prepare('SELECT name FROM projects LIMIT 1').get() as { name: string } | undefined
    return row?.name ?? 'unknown'
  } catch {
    return 'unknown'
  }
}

function buildSourceIdToDocIdMap(db: Database.Database): Map<string, string> {
  const rows = db.prepare('SELECT id, source_id FROM knowledge_documents').all() as Array<{
    id: string
    source_id: string
  }>

  const map = new Map<string, string>()
  for (const row of rows) {
    map.set(row.source_id, row.id)
  }
  return map
}

// ── Learning federation (node_7912a6136632 — contract node_dc38e62ffc75) ─────
// Bundle do APRENDIZADO OPERACIONAL (≠ knowledge docs, exportados acima):
// pheromone_trails + episodic_outcomes + decision-table — o que a colônia
// aprendeu fazendo, portável entre projetos. Readers existentes, zero SQL novo
// além do escopo por project_id; tabela ausente ⇒ seção vazia (never throw).

/** Versão do schema do bundle — import recusa versão desconhecida. */
export const LEARNING_BUNDLE_VERSION = 1

export interface LearningBundle {
  schemaVersion: typeof LEARNING_BUNDLE_VERSION
  sourceProject: string
  exportedAt: string
  pheromones: readonly PheromoneTrailRow[]
  episodicOutcomes: readonly EpisodicOutcome[]
  decisions: readonly CompiledDecision[]
}

/**
 * Exporta o aprendizado operacional do projeto num JSON puro serializável.
 * Cada seção degrada a [] quando a tabela não existe (store legado) — o
 * export nunca falha por schema incompleto.
 */
export function exportLearning(db: Database.Database, projectId: string): LearningBundle {
  const section = <T>(read: () => readonly T[], name: string): readonly T[] => {
    try {
      return read()
    } catch (err) {
      log.warn('exportLearning: seção indisponível — segue vazia', {
        section: name,
        error: err instanceof Error ? err.message : String(err),
      })
      return []
    }
  }

  return {
    schemaVersion: LEARNING_BUNDLE_VERSION,
    sourceProject: projectId,
    exportedAt: new Date().toISOString(),
    pheromones: section(() => listPheromoneTrails(db, projectId), 'pheromones'),
    episodicOutcomes: section(() => queryEpisodicOutcomes(db), 'episodicOutcomes'),
    decisions: section(() => new DecisionTableStore(db, projectId).list(), 'decisions'),
  }
}

/** Erro tipado: bundle com schemaVersion desconhecida — recusado ANTES de qualquer escrita. */
export class LearningBundleVersionError extends McpGraphError {
  constructor(got: unknown) {
    super(`LearningBundle schemaVersion desconhecida: ${String(got)} (esperado ${LEARNING_BUNDLE_VERSION})`)
    this.name = 'LearningBundleVersionError'
  }
}

export interface ImportLearningOptions {
  /** Só importa trilhas/outcomes cuja key/tags casa com alguma destas tags (anti-poluição cross-domínio). */
  tags?: string[]
  /** Peso da fonte (0..1] — repassa ao merge MMAS. */
  sourceWeight?: number
  /** Injetável p/ determinismo. */
  nowMs?: number
}

export interface ImportSectionResult {
  imported: number
  skipped: number
}

export interface ImportLearningResult {
  pheromones: ImportSectionResult
  episodicOutcomes: ImportSectionResult
  decisions: ImportSectionResult
}

const matchesTags = (value: string, tags: string[] | undefined): boolean =>
  !tags || tags.length === 0 || tags.some((t) => value.includes(t))

/**
 * Importa um LearningBundle com merge decay-aware MMAS (node_7ec4aef641d0):
 * pheromone via mergeImportedTau (desconto idade+fonte, clamp, nunca rebaixa
 * local); outcomes idempotentes por id (INSERT OR IGNORE do store); decisão
 * local SEMPRE vence (só entra chave ausente — re-import não infla
 * occurrences). schemaVersion desconhecida ⇒ erro tipado antes de escrever.
 */
export function importLearning(
  db: Database.Database,
  projectId: string,
  bundle: LearningBundle,
  opts: ImportLearningOptions = {},
): ImportLearningResult {
  if (bundle.schemaVersion !== LEARNING_BUNDLE_VERSION) {
    throw new LearningBundleVersionError(bundle.schemaVersion)
  }
  const nowMs = opts.nowMs ?? Date.now()

  const pheromones: ImportSectionResult = { imported: 0, skipped: 0 }
  for (const trail of bundle.pheromones) {
    const eligible = matchesTags(trail.key, opts.tags)
    const wrote = eligible && mergeImportedTau(db, projectId, trail, { nowMs, sourceWeight: opts.sourceWeight })
    if (wrote) pheromones.imported++
    else pheromones.skipped++
  }

  const episodicOutcomes: ImportSectionResult = { imported: 0, skipped: 0 }
  for (const outcome of bundle.episodicOutcomes) {
    if (!matchesTags(outcome.tags, opts.tags)) {
      episodicOutcomes.skipped++
      continue
    }
    const before = (
      db.prepare('SELECT COUNT(*) AS n FROM episodic_outcomes WHERE id = ?').get(outcome.id) as {
        n: number
      }
    ).n
    insertEpisodicOutcome(db, outcome) // INSERT OR IGNORE — idempotente por id
    if (before === 0) episodicOutcomes.imported++
    else episodicOutcomes.skipped++
  }

  const decisions: ImportSectionResult = { imported: 0, skipped: 0 }
  const table = new DecisionTableStore(db, projectId)
  for (const decision of bundle.decisions) {
    if (table.get(decision.key)) {
      decisions.skipped++ // local SEMPRE vence — put() em conflito inflaria occurrences
      continue
    }
    table.put({ key: decision.key, decision: decision.decision, successRate: decision.successRate })
    decisions.imported++
  }

  return { pheromones, episodicOutcomes, decisions }
}
