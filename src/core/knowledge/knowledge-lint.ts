/*!
 * knowledge-lint — pure read-only lint of knowledge_documents + memory_facts.
 * Tasks node_9f4f319b96c3, node_5d11a4f57b57, node_1ee9ba3287d5.
 *
 * WHY: Audits knowledge quality without mutation; findings feed downstream
 * cleanup tasks. Detects: empty_content, low_confidence (claim-tier facts),
 * orphan (entity in ≥2 docs with no edges), entity_drift (same entity, two
 * spellings), contradiction (same semantic key with conflicting values via
 * runDialecticEngine). Zero deletions — callers decide what to act on.
 *
 * Composes with: heal-knowledge.ts (mutating sibling), ingest-crosslink.ts,
 *                epistemic-mix.ts (TierNode/computeTierDistribution),
 *                dialectic-engine.ts (conflict detection, depth 2).
 */

import type { Database } from 'better-sqlite3'
import { runDialecticEngine, type DialecticFact } from '../memory/dialectic-engine.js'

export interface KnowledgeFinding {
  id: string
  reason: string
  detail?: string
}

export interface KnowledgeLintResult {
  findings: KnowledgeFinding[]
  scanned: number
  deleted: number
}

interface DocRow {
  id: string
  content: string
  created_at: string
  last_accessed_at: string | null
}

interface FactRow {
  id: string
  content: string
  tier?: string
  updated_at?: string
}

/** Extract a canonical key from fact content (e.g. 'X=true' → 'x', 'foo: bar' → 'foo'). */
function extractFactKey(content: string): string | null {
  const m = content.match(/^([A-Za-z_][\w.-]*)\s*[=:]/)
  return m ? m[1].toLowerCase() : null
}

function tableExists(db: Database, name: string): boolean {
  return !!db.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name=?`).get(name)
}

/** Normalise a token for entity-drift detection: lowercase + strip hyphens/underscores. */
function normalise(s: string): string {
  return s.toLowerCase().replace(/[-_]/g, '')
}

/** Extract candidate entity tokens (CamelCase or hyphenated, length ≥ 4). */
function extractEntities(text: string): string[] {
  const camel = text.match(/[A-Z][a-z]+(?:[A-Z][a-z]+)+/g) ?? []
  const hyph = text.match(/[a-z]+-[a-z]+/g) ?? []
  return [...camel, ...hyph]
}

/** Read-only lint of knowledge_documents + memory_facts. Never deletes. */
export function lintKnowledge(db: Database): KnowledgeLintResult {
  if (!tableExists(db, 'knowledge_documents')) return { findings: [], scanned: 0, deleted: 0 }

  const rows = db.prepare('SELECT id, content, created_at, last_accessed_at FROM knowledge_documents').all() as DocRow[]
  const findings: KnowledgeFinding[] = []

  // 1. Empty content
  for (const row of rows) {
    if (!row.content || row.content.trim().length === 0) {
      findings.push({ id: row.id, reason: 'empty_content' })
    }
  }

  // 2. low_confidence — claim-tier facts in memory_facts
  if (tableExists(db, 'memory_facts')) {
    const facts = db.prepare('SELECT id, content, tier FROM memory_facts').all() as FactRow[]
    for (const f of facts) {
      if (!f.tier || f.tier === 'claim') {
        findings.push({ id: f.id, reason: 'low_confidence', detail: 'tier:claim' })
      }
    }

    // 3. orphan — fact/entity present in ≥2 docs with no edges
    const hasEdges = tableExists(db, 'memory_edges')
    for (const f of facts) {
      if (hasEdges) {
        const edgeCount = (
          db.prepare('SELECT COUNT(*) as n FROM memory_edges WHERE from_id = ? OR to_id = ?').get(f.id, f.id) as {
            n: number
          }
        ).n
        if (edgeCount === 0) {
          findings.push({ id: f.id, reason: 'orphan' })
        }
      } else {
        findings.push({ id: f.id, reason: 'orphan' })
      }
    }
  }

  // 4. contradiction — semantic key conflicts via runDialecticEngine (depth 2)
  if (tableExists(db, 'memory_facts')) {
    const hasUpdatedAt = !!(db.prepare('PRAGMA table_info(memory_facts)').all() as { name: string }[]).find(
      (c) => c.name === 'updated_at',
    )
    const factsQuery = hasUpdatedAt
      ? 'SELECT id, content, updated_at FROM memory_facts'
      : 'SELECT id, content FROM memory_facts'
    const facts = db.prepare(factsQuery).all() as FactRow[]
    // Group facts by extracted key; each group becomes a DialecticFact batch
    const grouped = new Map<string, DialecticFact[]>()
    for (const f of facts) {
      const key = extractFactKey(f.content)
      if (!key) continue
      const entry: DialecticFact = { id: key, content: f.content, updatedAt: f.updated_at ?? f.id }
      if (!grouped.has(key)) grouped.set(key, [])
      grouped.get(key)!.push(entry)
    }
    for (const [key, group] of grouped) {
      if (group.length < 2) continue
      const result = runDialecticEngine({ facts: group, depth: 2 })
      if (result.conflicts && result.conflicts.length > 0) {
        findings.push({ id: key, reason: 'contradiction', detail: result.conflicts.join('; ') })
      }
    }
  }

  // 5. entity_drift — same entity with ≥2 spellings across docs
  const entityVariants = new Map<string, Set<string>>() // normalised → Set<original>
  for (const row of rows) {
    for (const ent of extractEntities(row.content)) {
      const key = normalise(ent)
      if (!entityVariants.has(key)) entityVariants.set(key, new Set())
      entityVariants.get(key)!.add(ent)
    }
  }
  for (const [key, variants] of entityVariants) {
    if (variants.size >= 2) {
      findings.push({
        id: key,
        reason: 'entity_drift',
        detail: [...variants].join(' vs '),
      })
    }
  }

  return { findings, scanned: rows.length, deleted: 0 }
}
