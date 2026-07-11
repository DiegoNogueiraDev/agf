/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

import type { Database } from 'better-sqlite3'
import { createHash } from 'node:crypto'
import { createLogger } from '../utils/logger.js'

const log = createLogger({ layer: 'core', source: 'ccr-store' })

/**
 * Shared CCR retrieve-marker format. A CCR-dropped value carries this marker so
 * the original can be retrieved later via its hash. Both `lossy-gate.ts` and the
 * economy orchestrator append it as `\n${ccrMarker(hash)}` to keep ONE format.
 *
 * @param hash The sha256 hex digest returned by {@link CcrStore.put}.
 * @returns The marker string `⟨ccr:HASH⟩`.
 */
export function ccrMarker(hash: string): string {
  return `⟨ccr:${hash}⟩`
}

/** Matches a `⟨ccr:HASH⟩` marker so the bare hash can be extracted for lookup. */
const CCR_MARKER_RE = /^⟨ccr:([0-9a-fA-F]+)⟩$/

/**
 * Strip a `⟨ccr:HASH⟩` wrapper down to its bare hash. A bare hash (or any other
 * string) is returned unchanged, so this is safe to apply to every lookup handle.
 */
export function unwrapCcrHash(handle: string): string {
  const m = CCR_MARKER_RE.exec(handle.trim())
  return m ? m[1] : handle
}

/**
 * Local-first Compress-Cache-Retrieve (CCR) store.
 *
 * Caches an original (uncompressed) string keyed by a deterministic sha256 of
 * its content, so it can be retrieved byte-for-byte later. This is the
 * foundation of agf's reversible compression.
 *
 * Additive only: manages its own `ccr_store` table via `CREATE TABLE IF NOT
 * EXISTS` and never touches the project graph schema.
 */
export class CcrStore {
  private readonly db: Database

  /**
   * @param db An open `better-sqlite3` handle (the project DB, or an in-memory
   *   DB in tests). The `ccr_store` table is created if it does not yet exist.
   */
  constructor(db: Database) {
    this.db = db
    this.db.exec(
      `CREATE TABLE IF NOT EXISTS ccr_store (
        hash TEXT PRIMARY KEY,
        original TEXT NOT NULL,
        content_type TEXT,
        bytes INTEGER NOT NULL,
        created_at TEXT NOT NULL
      )`,
    )
  }

  /**
   * Cache an original string and return its sha256 hash. Idempotent: putting
   * the same original twice yields the same hash and a single stored row
   * (`INSERT OR IGNORE`).
   *
   * @param original The uncompressed string to cache.
   * @param contentType Optional content-type tag (e.g. a MIME type).
   * @returns The sha256 hex digest of `original` (the storage key).
   */
  put(original: string, contentType?: string): string {
    const hash = CcrStore.hashOf(original)
    const bytes = Buffer.byteLength(original, 'utf8')
    const result = this.db
      .prepare(
        `INSERT INTO ccr_store (hash, original, content_type, bytes, created_at)
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(hash) DO UPDATE SET content_type = COALESCE(excluded.content_type, content_type)`,
      )
      .run(hash, original, contentType ?? null, bytes, new Date().toISOString())
    if (result.changes > 0) {
      log.debug('ccr put', { hash, bytes })
    }
    return hash
  }

  /**
   * Retrieve a previously cached original by its hash.
   *
   * @param hash The sha256 hex digest returned by {@link put}.
   * @returns The original string, or `null` if no row matches.
   */
  get(hash: string): string | null {
    // AUDIT-046: accept both the bare hash and the `⟨ccr:HASH⟩` marker form that
    // `agf retrieve` receives, so a copied marker round-trips to the original.
    const bare = unwrapCcrHash(hash)
    const row = this.db.prepare('SELECT original FROM ccr_store WHERE hash = ?').get(bare) as
      { original: string } | undefined
    return row ? row.original : null
  }

  /** Deterministic sha256 hex digest of a string (utf8-encoded). */
  static hashOf(original: string): string {
    return createHash('sha256').update(original, 'utf8').digest('hex')
  }
}
