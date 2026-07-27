/*!
 * Task node_56beedcb2ec5 — plan template store.
 *
 * AC1: GIVEN completed execution, WHEN template extracted, THEN stored with:
 *      task_type, ac_pattern, solution_approach, tokens_used
 * AC2: GIVEN agf cache plan-store list, WHEN executed, THEN shows templates with metadata
 */

import { describe, it, expect, beforeEach } from 'vitest'
import Database from 'better-sqlite3'
import { SqliteStore } from '../core/store/sqlite-store.js'
import { savePlanTemplate, listPlanTemplates, type PlanTemplate } from '../core/cache/plan-template-store.js'

function openStore(): SqliteStore {
  const store = SqliteStore.open(':memory:')
  store.initProject('test')
  return store
}

describe('plan-template-store', () => {
  let db: Database.Database

  beforeEach(() => {
    db = openStore().getDb()
  })

  it('saves and retrieves a template with required fields (AC1)', () => {
    const tpl: Omit<PlanTemplate, 'id' | 'createdAt'> = {
      taskType: 'feature',
      acPattern: 'Given X, When Y, Then Z',
      solutionApproach: 'use DIP with port/adapter',
      tokensUsed: 1200,
    }
    savePlanTemplate(db, tpl)
    const list = listPlanTemplates(db)
    expect(list).toHaveLength(1)
    expect(list[0].taskType).toBe('feature')
    expect(list[0].acPattern).toBe(tpl.acPattern)
    expect(list[0].solutionApproach).toBe(tpl.solutionApproach)
    expect(list[0].tokensUsed).toBe(1200)
  })

  it('list returns all stored templates with metadata (AC2)', () => {
    savePlanTemplate(db, { taskType: 'bug', acPattern: 'a', solutionApproach: 'b', tokensUsed: 500 })
    savePlanTemplate(db, { taskType: 'refactor', acPattern: 'c', solutionApproach: 'd', tokensUsed: 700 })
    const list = listPlanTemplates(db)
    expect(list).toHaveLength(2)
    for (const t of list) {
      expect(typeof t.id).toBe('string')
      expect(typeof t.createdAt).toBe('string')
    }
  })

  it('handles empty list when no templates exist', () => {
    expect(listPlanTemplates(db)).toHaveLength(0)
  })
})
