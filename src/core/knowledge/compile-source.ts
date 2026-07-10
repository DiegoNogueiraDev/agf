/*!
 * compile-source.ts — compileSource(db, sourceId) → CompiledPage persisted.
 *
 * Compiles a raw source into a structured CompiledPage and upserts it into the
 * `compiled_pages` table. Recompiling the same source increments `version`
 * in-place (no duplicate rows). References from `sources.ref_ids` become
 * `links[]` in the compiled output.
 *
 * Why separate from RAG/retrieve: compile is a write-path transform that
 * normalises content once at ingest; retrieve is the read-path that queries
 * already-compiled pages. Keeping them separate preserves SRP and avoids
 * re-parsing on every query.
 */

import type { Database } from 'better-sqlite3'
import { McpGraphError } from '../utils/errors.js'

export interface CompiledPage {
  sourceId: string
  structured: string
  links: string[]
  version: number
}

interface SourceRow {
  id: string
  content: string
  ref_ids: string
}

interface CompiledRow {
  source_id: string
  structured: string
  links: string
  version: number
}

const CREATE_TABLES = `
  CREATE TABLE IF NOT EXISTS sources (
    id TEXT PRIMARY KEY,
    content TEXT NOT NULL,
    ref_ids TEXT NOT NULL DEFAULT '[]'
  );
  CREATE TABLE IF NOT EXISTS compiled_pages (
    source_id TEXT PRIMARY KEY,
    structured TEXT NOT NULL,
    links TEXT NOT NULL DEFAULT '[]',
    version INTEGER NOT NULL DEFAULT 1
  );
`

/** Provision the `sources`/`compiled_pages` tables on the given db (idempotent). */
export function ensureKnowledgeSourceTables(db: Database): void {
  db.exec(CREATE_TABLES)
}

/** Upsert raw content as a source, ready for `compileSource`. */
export function upsertSource(db: Database, sourceId: string, content: string, refIds: string[] = []): void {
  ensureKnowledgeSourceTables(db)
  db.prepare(
    `
    INSERT INTO sources (id, content, ref_ids)
    VALUES (?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      content = excluded.content,
      ref_ids = excluded.ref_ids
  `,
  ).run(sourceId, content, JSON.stringify(refIds))
}

/**
 * Compile a source into a CompiledPage and persist it.
 * Idempotent: recompiling increments version, never inserts a duplicate row.
 */
export function compileSource(db: Database, sourceId: string): CompiledPage {
  ensureKnowledgeSourceTables(db)
  const source = db.prepare('SELECT id, content, ref_ids FROM sources WHERE id = ?').get(sourceId) as
    SourceRow | undefined
  if (!source) throw new McpGraphError(`Source not found: ${sourceId}`)

  const links: string[] = JSON.parse(source.ref_ids || '[]')
  const structured = buildStructured(source.content, links)

  const existing = db.prepare('SELECT version FROM compiled_pages WHERE source_id = ?').get(sourceId) as
    Pick<CompiledRow, 'version'> | undefined

  const version = existing ? existing.version + 1 : 1

  db.prepare(
    `
    INSERT INTO compiled_pages (source_id, structured, links, version)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(source_id) DO UPDATE SET
      structured = excluded.structured,
      links = excluded.links,
      version = excluded.version
  `,
  ).run(sourceId, structured, JSON.stringify(links), version)

  return { sourceId, structured, links, version }
}

/** Produce a structured string representation from raw content + link ids. */
function buildStructured(content: string, links: string[]): string {
  const trimmed = content.trim()
  if (links.length === 0) return trimmed
  return `${trimmed}\n\nrefs: ${links.join(', ')}`
}
