import Database from 'better-sqlite3'
import type { CacheEntry, CachePersistence } from './response-cache.js'
import { buildTermVector, cosineSimilarity, deserializeTermVector, serializeTermVector } from './response-cache.js'

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
        ttl_expires_at  INTEGER NOT NULL,
        prompt_terms    TEXT,
        scope_command   TEXT,
        scope_node_id   TEXT
      )
    `)

    // Defesa p/ DBs migrados antes da v127 (código vence _migrations): colunas
    // semânticas são aditivas; ALTER idempotente via catch.
    for (const col of ['prompt_terms TEXT', 'scope_command TEXT', 'scope_node_id TEXT']) {
      try {
        db.exec(`ALTER TABLE llm_response_cache ADD COLUMN ${col}`)
      } catch {
        // coluna já existe
      }
    }

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

// ── Camada semântica sobre a MESMA tabela (contract node_d6746dfc9c6e) ──

export interface SemanticScope {
  command?: string
  nodeId?: string
}

export interface SemanticLookupOptions {
  threshold: number
  scope?: SemanticScope
  /**
   * updatedAt (ms) do node do escopo: entrada gravada ANTES da última mudança
   * do node é stale e nunca é servida (invalidação por mudança de task).
   */
  nodeUpdatedAtMs?: number
}

export interface SemanticHit<V> {
  entry: CacheEntry<V>
  kind: 'semantic'
  similarity: number
  sourceKey: string
}

export interface CacheLookupResult<V> {
  entry: CacheEntry<V>
  kind: 'exact' | 'semantic'
  similarity?: number
  sourceKey?: string
  /** Quantos vetores foram comparados — 0 no caminho exato (AC4). */
  semanticComparisons: number
}

export interface SemanticCapableSqlitePersistence<V> extends SqliteCachePersistence<V> {
  attachSemantic(key: string, prompt: string, scope: SemanticScope): void
}

declare module './response-cache-sqlite.js' {
  interface SqliteCachePersistence<V> {
    attachSemantic(key: string, prompt: string, scope: SemanticScope): void
    readSemantic(prompt: string, opts: SemanticLookupOptions): SemanticHit<V> | undefined
    lookupWithSemanticFallback(
      key: string,
      prompt: string,
      opts: SemanticLookupOptions,
    ): CacheLookupResult<V> | undefined
  }
}

/** Anexa o vetor de termos (e escopo) a uma entrada já gravada. */
SqliteCachePersistence.prototype.attachSemantic = function attachSemantic(
  key: string,
  prompt: string,
  scope: SemanticScope,
): void {
  const db = (this as unknown as { db: Database.Database }).db
  db.prepare(`UPDATE llm_response_cache SET prompt_terms = ?, scope_command = ?, scope_node_id = ? WHERE key = ?`).run(
    serializeTermVector(buildTermVector(prompt)),
    scope.command ?? null,
    scope.nodeId ?? null,
    key,
  )
}

/** Fallback semântico: melhor candidato não-expirado com cosseno ≥ threshold. */
SqliteCachePersistence.prototype.readSemantic = function readSemantic<V>(
  this: SqliteCachePersistence<V>,
  prompt: string,
  opts: SemanticLookupOptions,
): SemanticHit<V> | undefined {
  const result = this.lookupWithSemanticFallback('__no_exact__', prompt, opts)
  return result && result.kind === 'semantic'
    ? { entry: result.entry, kind: 'semantic', similarity: result.similarity!, sourceKey: result.sourceKey! }
    : undefined
}

/** Exato PRIMEIRO (custo zero); miss ⇒ varre vetores do escopo e serve o melhor ≥ threshold. */
SqliteCachePersistence.prototype.lookupWithSemanticFallback = function lookupWithSemanticFallback<V>(
  this: SqliteCachePersistence<V>,
  key: string,
  prompt: string,
  opts: SemanticLookupOptions,
): CacheLookupResult<V> | undefined {
  const exact = this.read(key)
  if (exact) return { entry: exact, kind: 'exact', semanticComparisons: 0 }

  const db = (this as unknown as { db: Database.Database }).db
  const conditions = ['prompt_terms IS NOT NULL']
  const params: unknown[] = []
  if (opts.scope?.command !== undefined) {
    conditions.push('scope_command = ?')
    params.push(opts.scope.command)
  }
  if (opts.scope?.nodeId !== undefined) {
    conditions.push('scope_node_id = ?')
    params.push(opts.scope.nodeId)
  }
  const rows = db
    .prepare(
      `SELECT key, prompt_terms, ttl_expires_at, created_at_ms FROM llm_response_cache WHERE ${conditions.join(' AND ')}`,
    )
    .all(...params) as Array<{ key: string; prompt_terms: string; ttl_expires_at: number; created_at_ms: number }>

  const now = Date.now()
  const removeStmt = db.prepare(`DELETE FROM llm_response_cache WHERE key = ?`)
  const queryVector = buildTermVector(prompt)
  let best: { key: string; similarity: number } | null = null
  let comparisons = 0
  for (const row of rows) {
    // TTL expirado: limpeza física no scan (miss + remoção — AC2 do B.T2).
    if (row.ttl_expires_at <= now) {
      removeStmt.run(row.key)
      continue
    }
    // Node mudou depois da gravação: entrada stale, nunca servir (AC3 do B.T2).
    if (opts.nodeUpdatedAtMs !== undefined && row.created_at_ms < opts.nodeUpdatedAtMs) continue
    comparisons += 1
    const similarity = cosineSimilarity(queryVector, deserializeTermVector(row.prompt_terms))
    if (similarity >= opts.threshold && (!best || similarity > best.similarity)) {
      best = { key: row.key, similarity }
    }
  }
  if (!best) return undefined

  const entry = this.read(best.key)
  if (!entry) return undefined
  return {
    entry,
    kind: 'semantic',
    similarity: best.similarity,
    sourceKey: best.key,
    semanticComparisons: comparisons,
  }
}
