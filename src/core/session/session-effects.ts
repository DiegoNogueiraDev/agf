/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * Real durable effects for session commands (the diagram's `comandos ↓` made
 * durable). Wires the DispatchEffects hooks to the existing worker-state and
 * session-state stores — no parallel runtime, no schema changes.
 */

import { mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { WorkerStateStore } from '../worker-state/worker-state-store.js'
import type { PermissionMode } from '../worker-state/worker-state-schema.js'
import { loadSession, saveSession, type SessionState } from './session-state.js'
import type { DispatchEffects } from './session-command.js'

export interface SessionEffectsOptions {
  cwd: string
  /** Override the session-state file path (defaults to <cwd>/.mcp-graph/session-state.json). */
  sessionStatePath?: string
  clock?: () => Date
}

const DEFAULT_STATE: SessionState = {
  version: 2,
  approvalState: { pendingApproval: false, approvedActions: [] },
  planState: { currentPlan: null, planHistory: [] },
  workspaceState: { files: [], lastSave: 0 },
}

/** Build the real DispatchEffects backed by worker-state + session-state. */
export function createSessionEffects(opts: SessionEffectsOptions): DispatchEffects {
  const sessionStatePath = opts.sessionStatePath ?? join(opts.cwd, '.mcp-graph', 'session-state.json')
  const clock = opts.clock ?? ((): Date => new Date())

  return {
    persistMode(mode: PermissionMode): void {
      const store = new WorkerStateStore(opts.cwd)
      const current = store.read()
      if (!current) return // no active worker to update — durable no-op
      store.write({ ...current, permission_mode: mode, last_turn_at: clock().toISOString() })
    },

    resolveApproval(requestId: string): void {
      const current = loadSession(sessionStatePath) ?? {
        ...DEFAULT_STATE,
        workspaceState: { files: [], lastSave: clock().getTime() },
      }
      mkdirSync(dirname(sessionStatePath), { recursive: true })
      saveSession(sessionStatePath, {
        ...current,
        approvalState: {
          pendingApproval: false,
          approvedActions: [...current.approvalState.approvedActions, { action: 'approve', path: requestId }],
        },
      })
    },
  }
}
