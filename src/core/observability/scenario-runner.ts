/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * ScenarioRunner — Deterministic agent simulation testing.
 *
 * Implements Mutation Testing (DeMillo, Lipton & Sayward, 1978) +
 * informal Model Checking: each scenario verifies an explicit property
 * of the agent's behavior against a constructed state.
 *
 * Scenarios run against real :memory: SQLite — NO mocks.
 *
 * Layer: L3_PropertyBased (invariant verification).
 */

import type Database from 'better-sqlite3'
import { createDatabase } from '../store/database-factory.js'
import { runMigrations } from '../store/migrations.js'
import { createLogger } from '../utils/logger.js'
import { now } from '../utils/time.js'

const log = createLogger({ layer: 'core', source: 'scenario-runner.ts' })

// ── Interfaces ─────────────────────────────────────────

export interface ScenarioSetup {
  /** SQL statements to populate initial state. */
  seedSql: string[]
}

export interface ScenarioStep {
  /** Description of the action. */
  action: string
  /** Function that executes the step against the DB. Returns arbitrary result. */
  execute: (db: Database.Database) => unknown
}

export interface ScenarioAssertion {
  /** Which step this assertion runs after (0-based). */
  afterStep: number
  /** Human-readable description of what's being checked. */
  description: string
  /** Assertion function — throw to fail. */
  check: (db: Database.Database, stepResult: unknown) => void
}

export interface Scenario {
  name: string
  description: string
  /** Formal property being verified (human-readable). */
  property: string
  setup: ScenarioSetup
  steps: ScenarioStep[]
  assertions: ScenarioAssertion[]
}

export interface AssertionFailure {
  stepIndex: number
  description: string
  error: string
}

export interface ScenarioResult {
  name: string
  passed: boolean
  failedAssertions: AssertionFailure[]
  stepsExecuted: number
  durationMs: number
}

// ── ScenarioRunner ─────────────────────────────────────

export class ScenarioRunner {
  /**
   * Run a scenario against a fresh :memory: SQLite database.
   * Each scenario gets a clean DB with migrations applied.
   */
  run(scenario: Scenario): ScenarioResult {
    const startTime = performance.now()
    const failedAssertions: AssertionFailure[] = []
    let stepsExecuted = 0

    // Fresh :memory: DB with all migrations
    const db = createDatabase(':memory:')
    runMigrations(db)

    try {
      // Apply setup SQL
      for (const sql of scenario.setup.seedSql) {
        db.exec(sql)
      }

      // Execute steps and check assertions
      const stepResults: unknown[] = []

      for (let i = 0; i < scenario.steps.length; i++) {
        const step = scenario.steps[i]
        if (!step) continue
        let resultValue: unknown

        try {
          resultValue = step.execute(db)
        } catch (err) {
          resultValue = { error: err instanceof Error ? err.message : String(err) }
        }

        stepResults.push(resultValue)
        stepsExecuted++

        // Check assertions for this step
        const relevantAssertions = scenario.assertions.filter((a) => a.afterStep === i)

        for (const assertion of relevantAssertions) {
          try {
            assertion.check(db, resultValue)
          } catch (err) {
            failedAssertions.push({
              stepIndex: i,
              description: assertion.description,
              error: err instanceof Error ? err.message : String(err),
            })
          }
        }
      }
    } finally {
      db.close()
    }

    const durationMs = Math.round(performance.now() - startTime)
    const passed = failedAssertions.length === 0

    log.debug('scenario:completed', {
      name: scenario.name,
      passed,
      stepsExecuted,
      failedCount: failedAssertions.length,
      durationMs,
    })

    return {
      name: scenario.name,
      passed,
      failedAssertions,
      stepsExecuted,
      durationMs,
    }
  }

  /** Run multiple scenarios and return all results. */
  runAll(scenarios: Scenario[]): ScenarioResult[] {
    return scenarios.map((s) => this.run(s))
  }
}

// ── Helper for building seed SQL ───────────────────────

/**
 * Create a minimal project + node for scenario testing.
 * Returns SQL statements to seed the database.
 */
export function seedProjectWithNodes(
  projectId: string,
  nodes: Array<{
    id: string
    title: string
    type?: string
    status?: string
    priority?: number
    parentId?: string
    acceptanceCriteria?: string[]
  }>,
): string[] {
  const timestamp = now()
  const sql: string[] = [
    `INSERT INTO projects (id, name, created_at, updated_at) VALUES ('${projectId}', 'Test Project', '${timestamp}', '${timestamp}')`,
  ]

  for (const node of nodes) {
    const type = node.type ?? 'task'
    const status = node.status ?? 'ready'
    const priority = node.priority ?? 3
    const ac = node.acceptanceCriteria ? `'${JSON.stringify(node.acceptanceCriteria)}'` : 'NULL'
    const parentId = node.parentId ? `'${node.parentId}'` : 'NULL'

    sql.push(
      `INSERT INTO nodes (id, project_id, type, title, status, priority, parent_id, acceptance_criteria, created_at, updated_at)
       VALUES ('${node.id}', '${projectId}', '${type}', '${node.title}', '${status}', ${priority}, ${parentId}, ${ac}, '${timestamp}', '${timestamp}')`,
    )
  }

  return sql
}
