/*!
 * source-immutability.ts — Immutable source store with supersedes-edge support.
 *
 * Enforces that once a source (identified by string id) is written, its content
 * is immutable. Rewriting with different content throws ProvenanceError. Identical
 * rewrites are idempotent (no-op). Corrections must create a new source and declare
 * a `supersedes` edge pointing from the corrector to the superseded source.
 *
 * Why: provenance integrity — a source that can be silently mutated is no receipt
 * at all. Corrections are intentional and must leave an audit trail via supersedes.
 */

/** Typed error for provenance violations. */
export class ProvenanceError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ProvenanceError'
  }
}

/** Minimal in-memory store passed around by reference. */
export interface SourceStore {
  sources: Map<string, string>
  edges: Array<{ from: string; to: string; type: 'supersedes' }>
}

/**
 * Write a source to the store.
 * - New id: writes without error.
 * - Existing id, same content: no-op (idempotent).
 * - Existing id, different content: throws ProvenanceError.
 */
export function writeSource(store: SourceStore, id: string, content: string): void {
  const existing = store.sources.get(id)
  if (existing === undefined) {
    store.sources.set(id, content)
    return
  }
  if (existing === content) return
  throw new ProvenanceError(
    `Source "${id}" is immutable. Attempted rewrite with different content. ` +
      `Use supersedesSource() to create a corrected source with an audit trail.`,
  )
}

/**
 * Add a corrected source that supersedes an existing one.
 * Writes `newId → newContent` and creates a `supersedes` edge from new to old.
 * Throws ProvenanceError if `supersededId` does not exist.
 */
export function supersedesSource(store: SourceStore, newId: string, newContent: string, supersededId: string): void {
  if (!store.sources.has(supersededId)) {
    throw new ProvenanceError(`Cannot supersede "${supersededId}": source does not exist in the store.`)
  }
  writeSource(store, newId, newContent)
  store.edges.push({ from: newId, to: supersededId, type: 'supersedes' })
}
