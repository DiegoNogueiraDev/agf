/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { SqliteStore } from '../core/store/sqlite-store.js'
import { instantiateTemplate, listTemplates } from '../core/templates/template-engine.js'
import type { TaskTemplate } from '../core/templates/template-engine.js'

describe('instantiateTemplate', () => {
  let store: SqliteStore

  beforeEach(() => {
    store = SqliteStore.open(':memory:')
    store.initProject('test-project')
  })

  afterEach(() => {
    store.close()
  })

  it('creates nodes from template node definitions', () => {
    const template: TaskTemplate = {
      name: 'basic-feature',
      nodeDefinitions: [
        { type: 'task', titleTemplate: 'Implement {{feature}}', acceptanceCriteria: ['AC: {{feature}} works'] },
        { type: 'subtask', titleTemplate: 'Test {{feature}}' },
      ],
    }
    const result = instantiateTemplate(store, template, { feature: 'login' })
    expect(result.nodesCreated).toHaveLength(2)
    expect(result.errors).toHaveLength(0)
  })

  it('substitutes variables in title templates', () => {
    const template: TaskTemplate = {
      name: 'var-sub',
      nodeDefinitions: [{ type: 'task', titleTemplate: 'Build {{component}} for {{project}}' }],
    }
    const result = instantiateTemplate(store, template, { component: 'Button', project: 'UI' })
    expect(result.nodesCreated).toHaveLength(1)
    expect(result.errors).toHaveLength(0)
    // Verify the node was actually inserted
    const node = store.getNodeById(result.nodesCreated[0])
    expect(node?.title).toBe('Build Button for UI')
  })

  it('throws when template has no node definitions', () => {
    const template: TaskTemplate = { name: 'empty', nodeDefinitions: [] }
    expect(() => instantiateTemplate(store, template, {})).toThrow()
  })

  it('creates parent-child edges when parentId is provided', () => {
    const parentResult = instantiateTemplate(
      store,
      {
        name: 'parent',
        nodeDefinitions: [{ type: 'task', titleTemplate: 'Parent task' }],
      },
      {},
    )
    const parentId = parentResult.nodesCreated[0]

    const childResult = instantiateTemplate(
      store,
      {
        name: 'child',
        nodeDefinitions: [{ type: 'subtask', titleTemplate: 'Child task' }],
      },
      {},
      parentId,
    )

    expect(childResult.nodesCreated).toHaveLength(1)
    expect(childResult.edgesCreated.length).toBeGreaterThan(0)
  })
})

describe('listTemplates', () => {
  let store: SqliteStore

  beforeEach(() => {
    store = SqliteStore.open(':memory:')
    store.initProject('test-project')
  })

  afterEach(() => {
    store.close()
  })

  it('returns empty array when no milestone templates exist', () => {
    const templates = listTemplates(store)
    expect(Array.isArray(templates)).toBe(true)
    expect(templates).toHaveLength(0)
  })
})
