import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import Database from 'better-sqlite3'
import { PluginStore, type InstallPluginParams, type PluginRow } from '../../core/plugins/plugin-store.js'

describe('PluginStore', () => {
  let db: Database.Database
  let store: PluginStore

  beforeAll(() => {
    db = new Database(':memory:')
    db.exec(`
      CREATE TABLE IF NOT EXISTS plugins (
        name TEXT NOT NULL,
        project_id TEXT NOT NULL,
        version TEXT NOT NULL,
        path TEXT NOT NULL,
        enabled INTEGER NOT NULL DEFAULT 1,
        config TEXT,
        installed_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        PRIMARY KEY (project_id, name)
      )
    `)
    store = new PluginStore(db)
  })

  afterAll(() => {
    db.close()
  })

  it('install() adds a plugin row', () => {
    store.install({ projectId: 'proj-1', name: 'p1', version: '1.0.0', path: '/plugins/p1' })
    const row = store.get('proj-1', 'p1')
    expect(row).toBeDefined()
    expect(row!.name).toBe('p1')
    expect(row!.version).toBe('1.0.0')
    expect(row!.path).toBe('/plugins/p1')
  })

  it('install() persists config as JSON', () => {
    store.install({
      projectId: 'proj-1',
      name: 'p2',
      version: '2.0.0',
      path: '/plugins/p2',
      config: { key: 'val', num: 42 },
    })
    const row = store.get('proj-1', 'p2')
    expect(row!.config).toEqual({ key: 'val', num: 42 })
  })

  it('install() replaces an existing plugin with same projectId+name', () => {
    store.install({ projectId: 'proj-1', name: 'p1', version: '1.0.0', path: '/plugins/p1' })
    store.install({ projectId: 'proj-1', name: 'p1', version: '2.0.0', path: '/plugins/p1-v2' })
    const row = store.get('proj-1', 'p1')
    expect(row!.version).toBe('2.0.0')
  })

  it('remove() deletes the plugin row', () => {
    store.install({ projectId: 'proj-2', name: 'to-remove', version: '1.0.0', path: '/tmp' })
    store.remove('proj-2', 'to-remove')
    expect(store.get('proj-2', 'to-remove')).toBeUndefined()
  })

  it('list() returns all plugins for a project ordered by name', () => {
    store.install({ projectId: 'proj-3', name: 'b', version: '1.0.0', path: '/plugins/b' })
    store.install({ projectId: 'proj-3', name: 'a', version: '1.0.0', path: '/plugins/a' })
    const rows = store.list('proj-3')
    expect(rows).toHaveLength(2)
    expect(rows[0].name).toBe('a')
    expect(rows[1].name).toBe('b')
  })

  it('list() returns empty array when no plugins exist', () => {
    expect(store.list('proj-empty')).toEqual([])
  })

  it('setEnabled() toggles enabled status', () => {
    store.install({ projectId: 'proj-4', name: 'toggle', version: '1.0.0', path: '/plugins/toggle' })
    store.setEnabled('proj-4', 'toggle', false)
    expect(store.get('proj-4', 'toggle')!.enabled).toBe(0)
    store.setEnabled('proj-4', 'toggle', true)
    expect(store.get('proj-4', 'toggle')!.enabled).toBe(1)
  })

  it('listEnabled() returns only enabled plugins', () => {
    store.install({ projectId: 'proj-5', name: 'enabled-p', version: '1.0.0', path: '/plugins/e', config: {} })
    store.install({ projectId: 'proj-5', name: 'disabled-p', version: '1.0.0', path: '/plugins/d' })
    store.setEnabled('proj-5', 'disabled-p', false)
    const enabled = store.listEnabled('proj-5')
    expect(enabled).toHaveLength(1)
    expect(enabled[0].name).toBe('enabled-p')
  })

  it('get() returns undefined for missing plugin', () => {
    expect(store.get('proj-none', 'no-plugin')).toBeUndefined()
  })
})
