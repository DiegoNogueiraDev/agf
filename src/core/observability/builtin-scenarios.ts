/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * Wires ScenarioRunner (T6 Mutation Testing, DeMillo et al. 1978) into a
 * concrete self-check suite: verifies the status-flow-checker's core
 * heuristic (createdAt === updatedAt ⇒ the status update bypassed the
 * store API) holds against real :memory: SQLite, no mocks.
 *
 * Composes with: scenario-runner.ts (seedProjectWithNodes) and the same
 * heuristic asserted in status-flow-checker.ts.
 */

import type { Scenario } from './scenario-runner.js'
import { seedProjectWithNodes } from './scenario-runner.js'
import { OperationError } from '../utils/errors.js'

interface NodeTimestamps {
  created_at: string
  updated_at: string
}

function readTimestamps(db: import('better-sqlite3').Database, nodeId: string): NodeTimestamps {
  const row = db.prepare('SELECT created_at, updated_at FROM nodes WHERE id = ?').get(nodeId) as
    NodeTimestamps | undefined
  if (!row) throw new OperationError(`node ${nodeId} not found`)
  return row
}

/** Built-in ScenarioRunner suite — real-DB regression checks for status-flow invariants. */
export function buildBuiltinScenarios(): Scenario[] {
  return [
    {
      name: 'done-task-requires-status-transition',
      description: 'A raw-SQL shortcut to done leaves created_at === updated_at, the bypass signature',
      property: 'checkStatusFlow flags nodes where updatedAt === createdAt as a shortcut violation',
      setup: {
        seedSql: seedProjectWithNodes('proj_scenario_shortcut', [
          { id: 'node_shortcut', title: 'Shortcut task', status: 'backlog' },
        ]),
      },
      steps: [
        {
          action: 'bypass the store API — UPDATE status directly, without touching updated_at',
          execute: (db) => {
            db.prepare("UPDATE nodes SET status = 'done' WHERE id = 'node_shortcut'").run()
            return null
          },
        },
      ],
      assertions: [
        {
          afterStep: 0,
          description: 'created_at and updated_at remain equal — the bypass signature',
          check: (db) => {
            const { created_at, updated_at } = readTimestamps(db, 'node_shortcut')
            if (created_at !== updated_at) {
              throw new OperationError(
                `expected created_at === updated_at after a raw-SQL bypass, got ${created_at} vs ${updated_at}`,
              )
            }
          },
        },
      ],
    },
    {
      name: 'proper-transition-updates-timestamp',
      description: 'A normal in_progress → done flow bumps updated_at, leaving a footprint',
      property: 'checkStatusFlow does not flag nodes that transitioned through the store API',
      setup: {
        seedSql: seedProjectWithNodes('proj_scenario_proper', [
          { id: 'node_proper', title: 'Proper task', status: 'backlog' },
        ]),
      },
      steps: [
        {
          action: 'transition to in_progress with a bumped updated_at',
          execute: (db) => {
            db.prepare(
              "UPDATE nodes SET status = 'in_progress', updated_at = '2026-01-15T10:01:00.000Z' WHERE id = 'node_proper'",
            ).run()
            return null
          },
        },
        {
          action: 'transition to done with a further bumped updated_at',
          execute: (db) => {
            db.prepare(
              "UPDATE nodes SET status = 'done', updated_at = '2026-01-15T10:02:00.000Z' WHERE id = 'node_proper'",
            ).run()
            return null
          },
        },
      ],
      assertions: [
        {
          afterStep: 1,
          description: 'created_at and updated_at differ — the store API footprint',
          check: (db) => {
            const { created_at, updated_at } = readTimestamps(db, 'node_proper')
            if (created_at === updated_at) {
              throw new OperationError('expected created_at !== updated_at after a proper transition')
            }
          },
        },
      ],
    },
  ]
}
