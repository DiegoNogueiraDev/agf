/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (c) 2026 Diego Lima Nogueira de Paula
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { SqliteStore } from '../../core/store/sqlite-store.js'
import { instantiateTemplate, listTemplates, type TaskTemplate } from '../../core/templates/template-engine.js'
import { SpecStore } from '../../core/spec-evolution/spec-store.js'
import { specSyncStatus } from '../../core/spec-evolution/sync-engine.js'

describe('Parte B — órfãos conectados à espinha', () => {
  let store: SqliteStore

  beforeEach(() => {
    store = SqliteStore.open(':memory:')
    store.initProject('p')
  })
  afterEach(() => store.close())

  it('templates: registrar (milestone) → listar → instanciar nodes', () => {
    const def: TaskTemplate = {
      name: 'crud-feature',
      nodeDefinitions: [
        { type: 'task', titleTemplate: 'Implementar {{entity}} API' },
        { type: 'task', titleTemplate: 'Testar {{entity}}' },
      ],
    }
    const now = new Date().toISOString()
    store.insertNode({
      id: 'tmpl1',
      type: 'milestone',
      title: 'crud-feature',
      description: 'template',
      status: 'backlog',
      priority: 3,
      xpSize: 'M',
      parentId: null,
      acceptanceCriteria: [],
      tags: [],
      createdAt: now,
      updatedAt: now,
      metadata: { templateDefinition: def },
    } as never)

    const templates = listTemplates(store)
    expect(templates.some((t) => t.name === 'crud-feature')).toBe(true)

    const result = instantiateTemplate(store, def, { entity: 'Order' })
    expect(result.nodesCreated.length).toBe(2)
    const titles = result.nodesCreated.map((id) => store.getNodeById(id)?.title)
    expect(titles).toContain('Implementar Order API')
  })

  it('spec-evolution: register → list (raw) → status sincronizado', () => {
    const specStore = new SpecStore(store.getDb())
    const pid = store.getProject()!.id
    const spec = specStore.register({ projectId: pid, name: 'PRD.md', content: '# Vision\nfoo' })
    expect(spec.id).toBeTruthy()

    const rows = store.getDb().prepare('SELECT id, name FROM spec_documents WHERE project_id = ?').all(pid) as Array<{
      id: string
      name: string
    }>
    expect(rows.length).toBe(1)
    expect(rows[0].name).toBe('PRD.md')

    const status = specSyncStatus(specStore, spec.id, '# Vision\nfoo')
    expect(status).toBeDefined()
  })
})
