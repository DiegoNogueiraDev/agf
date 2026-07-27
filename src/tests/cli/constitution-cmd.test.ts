/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (c) 2026 Diego Lima Nogueira de Paula
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { SqliteStore } from '../../core/store/sqlite-store.js'
import { listConstitutionLines, checkNodeAgainstConstitution } from '../../cli/commands/constitution-cmd.js'

function seed(store: SqliteStore, id: string, title: string, description: string): void {
  const now = new Date().toISOString()
  store.insertNode({
    id,
    type: 'task',
    title,
    description,
    status: 'backlog',
    priority: 3,
    xpSize: 'S',
    parentId: null,
    acceptanceCriteria: [],
    tags: [],
    createdAt: now,
    updatedAt: now,
    metadata: {},
  })
}

describe('constitution-cmd — conectado ao core/constitution', () => {
  let store: SqliteStore

  beforeEach(() => {
    store = SqliteStore.open(':memory:')
    store.initProject('test-project')
  })

  afterEach(() => {
    store.close()
  })

  it('lista os bundles built-in reais e seus princípios', () => {
    const out = listConstitutionLines().join('\n')
    expect(out).toContain('karpathy-baseline')
    expect(out).toContain('Simplicity First')
  })

  it('check retorna CheckNodeResult real para um node existente', () => {
    seed(store, 'n1', 'Add login form', 'Simple login with email and password')
    const result = checkNodeAgainstConstitution(store, 'n1')
    expect(result).not.toBeNull()
    expect(result!.nodeId).toBe('n1')
    expect(result!.principlesChecked).toBeGreaterThanOrEqual(1)
    expect(result!.passRate).toBeGreaterThanOrEqual(0)
    expect(result!.passRate).toBeLessThanOrEqual(100)
  })

  it('check retorna null para node inexistente', () => {
    expect(checkNodeAgainstConstitution(store, 'fantasma')).toBeNull()
  })
})
