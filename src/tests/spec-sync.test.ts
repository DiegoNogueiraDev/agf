import { describe, it, expect } from 'vitest'
import Database from 'better-sqlite3'
import { SpecStore } from '../core/spec-evolution/spec-store.js'
import { detectSpecImpact, syncSpecToGraph } from '../core/spec-evolution/sync-engine.js'

function createTestDb(): Database.Database {
  const db = new Database(':memory:')
  db.exec(`
    CREATE TABLE IF NOT EXISTS spec_documents (
      id TEXT PRIMARY KEY, project_id TEXT NOT NULL, name TEXT NOT NULL,
      template_name TEXT, file_path TEXT, content_hash TEXT NOT NULL,
      version INTEGER NOT NULL DEFAULT 1, status TEXT NOT NULL DEFAULT 'draft',
      metadata TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS spec_document_versions (
      id TEXT PRIMARY KEY, spec_id TEXT NOT NULL, version INTEGER NOT NULL,
      content TEXT NOT NULL, content_hash TEXT NOT NULL,
      diff_summary TEXT, created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS spec_node_links (
      id TEXT PRIMARY KEY, spec_id TEXT NOT NULL, node_id TEXT NOT NULL,
      section_title TEXT, link_type TEXT NOT NULL, created_at TEXT NOT NULL
    );
  `)
  return db
}

describe('spec_sync', () => {
  it('registers a spec document and returns it', () => {
    const db = createTestDb()
    const store = new SpecStore(db)

    const spec = store.register({
      projectId: 'test-proj',
      name: 'API Spec',
      content: '# API v1\n\nEndpoints...',
    })

    expect(spec.id).toBeDefined()
    expect(spec.name).toBe('API Spec')
    expect(spec.version).toBe(1)
    expect(spec.status).toBe('draft')
  })

  it('syncs spec content and increments version on change', () => {
    const db = createTestDb()
    const store = new SpecStore(db)

    const spec = store.register({
      projectId: 'test-proj',
      name: 'API Spec',
      content: '# API v1',
    })

    const result = syncSpecToGraph(store, spec.id, '# API v2\n\nUpdated endpoints')
    expect(result.changed).toBe(true)
    expect(result.newVersion).toBe(2)

    const updated = store.get(spec.id)
    expect(updated?.version).toBe(2)
  })

  it('detects no change when content hash matches', () => {
    const db = createTestDb()
    const store = new SpecStore(db)

    const spec = store.register({
      projectId: 'test-proj',
      name: 'API Spec',
      content: '# API v1',
    })

    const result = syncSpecToGraph(store, spec.id, '# API v1')
    expect(result.changed).toBe(false)
    expect(result.message).toContain('unchanged')
  })

  it('links spec to nodes via linkNode', () => {
    const db = createTestDb()
    const store = new SpecStore(db)

    const spec = store.register({
      projectId: 'test-proj',
      name: 'API Spec',
      content: '# API v1',
    })

    store.linkNode(spec.id, 'node-123', 'Authentication', 'implements')

    const links = store.getLinksForSpec(spec.id)
    expect(links.length).toBe(1)
    expect(links[0].node_id).toBe('node-123')
    expect(links[0].link_type).toBe('implements')
    expect(links[0].section_title).toBe('Authentication')
  })

  it('detects spec impact from changed node IDs', () => {
    const db = createTestDb()
    const store = new SpecStore(db)

    const spec = store.register({
      projectId: 'test-proj',
      name: 'API Spec',
      content: '# API v1',
    })

    store.linkNode(spec.id, 'node-456', 'Rate Limiting', 'validates')

    const impacts = detectSpecImpact(store, ['node-456'])
    expect(impacts.length).toBe(1)
    expect(impacts[0].specId).toBe(spec.id)
    expect(impacts[0].linkType).toBe('validates')
  })

  it('returns spec version history', () => {
    const db = createTestDb()
    const store = new SpecStore(db)

    const spec = store.register({
      projectId: 'test-proj',
      name: 'API Spec',
      content: '# API v1',
    })

    syncSpecToGraph(store, spec.id, '# API v2')

    const history = store.getHistory(spec.id)
    expect(history.length).toBe(1)
    expect(history[0].version).toBe(1)
    expect(history[0].content).toBe('# API v1')
  })

  it('supports all link types: derived_from, implements, validates', () => {
    const db = createTestDb()
    const store = new SpecStore(db)

    const spec = store.register({
      projectId: 'test-proj',
      name: 'Design Doc',
      content: '# Architecture',
    })

    const linkTypes = ['derived_from', 'implements', 'validates'] as const
    for (const lt of linkTypes) {
      store.linkNode(spec.id, `node-${lt}`, `Section ${lt}`, lt)
    }

    const links = store.getLinksForSpec(spec.id)
    expect(links.length).toBe(3)
    const types = links.map((l) => l.link_type).sort()
    expect(types).toEqual(['derived_from', 'implements', 'validates'])
  })

  it('returns empty history for non-existent spec', () => {
    const db = createTestDb()
    const store = new SpecStore(db)
    expect(store.getHistory('nonexistent')).toEqual([])
  })

  it('returns empty links for node with no specs', () => {
    const db = createTestDb()
    const store = new SpecStore(db)
    expect(store.getLinksForNode('nonexistent')).toEqual([])
  })

  it('specSyncStatus returns synced when content hash matches', async () => {
    const { specSyncStatus } = await import('../core/spec-evolution/sync-engine.js')
    const db = createTestDb()
    const store = new SpecStore(db)

    const spec = store.register({
      projectId: 'test-proj',
      name: 'API Spec',
      content: '# API v1',
    })

    expect(specSyncStatus(store, spec.id, '# API v1')).toBe('synced')
  })

  it('specSyncStatus returns stale when content matches an older version', async () => {
    const { specSyncStatus } = await import('../core/spec-evolution/sync-engine.js')
    const db = createTestDb()
    const store = new SpecStore(db)

    const spec = store.register({
      projectId: 'test-proj',
      name: 'API Spec',
      content: '# API v1',
    })
    syncSpecToGraph(store, spec.id, '# API v2')

    expect(specSyncStatus(store, spec.id, '# API v1')).toBe('stale')
  })

  it('specSyncStatus returns diverged for unknown content', async () => {
    const { specSyncStatus } = await import('../core/spec-evolution/sync-engine.js')
    const db = createTestDb()
    const store = new SpecStore(db)

    const spec = store.register({
      projectId: 'test-proj',
      name: 'API Spec',
      content: '# API v1',
    })

    expect(specSyncStatus(store, spec.id, '# Completely different')).toBe('diverged')
  })

  it('specSyncStatus returns unknown for non-existent spec', async () => {
    const { specSyncStatus } = await import('../core/spec-evolution/sync-engine.js')
    const db = createTestDb()
    const store = new SpecStore(db)

    expect(specSyncStatus(store, 'nonexistent', '# content')).toBe('unknown')
  })
})
