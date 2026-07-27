import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import Database from 'better-sqlite3'
import { createPermissionStore, type PermissionRow } from '../core/permissions/permission-store.js'

describe('PermissionStore — SQLite CRUD', () => {
  let db: Database.Database
  let store: ReturnType<typeof createPermissionStore>

  beforeAll(() => {
    db = new Database(':memory:')
    store = createPermissionStore(db)
  })

  afterAll(() => {
    db.close()
  })

  it('tabela criada automaticamente', () => {
    const tableInfo = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='permissions'").get()
    expect(tableInfo).toBeDefined()
  })

  it('save insere regra', () => {
    store.save({ projectId: 'proj-1', action: 'read', resource: 'file:*', effect: 'allow' })
    const rows = store.list('proj-1')
    expect(rows).toHaveLength(1)
    expect(rows[0].action).toBe('read')
  })

  it('unique constraint (project_id, action, resource) evita duplicatas', () => {
    store.save({ projectId: 'proj-2', action: 'write', resource: 'file:*', effect: 'allow' })
    store.save({ projectId: 'proj-2', action: 'write', resource: 'file:*', effect: 'deny' })
    const rows = store.list('proj-2')
    expect(rows).toHaveLength(1)
    expect(rows[0].effect).toBe('deny')
  })

  it('delete remove regra especifica', () => {
    store.save({ projectId: 'proj-3', action: 'read', resource: 'file:secret/*', effect: 'deny' })
    store.delete('proj-3', 'read', 'file:secret/*')
    const rows = store.list('proj-3')
    expect(rows).toHaveLength(0)
  })

  it('list filtra por projectId', () => {
    store.save({ projectId: 'proj-a', action: 'read', resource: '*', effect: 'allow' })
    store.save({ projectId: 'proj-b', action: 'write', resource: '*', effect: 'deny' })
    expect(store.list('proj-a')).toHaveLength(1)
    expect(store.list('proj-b')).toHaveLength(1)
    expect(store.list('proj-a')[0].effect).toBe('allow')
  })

  it('check verifica se regra existe', () => {
    store.save({ projectId: 'proj-4', action: 'shell', resource: '*', effect: 'deny' })
    expect(store.check('proj-4', 'shell', '*')).toBe(true)
    expect(store.check('proj-4', 'shell', '*.exe')).toBe(false)
  })
})
