import Database from 'better-sqlite3'
import type { CacheEntry, CachePersistence } from './response-cache.js'

export class SqliteCachePersistence<V> implements CachePersistence<V> {
  private readonly db: Database.Database
  private readonly insert: Database.Statement
  private readonly select: Database.Statement
  private readonly count: Database.Statement
  private readonly remove: Database.Statement

  constructor(db: Database.Database) {
    this.db = db
    db.pragma('journal_mode = WAL')

    // Schema canônico = migration v82 (EPIC-6). CREATE IF NOT EXISTS p/ DBs sem
    // migrations (testes); contra o DB migrado é no-op. Colunas: value_json + ttl_expires_at.
    db.exec(`
      CREATE TABLE IF NOT EXISTS llm_response_cache (
        key             TEXT PRIMARY KEY,
        value_json      TEXT NOT NULL,
        schema_version  INTEGER NOT NULL,
        created_at_ms   INTEGER NOT NULL,
        ttl_expires_at  INTEGER NOT NULL
      )
    `)

    this.insert = db.prepare(
      `INSERT OR REPLACE INTO llm_response_cache (key, value_json, schema_version, created_at_ms, ttl_expires_at)
       VALUES (?, ?, ?, ?, ?)`,
    )
    this.select = db.prepare(
      `SELECT key, value_json, schema_version, created_at_ms, ttl_expires_at FROM llm_response_cache WHERE key = ?`,
    )
    this.count = db.prepare(`SELECT COUNT(*) as count FROM llm_response_cache`)
    this.remove = db.prepare(`DELETE FROM llm_response_cache WHERE key = ?`)
  }

  read(key: string): CacheEntry<V> | undefined {
    const row = this.select.get(key) as
      | { key: string; value_json: string; schema_version: number; created_at_ms: number; ttl_expires_at: number }
      | undefined
    if (!row) return undefined
    if (Date.now() > row.ttl_expires_at) {
      this.remove.run(key)
      return undefined
    }
    return {
      key: row.key,
      value: JSON.parse(row.value_json) as V,
      schemaVersion: row.schema_version,
      createdAtMs: row.created_at_ms,
      expiresAtMs: row.ttl_expires_at,
    }
  }

  write(entry: CacheEntry<V>): void {
    this.insert.run(entry.key, JSON.stringify(entry.value), entry.schemaVersion, entry.createdAtMs, entry.expiresAtMs)
  }

  prune(beforeMs: number): number {
    const result = this.db.prepare(`DELETE FROM llm_response_cache WHERE ttl_expires_at < ?`).run(beforeMs)
    return result.changes
  }

  invalidateBySchema(currentSchemaVersion: number): number {
    const result = this.db.prepare(`DELETE FROM llm_response_cache WHERE schema_version != ?`).run(currentSchemaVersion)
    return result.changes
  }

  clear(): number {
    const result = this.db.prepare(`DELETE FROM llm_response_cache`).run()
    return result.changes
  }

  size(): number {
    const row = this.count.get() as { count: number }
    return row.count
  }
}
