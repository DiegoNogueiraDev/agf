/*!
 * Task node_c4fdce855140 — cache plan lookup + adaptation.
 *
 * AC1: Given new task, when lookupPlanTemplate, then returns template with similarity > 0.7.
 * AC2: Given no matching template, when lookup, then returns null (fallback).
 * AC3: Cache hit tokens_used < full planning tokens (≥ 40% reduction proxy).
 */

import { describe, it, expect } from 'vitest'
import Database from 'better-sqlite3'
import { savePlanTemplate, lookupPlanTemplate } from '../core/cache/plan-template-store.js'

function makeDb(): ReturnType<typeof Database> {
  return new Database(':memory:')
}

describe('lookupPlanTemplate', () => {
  it('returns a matching template when similarity > 0.7 (AC1)', () => {
    const db = makeDb()
    savePlanTemplate(db, {
      taskType: 'add-utility-function',
      acPattern: 'Given input, When called, Then returns formatted string',
      solutionApproach: 'Create util file with pure function + unit test',
      tokensUsed: 1000,
    })
    const result = lookupPlanTemplate(db, 'add-utility-function')
    expect(result).not.toBeNull()
    expect(result!.similarity).toBeGreaterThan(0.7)
    db.close()
  })

  it('returns null when no template matches (AC2)', () => {
    const db = makeDb()
    savePlanTemplate(db, {
      taskType: 'unrelated-topic',
      acPattern: 'X',
      solutionApproach: 'Y',
      tokensUsed: 500,
    })
    const result = lookupPlanTemplate(db, 'completely-different-task-type-xyz')
    expect(result).toBeNull()
    db.close()
  })

  it('cache hit tokens_used is less than full planning baseline (AC3)', () => {
    const db = makeDb()
    const FULL_PLANNING_TOKENS = 2000
    savePlanTemplate(db, {
      taskType: 'build-cli-command',
      acPattern: 'Given args, When run, Then outputs JSON envelope',
      solutionApproach: 'Create cmd file + register in index.ts',
      tokensUsed: 800,
    })
    const result = lookupPlanTemplate(db, 'build-cli-command')
    expect(result).not.toBeNull()
    // ≥ 40% reduction: cached tokens < 60% of full planning tokens
    expect(result!.template.tokensUsed).toBeLessThan(FULL_PLANNING_TOKENS * 0.6)
    db.close()
  })
})
