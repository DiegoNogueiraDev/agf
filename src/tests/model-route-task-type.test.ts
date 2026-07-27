/*!
 * Task node_45f9b3e8d571 — agf model route --task-type
 *
 * AC1: GIVEN `agf model route --task-type implement` WHEN executed
 *      THEN output includes: recommended_model, confidence, estimated_cost
 * AC2: GIVEN routing decision WHEN registered
 *      THEN ledger contains: task_type, model_selected, confidence, actual_cost
 */

import { describe, it, expect } from 'vitest'
import Database from 'better-sqlite3'
import {
  routeTaskType,
  saveRoutingDecision,
  listRoutingDecisions,
  type RoutingDecision,
} from '../core/model-hub/task-type-router.js'

function openDb(): Database.Database {
  return new Database(':memory:')
}

describe('task-type-router', () => {
  it('returns recommended_model, confidence, estimated_cost for implement (AC1)', () => {
    const db = openDb()
    const result = routeTaskType(db, 'implement')
    expect(typeof result.recommended_model).toBe('string')
    expect(result.recommended_model.length).toBeGreaterThan(0)
    expect(typeof result.confidence).toBe('number')
    expect(result.confidence).toBeGreaterThanOrEqual(0)
    expect(result.confidence).toBeLessThanOrEqual(1)
    expect(typeof result.estimated_cost).toBe('number')
    expect(result.estimated_cost).toBeGreaterThanOrEqual(0)
  })

  it('saves routing decision to ledger and retrieves it (AC2)', () => {
    const db = openDb()
    const decision: RoutingDecision = {
      taskType: 'implement',
      modelSelected: 'claude-sonnet-4-6',
      confidence: 0.75,
      actualCost: 0.0012,
    }
    saveRoutingDecision(db, decision)
    const rows = listRoutingDecisions(db)
    expect(rows).toHaveLength(1)
    expect(rows[0].taskType).toBe('implement')
    expect(rows[0].modelSelected).toBe('claude-sonnet-4-6')
    expect(rows[0].confidence).toBe(0.75)
    expect(rows[0].actualCost).toBe(0.0012)
  })

  it('handles unknown task type gracefully', () => {
    const db = openDb()
    const result = routeTaskType(db, 'unknown_task_xyz')
    expect(typeof result.recommended_model).toBe('string')
    expect(result.confidence).toBeGreaterThanOrEqual(0)
  })
})
