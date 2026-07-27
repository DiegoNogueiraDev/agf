/*!
 * ingest-crosslink — creates related_to edges between a new fact and existing facts.
 * Task node_2adeea8c6717.
 *
 * WHY: After ingesting a new memory fact, linking it to semantically related existing
 * facts enables graph-based retrieval across the knowledge base. Term-overlap is a
 * cheap, token-free proxy for semantic similarity.
 * Idempotent: PRIMARY KEY on (from_id, to_id, relation) prevents duplicate edges.
 *
 * Composes with: memory-reader.ts (writeMemory caller), knowledge-lint.ts.
 * Tables: memory_facts (id, content), memory_edges (from_id, to_id, relation).
 */

import type { Database } from 'better-sqlite3'

const TOP_K = 5
const MIN_SHARED_TERMS = 1
const STOP_WORDS = new Set(['the', 'a', 'an', 'and', 'or', 'of', 'to', 'in', 'is', 'it', 'for', 'on', 'with'])

export interface CrossLinkResult {
  linked: string[]
  edgesCreated: number
}

interface FactRow {
  id: string
  content: string
}

function tokenize(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter((t) => t.length > 2 && !STOP_WORDS.has(t)),
  )
}

function overlap(a: Set<string>, b: Set<string>): number {
  let count = 0
  for (const t of a) if (b.has(t)) count++
  return count
}

// ---------------------------------------------------------------------------
// Under-linked entity detection (lazy-ingest detector)
// ---------------------------------------------------------------------------

export interface UnderLinkedOptions {
  /**
   * Minimum number of facts an entity must appear in to be considered candidate.
   * Default: 3.
   */
  minFacts?: number
}

export interface UnderLinkedResult {
  /** Entities with ≥minFacts occurrences across facts but edge degree 0. */
  underLinkedEntities: string[]
}

/**
 * Detect entities (significant terms) that appear in ≥minFacts facts but have
 * zero edges in memory_edges — symptom of lazy ingest (term referenced everywhere
 * but never cross-linked).
 *
 * An entity "has edges" if ANY fact containing that term is the from_id or to_id
 * of at least one memory_edge row.
 */
export function detectUnderLinkedEntities(db: Database, opts: UnderLinkedOptions = {}): UnderLinkedResult {
  const minFacts = opts.minFacts ?? 3

  const facts = db.prepare('SELECT id, content FROM memory_facts').all() as FactRow[]

  // Count how many facts each term appears in
  const termFacts = new Map<string, Set<string>>()
  for (const fact of facts) {
    for (const term of tokenize(fact.content)) {
      let s = termFacts.get(term)
      if (!s) {
        s = new Set()
        termFacts.set(term, s)
      }
      s.add(fact.id)
    }
  }

  // Collect fact ids that have at least one edge (from or to)
  interface IdRow {
    id: string
  }
  const linkedIds = new Set<string>()
  const fromRows = db.prepare('SELECT DISTINCT from_id AS id FROM memory_edges').all() as IdRow[]
  const toRows = db.prepare('SELECT DISTINCT to_id AS id FROM memory_edges').all() as IdRow[]
  for (const r of fromRows) linkedIds.add(r.id)
  for (const r of toRows) linkedIds.add(r.id)

  const underLinkedEntities: string[] = []
  for (const [term, factIds] of termFacts) {
    if (factIds.size < minFacts) continue
    // Under-linked if NONE of the facts containing this term has an edge
    const anyLinked = [...factIds].some((id) => linkedIds.has(id))
    if (!anyLinked) underLinkedEntities.push(term)
  }

  return { underLinkedEntities }
}

/** Link nodeId to existing memory_facts by term overlap. Idempotent (PK dedup). */
export function crossLinkOnIngest(db: Database, nodeId: string): CrossLinkResult {
  const sourceRow = db.prepare('SELECT id, content FROM memory_facts WHERE id = ?').get(nodeId) as FactRow | undefined
  if (!sourceRow) return { linked: [], edgesCreated: 0 }

  const sourceTerms = tokenize(sourceRow.content)
  if (sourceTerms.size === 0) return { linked: [], edgesCreated: 0 }

  const others = db.prepare('SELECT id, content FROM memory_facts WHERE id != ?').all(nodeId) as FactRow[]

  const scored = others
    .map((row) => ({ id: row.id, score: overlap(sourceTerms, tokenize(row.content)) }))
    .filter((r) => r.score >= MIN_SHARED_TERMS)
    .sort((a, b) => b.score - a.score)
    .slice(0, TOP_K)

  const insert = db.prepare('INSERT OR IGNORE INTO memory_edges (from_id, to_id, relation) VALUES (?, ?, ?)')
  let edgesCreated = 0
  const linked: string[] = []

  for (const { id } of scored) {
    const result = insert.run(nodeId, id, 'related_to')
    if (result.changes > 0) edgesCreated++
    linked.push(id)
  }

  return { linked, edgesCreated }
}
